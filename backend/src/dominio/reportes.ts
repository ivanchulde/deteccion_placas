import { leerPeriodoReporte } from './periodo';
import { type Validado, validarEntero, validarTexto } from './validacion';

/**
 * Reportes del sistema (dominio puro): los tres reportes de Reportes —vehículos que más
 * ingresan, estado del sistema y auditoría—, sus parámetros y el análisis que no depende de la
 * base: los hallazgos con su recomendación, las verificaciones del sistema y la clasificación de
 * vehículos y acciones. Las consultas viven en infraestructura/persistencia/reportesSql.ts y el
 * armado en aplicacion/reportes.ts.
 *
 * Cada reporte se entrega como datos: cifras, hallazgos, gráficos de barras horizontales y tablas
 * con columnas tipadas. El navegador lo muestra como documento imprimible (con las fotos) y el
 * servidor lo exporta a Excel con las mismas tablas.
 */

export type CategoriaReporte = 'operacion' | 'sistema' | 'auditoria';

export const CATEGORIAS: Record<CategoriaReporte, string> = {
  operacion: 'Operación de la garita',
  sistema: 'Estado del sistema',
  auditoria: 'Auditoría',
};

export type TipoParametro = 'camara' | 'entero' | 'texto' | 'opcion';

export interface ParametroReporte {
  clave: string;
  etiqueta: string;
  tipo: TipoParametro;
  omision?: number | string;
  min?: number;
  max?: number;
  requerido?: boolean;
  opciones?: { valor: string; etiqueta: string }[];
  ayuda?: string;
  unidad?: string;
}

export interface DefinicionReporte {
  id: string;
  categoria: CategoriaReporte;
  titulo: string;
  descripcion: string;
  /** El reporte pide un período (por omisión, los últimos `diasOmision` días) */
  periodo: boolean;
  diasOmision?: number;
  parametros: ParametroReporte[];
}

export type TipoColumna = 'texto' | 'numero' | 'porcentaje' | 'fecha_hora' | 'fecha' | 'duracion' | 'placa' | 'imagen';

export interface Columna { clave: string; titulo: string; tipo?: TipoColumna }

export interface Seccion {
  titulo: string;
  nota?: string;
  columnas: Columna[];
  filas: Record<string, unknown>[];
  /** Filas que cumplen el reporte (puede ser mayor que filas.length si se recortó) */
  total: number;
}

/** Hallazgo del análisis: `alerta` y `atencion` piden actuar; `ok` confirma que algo está bien. */
export type NivelHallazgo = 'alerta' | 'atencion' | 'info' | 'ok';
export interface Hallazgo { nivel: NivelHallazgo; texto: string; recomendacion?: string }

/** Gráfico de barras horizontales (una sola serie): etiqueta, valor y un detalle para el tooltip. */
export interface Grafico {
  titulo: string;
  unidad: string;
  /** Escala fija (100 para porcentajes); sin ella, la barra más larga es el máximo */
  maximo?: number;
  barras: { etiqueta: string; valor: number; detalle?: string }[];
}

export interface Reporte {
  tipo: string;
  categoria: CategoriaReporte;
  titulo: string;
  descripcion: string;
  generado: string;
  parametros: [string, string][];
  resumen: [string, string][];
  hallazgos: Hallazgo[];
  graficos: Grafico[];
  avisos: string[];
  secciones: Seccion[];
}

export const CATALOGO: readonly DefinicionReporte[] = [
  {
    id: 'vehiculos-frecuentes', categoria: 'operacion', titulo: 'Vehículos que más ingresan', periodo: true, diasOmision: 30,
    descripcion: 'Todos los vehículos que ingresaron, ordenados por cuántas veces lo hicieron, con su titular, datos del vehículo y fotos; '
      + 'las marcas, tipos, colores, instituciones y horas que más ingresan, y lo que conviene revisar.',
    parametros: [
      { clave: 'camara', etiqueta: 'Cámara', tipo: 'camara' },
      { clave: 'situacion', etiqueta: 'Situación', tipo: 'opcion', omision: '', opciones: [
        { valor: '', etiqueta: 'Todos los vehículos' }, { valor: 'blanca', etiqueta: 'Con permiso (lista blanca)' },
        { valor: 'sin_permiso', etiqueta: 'Sin permiso' }, { valor: 'negra', etiqueta: 'Lista negra' }] },
      { clave: 'buscar', etiqueta: 'Placa, nombre o cédula', tipo: 'texto', max: 60, ayuda: 'Opcional: solo los vehículos que coinciden' },
      { clave: 'minimo', etiqueta: 'Ingresos mínimos', tipo: 'entero', omision: 1, min: 1, max: 1000 },
    ],
  },
  {
    id: 'estado-sistema', categoria: 'sistema', titulo: 'Estado del sistema', periodo: true, diasOmision: 7,
    descripcion: 'Verificación de cámaras, motor ANPR, base de datos, almacenamiento, correo y operación: qué funciona, qué falla, '
      + 'disponibilidad y tasa de lectura de cada cámara, y qué hacer en cada caso.',
    parametros: [],
  },
  {
    id: 'auditoria', categoria: 'auditoria', titulo: 'Auditoría', periodo: true, diasOmision: 30,
    descripcion: 'Quién hizo qué y cuándo: acciones por usuario y tipo, acciones sensibles (eliminaciones, correcciones, exportaciones, '
      + 'configuración y cuentas), actividad fuera de horario e inicios de sesión fallidos.',
    parametros: [
      { clave: 'usuario', etiqueta: 'Usuario', tipo: 'texto', max: 100, ayuda: 'Nombre o correo (opcional)' },
    ],
  },
];

export const definicionReporte = (id: unknown): DefinicionReporte | null => CATALOGO.find(r => r.id === id) ?? null;

export interface ParametrosLeidos {
  desde: Date | null;
  hasta: Date | null;
  /** Valor de cada parámetro declarado (null si no se indicó y no tiene valor por omisión) */
  valores: Record<string, number | string | null>;
}

/**
 * Valida la consulta del reporte: período (si lo pide) y cada parámetro declarado. Sin fechas, los
 * últimos `diasOmision` días hasta ahora, desde el inicio del día local (`inicioDia`).
 */
export function leerParametros(def: DefinicionReporte, consulta: Record<string, unknown>,
  ahora: Date, inicioDia: (fecha: Date, dias: number) => Date): Validado<ParametrosLeidos> {
  let desde: Date | null = null;
  let hasta: Date | null = null;
  if (def.periodo) {
    const p = leerPeriodoReporte({ desde: consulta.desde, hasta: consulta.hasta },
      { desde: inicioDia(ahora, -((def.diasOmision ?? 7) - 1)), hasta: ahora });
    if (!p.ok) return p;
    ({ desde, hasta } = p.valor);
  }
  const valores: ParametrosLeidos['valores'] = {};
  for (const p of def.parametros) {
    const bruto = consulta[p.clave];
    if (p.tipo === 'camara' || p.tipo === 'entero') {
      const v = validarEntero(bruto, { etiqueta: p.etiqueta, min: p.tipo === 'camara' ? 1 : p.min, max: p.tipo === 'camara' ? 2_147_483_647 : p.max, requerido: p.requerido });
      if (!v.ok) return v;
      valores[p.clave] = v.valor ?? (typeof p.omision === 'number' ? p.omision : null);
    } else if (p.tipo === 'texto') {
      const v = validarTexto(bruto, { etiqueta: p.etiqueta, tipo: 'libre', max: p.max ?? 100, requerido: p.requerido });
      if (!v.ok) return v;
      valores[p.clave] = v.valor;
    } else {
      const texto = bruto === undefined || bruto === null ? String(p.omision ?? '') : String(bruto);
      if (!p.opciones?.some(o => o.valor === texto)) return { ok: false, error: `${p.etiqueta}: opción no válida.` };
      valores[p.clave] = texto;
    }
  }
  return { ok: true, valor: { desde, hasta, valores } };
}

// ─── Cálculos ────────────────────────────────────────────────────────────────

export interface Estadisticas { n: number; media: number; mediana: number; p90: number; maximo: number }

/** Media, mediana, percentil 90 y máximo (null sin datos). */
export function estadisticas(valores: number[]): Estadisticas | null {
  const v = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const percentil = (p: number) => {
    const i = (v.length - 1) * p;
    const a = Math.floor(i);
    return v[a] + (v[Math.min(a + 1, v.length - 1)] - v[a]) * (i - a);
  };
  return { n: v.length, media: v.reduce((s, x) => s + x, 0) / v.length, mediana: percentil(0.5), p90: percentil(0.9), maximo: v[v.length - 1] };
}

/** Minutos como texto legible: «45 min», «2 h 05 min», «3 d 4 h». */
export function textoDuracion(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined || !Number.isFinite(minutos)) return '—';
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

export const porcentaje = (parte: number, total: number): number | null => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);
const pct = (parte: number, total: number) => `${(porcentaje(parte, total) ?? 0).toLocaleString('es-EC')} %`;
const n = (v: number) => v.toLocaleString('es-EC', { maximumFractionDigits: 1 });
const veces = (v: number) => `${n(v)} ${v === 1 ? 'vez' : 'veces'}`;

/** «Toyota», «Gris oscuro», «Ecu 911»: los datos llegan escritos de varias formas (TOYOTA, toyota…). */
export function nombrePropio(texto: string | null | undefined): string {
  const t = (texto ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

/**
 * Clase del vehículo: el motor guarda «automóvil», «motocicleta», «bus» o «camión», y los
 * permisos traen lo que escribió cada persona (SEDAN, JEEP, MOTO…).
 */
export const CLASES_VEHICULO = ['Automóvil', 'Camioneta / SUV', 'Motocicleta', 'Bus', 'Camión', 'Furgoneta / utilitario', 'Otro', 'Sin clasificar'] as const;
export type ClaseVehiculo = typeof CLASES_VEHICULO[number];

export function claseVehiculo(tipo: string | null | undefined): ClaseVehiculo {
  const t = (tipo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  if (!t || t === 'SIN CLASIFICAR') return 'Sin clasificar';
  if (/MOTO|MOCICLETA/.test(t)) return 'Motocicleta';
  if (/\bBUS|BUSETA|AUTOBUS|MICROBUS/.test(t)) return 'Bus';
  if (/CAMION\b|CAMION$|TRUCK|VOLQUETA|TRAILER/.test(t)) return 'Camión';
  if (/CAMIONETA|PICK ?UP|SUV|JEEP|TODO TERRENO|4X4/.test(t)) return 'Camioneta / SUV';
  if (/FURGON|UTILITARIO|VAN\b/.test(t)) return 'Furgoneta / utilitario';
  if (/AUTO|SEDAN|SEDAM|HATCH|HUSH|COUPE|CUPE|VEHICULO|CAR\b|CONFORT|SPORT/.test(t)) return 'Automóvil';
  return 'Otro';
}

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const franjaHora = (h: number) => `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59`;

// ─── Vehículos que más ingresan ──────────────────────────────────────────────

export interface VehiculoFrecuente {
  placa: string;
  nombre: string | null;
  ingresos: number;
  dias: number;
  situacion: string;
  permanencia: number | null;
}

export interface Conteo { valor: string; ingresos: number; vehiculos: number }

export interface DatosVehiculos {
  /** Vehículos del reporte, del que más ingresa al que menos */
  filas: VehiculoFrecuente[];
  /** Totales de todos los vehículos del reporte (no solo los cargados) */
  ingresos: number;
  vehiculos: number;
  unaVez: number;
  marcas: Conteo[];
  clases: Conteo[];
  horas: Conteo[];
  dias: Conteo[];
  diasPeriodo: number;
}

const placaTexto = (p: string) => (/^[A-Z]{3}\d{3,4}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : /^[A-Z]{2}\d{3}[A-Z]$/.test(p) ? `${p.slice(0, 2)}-${p.slice(2)}` : p);
const conNombre = (f: VehiculoFrecuente) => `${placaTexto(f.placa)}${f.nombre ? ` (${f.nombre})` : ''}`;
const mayor = (lista: Conteo[]) => [...lista].sort((a, b) => b.ingresos - a.ingresos)[0];
const lista = (textos: string[], max = 3) => (textos.length <= max ? textos.join(', ') : `${textos.slice(0, max).join(', ')} y ${textos.length - max} más`);

/** Lo que el reporte de vehículos debe destacar, de lo más urgente a lo informativo. */
export function hallazgosVehiculos(d: DatosVehiculos): Hallazgo[] {
  if (!d.vehiculos) return [{ nivel: 'info', texto: 'No hay ingresos con placa en el período y los filtros elegidos.' }];
  const h: Hallazgo[] = [];
  const negra = d.filas.filter(f => f.situacion === 'Lista negra');
  if (negra.length) {
    h.push({ nivel: 'alerta', texto: `${negra.length === 1 ? 'Un vehículo de la lista negra ingresó' : `${negra.length} vehículos de la lista negra ingresaron`}: ${lista(negra.map(f => `${placaTexto(f.placa)} (${veces(f.ingresos)})`))}.`,
      recomendacion: 'Revise cada ingreso y su foto, y confirme que la garita actuó según el protocolo.' });
  }
  const sinPermiso = d.filas.filter(f => f.situacion === 'Sin permiso' && f.ingresos >= 3);
  if (sinPermiso.length) {
    h.push({ nivel: 'atencion', texto: `${sinPermiso.length === 1 ? 'Un vehículo sin permiso ingresó' : `${sinPermiso.length} vehículos sin permiso ingresaron`} 3 veces o más: ${lista(sinPermiso.map(f => `${conNombre(f)} ${veces(f.ingresos)}`))}.`,
      recomendacion: 'Si son vehículos habituales, regístrelos en la lista blanca; si no, revise por qué se les permite el ingreso.' });
  }
  const promedio = d.ingresos / d.vehiculos;
  h.push({ nivel: 'info', texto: d.vehiculos === 1 ? `Ingresó un solo vehículo, ${veces(d.ingresos)}.`
    : `Ingresaron ${n(d.vehiculos)} vehículos distintos con ${n(d.ingresos)} ingresos: ${n(Math.round(promedio * 10) / 10)} ingresos por vehículo en promedio.` });
  const top = d.filas[0];
  if (top) {
    h.push({ nivel: 'info', texto: `${conNombre(top)} es el vehículo que más ingresa: ${n(top.ingresos)} ingresos en ${n(top.dias)} ${top.dias === 1 ? 'día' : 'días'}`
      + `${promedio > 0 && top.ingresos / promedio >= 1.5 ? `, ${n(Math.round((top.ingresos / promedio) * 10) / 10)} veces el promedio` : ''}.` });
  }
  if (d.filas.length >= 10 && d.filas.length === d.vehiculos) {
    let acumulado = 0;
    let k = 0;
    while (k < d.filas.length && acumulado < d.ingresos * 0.8) acumulado += d.filas[k++].ingresos;
    h.push({ nivel: 'info', texto: `${n(k)} vehículos (${pct(k, d.vehiculos)} del total) concentran el 80 % de los ingresos.` });
  }
  const conMarca = d.marcas.filter(m => m.valor !== 'Sin dato');
  const marca = mayor(conMarca);
  if (marca) h.push({ nivel: 'info', texto: `${marca.valor} es la marca que más ingresa: ${n(marca.ingresos)} ingresos (${pct(marca.ingresos, d.ingresos)}) de ${n(marca.vehiculos)} ${marca.vehiculos === 1 ? 'vehículo' : 'vehículos'}.` });
  const sinMarca = d.marcas.find(m => m.valor === 'Sin dato');
  if (sinMarca && sinMarca.ingresos / d.ingresos >= 0.25) {
    h.push({ nivel: 'atencion', texto: `El ${pct(sinMarca.ingresos, d.ingresos)} de los ingresos no tiene la marca del vehículo.`,
      recomendacion: 'Complete la marca en la lista blanca o al autorizar el ingreso para que el análisis sea completo.' });
  }
  const clase = mayor(d.clases.filter(c => c.valor !== 'Sin clasificar'));
  if (clase) h.push({ nivel: 'info', texto: `${clase.valor === 'Camioneta / SUV' ? 'Las camionetas y SUV' : clase.valor === 'Furgoneta / utilitario' ? 'Las furgonetas' : `Los vehículos tipo ${clase.valor.toLowerCase()}`} son el ${pct(clase.ingresos, d.ingresos)} de los ingresos.` });
  const hora = mayor(d.horas);
  const dia = mayor(d.dias);
  if (hora && dia) h.push({ nivel: 'info', texto: `La hora con más ingresos es ${hora.valor} (${n(hora.ingresos)}) y el día, el ${dia.valor.toLowerCase()} (${n(dia.ingresos)}).` });
  if (d.unaVez) h.push({ nivel: 'info', texto: `${d.unaVez === 1 ? 'Un vehículo' : `${n(d.unaVez)} vehículos`} (${pct(d.unaVez, d.vehiculos)}) ${d.unaVez === 1 ? 'ingresó' : 'ingresaron'} una sola vez: visitas ocasionales.` });
  const conPermanencia = d.filas.filter(f => f.permanencia !== null);
  if (conPermanencia.length) {
    const largo = conPermanencia.reduce((a, b) => (b.permanencia! > a.permanencia! ? b : a));
    h.push({ nivel: 'info', texto: `${conNombre(largo)} es el que más tiempo permanece: ${textoDuracion(largo.permanencia)} en promedio por ingreso.` });
  }
  return h;
}

// ─── Estado del sistema ──────────────────────────────────────────────────────

export type EstadoVerificacion = 'ok' | 'atencion' | 'falla';
export interface Verificacion { componente: string; estado: EstadoVerificacion; detalle: string; recomendacion: string }

export interface CamaraSalud {
  nombre: string;
  activa: boolean;
  analisis: boolean;
  conectada: boolean | null;
  videoEnMotor: boolean | null;
  disponibilidad: number | null;
  caidas: number;
  tasaLectura: number | null;
  confianza: number | null;
  pasos: number;
  /** Minutos desde el último paso registrado (null si nunca registró) */
  sinPasosMin: number | null;
}

export interface DatosSalud {
  motor: { en_linea: boolean; detalle: string; cpu: number | null };
  correo: boolean;
  almacenamiento: { usados: number | null; maximo: number | null; libres: number | null };
  camaras: CamaraSalud[];
  pendientes: number;
  pendientesAntiguos: number;
  sinSalida: number;
  porVencer: number;
  vencidos: number;
  diasAviso: number;
  usuariosPendientes: number;
  usuariosBloqueados: number;
}

const GB = 1024 ** 3;

/** Cada componente con su estado y qué hacer: la parte «inteligente» del estado del sistema. */
export function verificacionesSistema(d: DatosSalud): Verificacion[] {
  const v: Verificacion[] = [{ componente: 'Base de datos', estado: 'ok', detalle: 'PostgreSQL en línea: respondió a este reporte.', recomendacion: '—' }];
  v.push(d.motor.en_linea
    ? { componente: 'Motor ANPR', estado: d.motor.cpu !== null && d.motor.cpu > 85 ? 'atencion' : 'ok',
      detalle: `${d.motor.detalle}${d.motor.cpu !== null ? ` · CPU ${n(Math.round(d.motor.cpu))} %` : ''}`,
      recomendacion: d.motor.cpu !== null && d.motor.cpu > 85 ? 'El equipo está al límite: reduzca cámaras por motor o use un equipo con más núcleos.' : '—' }
    : { componente: 'Motor ANPR', estado: 'falla', detalle: d.motor.detalle, recomendacion: 'Reinicie el servicio anpr-service y revise sus registros; mientras tanto no se leen placas.' });
  if (!d.camaras.some(c => c.activa)) {
    v.push({ componente: 'Cámaras', estado: 'falla', detalle: 'No hay cámaras habilitadas.', recomendacion: 'Registre y habilite al menos una cámara en Cámaras.' });
  }
  for (const c of d.camaras.filter(x => x.activa)) {
    const nombre = `Cámara «${c.nombre}»`;
    if (c.conectada === false) {
      v.push({ componente: nombre, estado: 'falla', detalle: 'Sin conexión en este momento.', recomendacion: 'Revise la alimentación, el cable o la WiFi de la cámara y su dirección RTSP: no se registran pasos por este acceso.' });
      continue;
    }
    if (c.analisis && c.videoEnMotor === false && d.motor.en_linea) {
      v.push({ componente: nombre, estado: 'atencion', detalle: 'La cámara responde, pero el motor no recibe su video.', recomendacion: 'Revise la URL RTSP en Cámaras y el servidor de video (MediaMTX).' });
    }
    if (c.disponibilidad !== null && c.disponibilidad < 95) {
      v.push({ componente: nombre, estado: c.disponibilidad < 80 ? 'falla' : 'atencion',
        detalle: `Disponible el ${n(c.disponibilidad)} % del período, con ${c.caidas} ${c.caidas === 1 ? 'caída' : 'caídas'}.`,
        recomendacion: 'Revise la estabilidad de la red de la cámara (señal WiFi, cable, alimentación).' });
    }
    if (c.pasos >= 10 && c.tasaLectura !== null && c.tasaLectura < 80) {
      v.push({ componente: nombre, estado: c.tasaLectura < 60 ? 'falla' : 'atencion', detalle: `Leyó la placa del ${n(c.tasaLectura)} % de los vehículos detectados.`,
        recomendacion: 'Limpie el lente, ajuste el enfoque y el ángulo hacia las placas y revise la iluminación nocturna.' });
    } else if (c.pasos >= 10 && c.confianza !== null && c.confianza < 0.7) {
      v.push({ componente: nombre, estado: 'atencion', detalle: `Confianza media de lectura de ${n(Math.round(c.confianza * 100))} %.`,
        recomendacion: 'Acerque el encuadre a la placa o mejore el enfoque para lecturas más seguras.' });
    }
    if (c.analisis && (c.sinPasosMin === null || c.sinPasosMin > 24 * 60)) {
      v.push({ componente: nombre, estado: 'atencion', detalle: c.sinPasosMin === null ? 'En línea, pero nunca registró un paso.' : `En línea, pero no registra pasos desde hace ${textoDuracion(c.sinPasosMin)}.`,
        recomendacion: 'Si hubo tránsito, revise la zona de detección (ROI) y el encuadre de la cámara.' });
    }
    if (!v.some(x => x.componente === nombre)) {
      v.push({ componente: nombre, estado: 'ok', detalle: `En línea${c.disponibilidad !== null ? ` · disponible el ${n(c.disponibilidad)} %` : ''}`
        + `${c.tasaLectura !== null && c.pasos ? ` · lectura del ${n(c.tasaLectura)} %` : ''}.`, recomendacion: '—' });
    }
  }
  const a = d.almacenamiento;
  if (a.libres !== null && a.libres < 2 * GB) v.push({ componente: 'Almacenamiento', estado: 'falla', detalle: `Quedan ${n(Math.round((a.libres / GB) * 10) / 10)} GB libres en el disco.`, recomendacion: 'Libere disco o amplíelo: sin espacio se detienen las fotos y la base de datos.' });
  else if (a.usados !== null && a.maximo && a.usados > a.maximo * 0.9) v.push({ componente: 'Almacenamiento', estado: 'atencion', detalle: `Las fotos ocupan el ${pct(a.usados, a.maximo)} del máximo permitido.`, recomendacion: 'Se borrarán las fotos más antiguas: amplíe el máximo en Configuración si debe conservarlas.' });
  else v.push({ componente: 'Almacenamiento', estado: 'ok', detalle: a.libres !== null ? `${n(Math.round((a.libres / GB) * 10) / 10)} GB libres en el disco.` : 'Sin datos del disco.', recomendacion: '—' });
  v.push(d.correo
    ? { componente: 'Correo saliente', estado: 'ok', detalle: 'Configurado.', recomendacion: '—' }
    : { componente: 'Correo saliente', estado: 'atencion', detalle: 'No está configurado.', recomendacion: 'Configúrelo en Configuración › Correo: sin él no llegan los avisos ni la recuperación de contraseñas.' });
  v.push(d.pendientesAntiguos
    ? { componente: 'Revisión de pasos', estado: 'atencion', detalle: `${d.pendientesAntiguos} ${d.pendientesAntiguos === 1 ? 'paso espera' : 'pasos esperan'} revisión desde hace más de 1 hora (${d.pendientes} ${d.pendientes === 1 ? 'pendiente' : 'pendientes'} en total).`, recomendacion: 'El guardia debe autorizarlos o rechazarlos en Monitoreo.' }
    : { componente: 'Revisión de pasos', estado: 'ok', detalle: d.pendientes ? `${d.pendientes} pendientes recientes.` : 'Sin pasos pendientes.', recomendacion: '—' });
  v.push(d.sinSalida
    ? { componente: 'Salidas', estado: 'atencion', detalle: `${d.sinSalida} ${d.sinSalida === 1 ? 'vehículo autorizado figura' : 'vehículos autorizados figuran'} dentro hace más de 24 horas.`, recomendacion: 'Registre las salidas pendientes o revise la cámara de salida.' }
    : { componente: 'Salidas', estado: 'ok', detalle: 'Sin ingresos abiertos de más de 24 horas.', recomendacion: '—' });
  if (d.vencidos || d.porVencer) {
    v.push({ componente: 'Permisos de la lista blanca', estado: 'atencion',
      detalle: [d.vencidos ? `${d.vencidos} ${d.vencidos === 1 ? 'vencido sigue activo' : 'vencidos siguen activos'}` : '', d.porVencer ? `${d.porVencer} vencen en los próximos ${d.diasAviso} días` : ''].filter(Boolean).join(' · '),
      recomendacion: 'Renueve o retire los permisos en Lista blanca.' });
  }
  if (d.usuariosPendientes || d.usuariosBloqueados) {
    v.push({ componente: 'Cuentas de usuario', estado: 'atencion',
      detalle: [d.usuariosPendientes ? `${d.usuariosPendientes} pendientes de aprobación` : '', d.usuariosBloqueados ? `${d.usuariosBloqueados} bloqueadas` : ''].filter(Boolean).join(' · '),
      recomendacion: 'Revíselas en Usuarios.' });
  }
  return v;
}

export function estadoGeneral(v: Verificacion[]): string {
  return v.some(x => x.estado === 'falla') ? 'Con fallas' : v.some(x => x.estado === 'atencion') ? 'Requiere atención' : 'Operativo';
}

export interface EventoConexion { fecha: Date; estado: 'EN_LINEA' | 'SIN_CONEXION' }

export interface Disponibilidad {
  /** Tiempo observado en línea y sin conexión dentro del período (ms) */
  enLinea: number;
  sinConexion: number;
  /** Tiempo del período anterior a la primera observación (no cuenta en el porcentaje) */
  sinDatos: number;
  caidas: number;
  mayorCaida: number;
  /** % del tiempo observado en línea (null sin observaciones) */
  porcentaje: number | null;
}

/**
 * Disponibilidad de una cámara en [desde, hasta] a partir de sus cambios de estado: `previo` es el
 * último cambio anterior al período (o null) y `eventos`, los del período en orden. Una caída es
 * cada paso a SIN_CONEXION dentro del período (o la que ya estaba en curso al empezar).
 */
export function disponibilidad(previo: EventoConexion | null, eventos: EventoConexion[], desde: Date, hasta: Date): Disponibilidad {
  const r: Disponibilidad = { enLinea: 0, sinConexion: 0, sinDatos: 0, caidas: 0, mayorCaida: 0, porcentaje: null };
  let estado: EventoConexion['estado'] | null = previo?.estado ?? null;
  let t = desde.getTime();
  const fin = hasta.getTime();
  let inicioCaida: number | null = estado === 'SIN_CONEXION' ? t : null;
  if (estado === 'SIN_CONEXION') r.caidas++;
  const avanzar = (hastaT: number) => {
    const tramo = Math.max(0, Math.min(hastaT, fin) - t);
    if (estado === 'EN_LINEA') r.enLinea += tramo;
    else if (estado === 'SIN_CONEXION') r.sinConexion += tramo;
    else r.sinDatos += tramo;
    t = Math.max(t, Math.min(hastaT, fin));
  };
  for (const e of eventos) {
    const te = e.fecha.getTime();
    if (te > fin) break;
    if (te < t) { estado = e.estado; continue; }
    avanzar(te);
    if (e.estado === estado) continue;
    if (e.estado === 'SIN_CONEXION') { r.caidas++; inicioCaida = te; }
    else if (inicioCaida !== null) { r.mayorCaida = Math.max(r.mayorCaida, te - inicioCaida); inicioCaida = null; }
    estado = e.estado;
  }
  avanzar(fin);
  if (inicioCaida !== null) r.mayorCaida = Math.max(r.mayorCaida, fin - inicioCaida);
  const observado = r.enLinea + r.sinConexion;
  r.porcentaje = observado > 0 ? Math.round((r.enLinea / observado) * 1000) / 10 : null;
  return r;
}

// ─── Auditoría ───────────────────────────────────────────────────────────────

export type CategoriaAccion = 'Registros de ingreso' | 'Eliminaciones' | 'Listas' | 'Cámaras' | 'Consultas y exportaciones' | 'Configuración' | 'Cuentas de usuario' | 'Otras';

/** Nombre legible y categoría de cada acción auditada; `sensible` = conviene revisarla siempre. */
const ACCIONES: Record<string, [string, CategoriaAccion, boolean?]> = {
  VALIDACION: ['Validación de un paso', 'Registros de ingreso'],
  INGRESO_DATOS: ['Datos del ingreso', 'Registros de ingreso'],
  REGISTRO_MANUAL: ['Registro manual', 'Registros de ingreso'],
  REGISTRO_SALIDA: ['Registro de salida', 'Registros de ingreso'],
  SALIDA_VALIDACION: ['Validación de salida', 'Registros de ingreso'],
  SALIDA_AUTOMATICA: ['Salida automática', 'Registros de ingreso'],
  REGISTRO_CAMPO_CORREGIDO: ['Corrección de un registro', 'Registros de ingreso', true],
  REGISTRO_CORREGIDO: ['Corrección de un registro', 'Registros de ingreso', true],
  DETECCION_ELIMINADA: ['Registro eliminado', 'Eliminaciones', true],
  DETECCIONES_ELIMINADAS: ['Eliminación masiva de registros', 'Eliminaciones', true],
  LISTA_ELIMINADO: ['Permiso o alerta eliminado', 'Eliminaciones', true],
  CAMARA_ELIMINADA: ['Cámara eliminada', 'Eliminaciones', true],
  MENSAJES_CONVERSACION_ELIMINADA: ['Conversación eliminada', 'Eliminaciones', true],
  LIMPIEZA_DATOS_PRUEBA: ['Limpieza de datos de prueba', 'Eliminaciones', true],
  LISTA_ALTA: ['Alta en una lista', 'Listas'],
  LISTA_EDICION: ['Edición en una lista', 'Listas'],
  LISTA_RETIRO: ['Retiro de una lista', 'Listas'],
  LISTA_REACTIVADO: ['Permiso reactivado', 'Listas'],
  CAMARA_ALTA: ['Cámara registrada', 'Cámaras'],
  CAMARA_EDICION: ['Cámara editada', 'Cámaras'],
  CAMARA_HABILITADA: ['Cámara habilitada', 'Cámaras'],
  CAMARA_DESHABILITADA: ['Cámara deshabilitada', 'Cámaras', true],
  CAMARA_ROI: ['Zonas de la cámara', 'Cámaras'],
  MONITOREO_CAMARA: ['Monitoreo de una cámara', 'Cámaras'],
  CONSULTA_VEHICULO: ['Consulta de un vehículo', 'Consultas y exportaciones'],
  CONSULTA_IDENTIDAD: ['Consulta de identidad', 'Consultas y exportaciones', true],
  EXPORTACION: ['Exportación de registros', 'Consultas y exportaciones', true],
  REPORTE_CONTROL_VEHICULAR: ['Hoja de control de garita', 'Consultas y exportaciones', true],
  REPORTE_EXPORTADO: ['Reporte exportado', 'Consultas y exportaciones', true],
  AUDITORIA_EXPORTADA: ['Auditoría exportada', 'Consultas y exportaciones', true],
  CONFIGURACION: ['Cambio de configuración', 'Configuración', true],
  CONFIGURACION_CORREO: ['Correo saliente configurado', 'Configuración', true],
  CORREO_PRUEBA: ['Prueba de correo', 'Configuración'],
  AUDITORIA_RETENCION: ['Retención de la auditoría', 'Configuración', true],
  USUARIO_CREADO: ['Usuario creado', 'Cuentas de usuario', true],
  USUARIO_ACTUALIZADO: ['Usuario actualizado', 'Cuentas de usuario', true],
  PASSWORD_ADMIN_CAMBIADO: ['Contraseña cambiada por el administrador', 'Cuentas de usuario', true],
  CONFIGURACION_INICIAL: ['Configuración inicial', 'Cuentas de usuario', true],
  ENLACE_PASSWORD_ENVIADO: ['Enlace de contraseña enviado', 'Cuentas de usuario'],
  SOLICITUD_RESTABLECIMIENTO: ['Restablecimiento de contraseña', 'Cuentas de usuario'],
};

/** Códigos de las acciones sensibles (además, toda acción que elimine o toque cuentas o contraseñas). */
export const ACCIONES_SENSIBLES = Object.entries(ACCIONES).filter(([, a]) => a[2]).map(([codigo]) => codigo);

export function accionAuditada(codigo: string): { nombre: string; categoria: CategoriaAccion; sensible: boolean } {
  const a = ACCIONES[codigo];
  if (a) return { nombre: a[0], categoria: a[1], sensible: Boolean(a[2]) };
  const nombre = nombrePropio(codigo.replace(/_/g, ' '));
  if (/ELIMIN|BORR/.test(codigo)) return { nombre, categoria: 'Eliminaciones', sensible: true };
  if (/USUARIO|PASSWORD|ROL/.test(codigo)) return { nombre, categoria: 'Cuentas de usuario', sensible: true };
  return { nombre, categoria: 'Otras', sensible: false };
}

/** Conteo de acciones; `fuera` = fuera de la jornada (07:00–19:00 de lunes a viernes, hora local; ver reportesSql.ts). */
export interface ConteoAuditoria { usuario: string; accion: string; fuera: boolean; n: number }
export interface IntentoSesion { email: string; usuario: string | null; exito: boolean; motivo: string | null; n: number; ips: number; ultimo: string | Date }

export interface DatosAuditoria { conteos: ConteoAuditoria[]; sesiones: IntentoSesion[]; sistema: string }

export function hallazgosAuditoria(d: DatosAuditoria): Hallazgo[] {
  const h: Hallazgo[] = [];
  const fallidos = d.sesiones.filter(s => !s.exito);
  const totalFallidos = fallidos.reduce((s, x) => s + x.n, 0);
  const porCorreo = new Map<string, number>();
  for (const f of fallidos) porCorreo.set(f.email, (porCorreo.get(f.email) ?? 0) + f.n);
  const sospechosos = [...porCorreo.entries()].filter(([, v]) => v >= 5).sort((a, b) => b[1] - a[1]);
  if (sospechosos.length) {
    h.push({ nivel: 'alerta', texto: `Posible intento de acceso indebido: ${lista(sospechosos.map(([c, v]) => `${c} (${v} intentos fallidos)`))}.`,
      recomendacion: 'Confirme con el titular de la cuenta; si no fue él, cambie su contraseña y revise las IP en el detalle.' });
  } else if (totalFallidos) {
    h.push({ nivel: 'info', texto: `${n(totalFallidos)} ${totalFallidos === 1 ? 'intento fallido' : 'intentos fallidos'} de inicio de sesión, sin repeticiones sospechosas.` });
  } else if (d.sesiones.length) {
    h.push({ nivel: 'ok', texto: 'Sin intentos fallidos de inicio de sesión.' });
  }
  const total = d.conteos.reduce((s, x) => s + x.n, 0);
  if (!total) {
    h.push({ nivel: 'info', texto: 'No hay acciones registradas en el período y los filtros elegidos.' });
    return h;
  }
  const suma = (pred: (c: ConteoAuditoria) => boolean) => d.conteos.filter(pred).reduce((s, x) => s + x.n, 0);
  const porUsuario = (pred: (c: ConteoAuditoria) => boolean) => {
    const m = new Map<string, number>();
    for (const c of d.conteos.filter(pred)) m.set(c.usuario, (m.get(c.usuario) ?? 0) + c.n);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const eliminaciones = (c: ConteoAuditoria) => accionAuditada(c.accion).categoria === 'Eliminaciones';
  const elim = suma(eliminaciones);
  if (elim) {
    h.push({ nivel: 'atencion', texto: `${n(elim)} ${elim === 1 ? 'eliminación' : 'eliminaciones'}: ${lista(porUsuario(eliminaciones).map(([u, v]) => `${u} (${v})`))}.`,
      recomendacion: 'Verifique en el detalle que cada eliminación tenga un motivo válido; los registros borrados no se recuperan.' });
  }
  const correcciones = (c: ConteoAuditoria) => c.accion.startsWith('REGISTRO_') && c.accion.includes('CORREGIDO');
  const corr = suma(correcciones);
  if (corr) h.push({ nivel: 'atencion', texto: `${n(corr)} ${corr === 1 ? 'corrección' : 'correcciones'} de registros ya guardados: ${lista(porUsuario(correcciones).map(([u, v]) => `${u} (${v})`))}.`,
    recomendacion: 'Revise el motivo de cada corrección en el detalle.' });
  const exportaciones = (c: ConteoAuditoria) => accionAuditada(c.accion).categoria === 'Consultas y exportaciones' && accionAuditada(c.accion).sensible;
  const exp = suma(exportaciones);
  if (exp) h.push({ nivel: 'info', texto: `${n(exp)} ${exp === 1 ? 'exportación o consulta sensible' : 'exportaciones o consultas sensibles'} de datos: ${lista(porUsuario(exportaciones).map(([u, v]) => `${u} (${v})`))}.` });
  const config = (c: ConteoAuditoria) => accionAuditada(c.accion).categoria === 'Configuración' && accionAuditada(c.accion).sensible;
  const cfg = suma(config);
  if (cfg) h.push({ nivel: 'atencion', texto: `${n(cfg)} ${cfg === 1 ? 'cambio' : 'cambios'} de configuración: ${lista(porUsuario(config).map(([u, v]) => `${u} (${v})`))}.`,
    recomendacion: 'Confirme que los cambios estaban autorizados.' });
  const cuentas = (c: ConteoAuditoria) => accionAuditada(c.accion).categoria === 'Cuentas de usuario' && accionAuditada(c.accion).sensible;
  const cta = suma(cuentas);
  if (cta) h.push({ nivel: 'info', texto: `${n(cta)} ${cta === 1 ? 'cambio' : 'cambios'} en cuentas de usuario (creaciones, datos o contraseñas).` });
  const personas = (c: ConteoAuditoria) => c.usuario !== d.sistema;
  const fuera = (c: ConteoAuditoria) => personas(c) && c.fuera;
  const fueraTotal = suma(fuera);
  if (fueraTotal) h.push({ nivel: 'info', texto: `${fueraTotal === 1 ? 'Una acción' : `${n(fueraTotal)} acciones`} de personas fuera de la jornada (19:00–07:00 o fin de semana): ${lista(porUsuario(fuera).map(([u, v]) => `${u} (${v})`))}.` });
  const activos = porUsuario(personas);
  if (activos.length) h.push({ nivel: 'info', texto: `${activos[0][0]} es quien más acciones registró: ${n(activos[0][1])} (${pct(activos[0][1], suma(personas))} de las acciones de personas).` });
  const automaticas = suma(c => c.usuario === d.sistema);
  if (automaticas) h.push({ nivel: 'info', texto: `${automaticas === 1 ? 'Una acción la hizo' : `${n(automaticas)} acciones las hizo`} el sistema solo (por ejemplo, salidas automáticas).` });
  return h;
}
