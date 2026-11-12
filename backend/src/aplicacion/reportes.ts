import { errorNoEncontrado, errorValidacion, type Actor, type PuertoAuditoria } from './comun';
import type { CalendarioLocal } from './calendario';
import {
  accionAuditada, CATALOGO, CATEGORIAS, CLASES_VEHICULO, claseVehiculo, DIAS_SEMANA, definicionReporte, disponibilidad, estadoGeneral,
  franjaHora, hallazgosAuditoria, hallazgosVehiculos, leerParametros, nombrePropio, porcentaje, textoDuracion,
  verificacionesSistema, type CamaraSalud, type Columna, type Conteo, type DefinicionReporte, type EventoConexion, type Grafico,
  type Hallazgo, type IntentoSesion, type ParametrosLeidos, type Reporte, type Seccion,
} from '../dominio/reportes';

/**
 * Reportes (aplicacion): vehículos que más ingresan, estado del sistema y auditoría. Cada uno se
 * arma con las consultas del repositorio (infraestructura/persistencia/reportesSql.ts) y se
 * entrega como datos: cifras, hallazgos con recomendación, gráficos de barras horizontales y
 * tablas. El navegador lo muestra como documento imprimible, con las fotos, y el servidor lo
 * exporta a Excel (infraestructura/servicios/documentosReportes.ts). La exportación queda en la
 * auditoría.
 */

/** Un paso vehicular con todos los datos de la persona, el vehículo y las listas. */
export interface FilaPaso {
  id: number;
  fecha: string | Date;
  salida: string | Date | null;
  movimiento: 'ingreso' | 'salida';
  placa: string | null;
  nombre: string | null;
  cedula: string | null;
  institucion: string | null;
  cargo: string | null;
  motivo: string | null;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  foto_vehiculo: string | null;
  foto_placa: string | null;
  camara: string | null;
  estado: string;
  estado_codigo: string;
  categoria: string | null;
  alerta_motivo: string | null;
  nivel: string | null;
  restriccion: string | null;
  horario: string | null;
  validado: boolean;
  validador: string | null;
  sin_placa: boolean;
  no_legible: boolean;
  confianza: number | null;
}

export interface Pagina<T> { filas: T[]; total: number }

/** Un vehículo del reporte de frecuencia: la ficha de su último ingreso y sus totales del período. */
export interface FilaVehiculo extends Omit<FilaPaso, 'placa'> {
  placa: string;
  ingresos: number;
  dias: number;
  primero: string | Date;
  ultimo: string | Date;
  con_salida: number;
  permanencia: number | null;
  motivo_frecuente: string | null;
  hora_habitual: number | null;
  situacion: string;
}

export type Dimension = 'marca' | 'tipo' | 'color' | 'institucion' | 'hora' | 'dia';

export interface ResultadoVehiculos extends Pagina<FilaVehiculo> {
  ingresos: number;
  vehiculos: number;
  unaVez: number;
  dimensiones: { dim: Dimension; valor: string | null; ingresos: number; vehiculos: number }[];
}

export interface CamaraEstado {
  id: number; nombre: string; ubicacion: string | null; direccion: string; activa: boolean; analisis: boolean; estado: string | null;
  ultimo_ping: string | Date | null; tiempo_respuesta_ms: number | null; mensaje_ping: string | null; ultimo_paso: string | Date | null;
}
export interface EventoCamara extends EventoConexion { camara_id: number; mensaje: string | null }
export interface FilaLectura {
  camara_id: number | null; camara: string; dia: string | null; pasos: number; leidas: number; sin_placa: number; ilegibles: number;
  confirmadas: number; corregidas: number; confianza_ocr: number | null; nitidez: number | null;
}
export interface IndicadoresOperacion {
  pendientes: number; pendientes_antiguos: number; sin_salida: number; por_vencer: number; vencidos: number;
  usuarios_pendientes: number; usuarios_bloqueados: number;
}
export interface FilaAccion { fecha: string | Date; usuario: string; rol: string | null; accion: string; entidad: string | null; detalle: string | null; ip: string | null }
export interface ResultadoAuditoria {
  conteos: { usuario: string; rol: string | null; accion: string; fuera: boolean; n: number }[];
  porHora: { hora: number; n: number }[];
  sesiones: IntentoSesion[];
  sensibles: Pagina<FilaAccion>;
  detalle: Pagina<FilaAccion>;
  fallidos: Pagina<{ fecha: string | Date; email: string; usuario: string | null; motivo: string | null; ip: string | null }>;
}

export interface RepositorioReportes {
  vehiculosFrecuentes(f: { desde: Date; hasta: Date; camara: number | null; situacion: string | null; buscar: string | null;
    minimo: number; desfase: number; limite: number }): Promise<ResultadoVehiculos>;
  camaras(): Promise<CamaraEstado[]>;
  eventosCamaras(desde: Date, hasta: Date): Promise<{ previos: EventoCamara[]; eventos: EventoCamara[] }>;
  lecturas(f: { desde: Date; hasta: Date; desfase: number }): Promise<{ porCamara: FilaLectura[]; porDia: FilaLectura[] }>;
  operacion(diasAviso: number): Promise<IndicadoresOperacion>;
  auditoria(f: { desde: Date; hasta: Date; usuario: string | null; desfase: number; limite: number; sistema: string }): Promise<ResultadoAuditoria>;
  nombreCamara(id: number): Promise<string | null>;
}

/** Estado de los servidores para el estado del sistema (motor ANPR, almacenamiento, correo). */
export interface PuertoSaludSistema {
  motor(): Promise<{ en_linea: boolean; detalle: string; cpu: number | null; camaras: { id: number; conectada: boolean }[] }>;
  almacenamiento(): Promise<{ usados: number | null; maximo: number | null; libres: number | null }>;
  correo(): boolean;
}

/** Excel del reporte (mismas tablas que la vista previa, sin las fotos). */
export interface PuertoDocumentosReportes {
  excel(r: Reporte, zona: string): Promise<Buffer>;
}

export interface DependenciasReportes {
  repositorio: RepositorioReportes;
  documentos: PuertoDocumentosReportes;
  salud: PuertoSaludSistema;
  tiempo: CalendarioLocal;
  zona: string;
  /** Días de aviso de permisos por vencer (Configuración) */
  diasAviso: () => number;
  auditoria: PuertoAuditoria;
}

/** Filas por sección en la vista previa; el Excel lleva hasta LIMITE_EXCEL. */
export const LIMITE_VISTA = 2000;
export const LIMITE_EXCEL = 20000;
/** Nombre de las acciones sin usuario (las hace el sistema solo) */
export const SISTEMA = 'Sistema (automático)';
const BARRAS = 10;

const col = (clave: string, titulo: string, tipo?: Columna['tipo']): Columna => (tipo ? { clave, titulo, tipo } : { clave, titulo });

function formatos(zona: string) {
  const diaHora = new Intl.DateTimeFormat('es-EC', { timeZone: zona, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dia = new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });
  return { diaHora: (v: Date | string) => diaHora.format(new Date(v)), diaCorto: (ymd: string) => dia.format(new Date(`${ymd}T12:00:00Z`)) };
}

const numero = (n: number) => n.toLocaleString('es-EC');
const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('es-EC')} %`);
const placaTexto = (p: string) => (/^[A-Z]{3}\d{3,4}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : /^[A-Z]{2}\d{3}[A-Z]$/.test(p) ? `${p.slice(0, 2)}-${p.slice(2)}` : p);

/** Las `max` barras más largas (el resto se suma en «Otros» si lo hay). */
export function grafico(titulo: string, unidad: string, datos: { etiqueta: string; valor: number; detalle?: string }[], max = BARRAS, otros = true): Grafico {
  const orden = [...datos].filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor);
  const barras = orden.slice(0, max);
  const resto = orden.slice(max).reduce((s, x) => s + x.valor, 0);
  if (otros && resto > 0) barras.push({ etiqueta: `Otros (${orden.length - max})`, valor: resto });
  return { titulo, unidad, barras };
}

/** Conteos de una dimensión con el nombre legible («Sin dato» si falta); los tipos se agrupan por clase. */
function conteos(r: ResultadoVehiculos, dim: Dimension): Conteo[] {
  const m = new Map<string, Conteo>();
  for (const x of r.dimensiones.filter(y => y.dim === dim)) {
    const valor = dim === 'tipo' ? claseVehiculo(x.valor) : dim === 'hora' ? (x.valor === null || x.valor === '' ? 'Sin dato' : franjaHora(Number(x.valor)))
      : dim === 'dia' ? DIAS_SEMANA[Number(x.valor) - 1] ?? 'Sin dato' : nombrePropio(x.valor) || 'Sin dato';
    const actual = m.get(valor) ?? { valor, ingresos: 0, vehiculos: 0 };
    actual.ingresos += x.ingresos;
    actual.vehiculos += x.vehiculos;
    m.set(valor, actual);
  }
  return [...m.values()];
}

const hallazgosDeVerificaciones = (v: ReturnType<typeof verificacionesSistema>): Hallazgo[] => {
  const problemas = v.filter(x => x.estado !== 'ok');
  if (!problemas.length) return [{ nivel: 'ok', texto: 'Todos los componentes funcionan correctamente.' }];
  return [...problemas].sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'falla' ? -1 : 1))
    .map(x => ({ nivel: x.estado === 'falla' ? 'alerta' : 'atencion', texto: `${x.componente}: ${x.detalle}`, recomendacion: x.recomendacion }));
};

type Cuerpo = Pick<Reporte, 'parametros' | 'resumen' | 'hallazgos' | 'graficos' | 'avisos' | 'secciones'>;

export function casosReportes(d: DependenciasReportes) {
  const { diaHora, diaCorto } = formatos(d.zona);

  async function vehiculos(p: ParametrosLeidos, limite: number, parametros: [string, string][]): Promise<Cuerpo> {
    const v = p.valores;
    const desfase = d.tiempo.desfaseMinutos(d.tiempo.ahora());
    const r = await d.repositorio.vehiculosFrecuentes({ desde: p.desde!, hasta: p.hasta!, camara: (v.camara as number | null) ?? null,
      situacion: (v.situacion as string) || null, buscar: (v.buscar as string | null) ?? null, minimo: v.minimo as number, desfase, limite });
    const marcas = conteos(r, 'marca');
    const clases = conteos(r, 'tipo');
    const colores = conteos(r, 'color');
    const instituciones = conteos(r, 'institucion');
    const horas = conteos(r, 'hora').filter(h => h.valor !== 'Sin dato').sort((a, b) => a.valor.localeCompare(b.valor));
    const dias = conteos(r, 'dia').sort((a, b) => DIAS_SEMANA.indexOf(a.valor) - DIAS_SEMANA.indexOf(b.valor));
    const diasPeriodo = Math.max(1, Math.round((p.hasta!.getTime() - p.desde!.getTime()) / 86_400_000));
    // Marca, tipo y color con mayúscula inicial, como en los gráficos (los datos llegan escritos de varias formas)
    const filas = r.filas.map(f => ({ ...f, marca: nombrePropio(f.marca) || null, tipo: nombrePropio(f.tipo) || null, color: nombrePropio(f.color) || null,
      participacion: porcentaje(f.ingresos, r.ingresos),
      hora_texto: f.hora_habitual === null ? null : franjaHora(f.hora_habitual) }));
    const ordenClase = (c: Conteo) => CLASES_VEHICULO.indexOf(c.valor as typeof CLASES_VEHICULO[number]);
    const tablaConteo = (titulo: string, nombre: string, datos: Conteo[]): Seccion => {
      const ordenados = [...datos].sort((a, b) => b.ingresos - a.ingresos);
      return { titulo, columnas: [col('valor', nombre), col('ingresos', 'Ingresos', 'numero'), col('participacion', '% de los ingresos', 'porcentaje'),
        col('vehiculos', 'Vehículos distintos', 'numero')], filas: ordenados.map(c => ({ ...c, participacion: porcentaje(c.ingresos, r.ingresos) })), total: ordenados.length };
    };
    const top = r.filas[0];
    const marca = [...marcas].filter(m => m.valor !== 'Sin dato').sort((a, b) => b.ingresos - a.ingresos)[0];
    const barras = (lista: Conteo[]) => lista.map(c => ({ etiqueta: c.valor, valor: c.ingresos, detalle: `${numero(c.vehiculos)} ${c.vehiculos === 1 ? 'vehículo' : 'vehículos'}` }));
    return {
      parametros, avisos: [],
      resumen: [['Ingresos', numero(r.ingresos)], ['Vehículos distintos', numero(r.vehiculos)],
        ['Promedio por vehículo', r.vehiculos ? (r.ingresos / r.vehiculos).toLocaleString('es-EC', { maximumFractionDigits: 1 }) : '—'],
        ['Más frecuente', top ? `${placaTexto(top.placa)} (${numero(top.ingresos)})` : '—'],
        ['Marca que más ingresa', marca ? `${marca.valor} (${numero(marca.ingresos)})` : '—']],
      hallazgos: hallazgosVehiculos({ filas: r.filas, ingresos: r.ingresos, vehiculos: r.vehiculos, unaVez: r.unaVez, marcas, clases, horas, dias, diasPeriodo }),
      graficos: [
        grafico('Vehículos con más ingresos', 'ingresos', r.filas.slice(0, BARRAS).map(f => ({ etiqueta: `${placaTexto(f.placa)}${f.nombre ? ` · ${f.nombre}` : ''}`,
          valor: f.ingresos, detalle: `${numero(f.dias)} ${f.dias === 1 ? 'día' : 'días'} con ingreso · ${f.situacion}` })), BARRAS, false),
        grafico('Marcas que más ingresan', 'ingresos', barras(marcas)),
        { titulo: 'Ingresos por tipo de vehículo', unidad: 'ingresos', barras: barras([...clases].sort((a, b) => ordenClase(a) - ordenClase(b))) },
        grafico('Colores más frecuentes', 'ingresos', barras(colores)),
        grafico('Instituciones que más ingresan', 'ingresos', barras(instituciones)),
        { titulo: 'Ingresos por hora del día', unidad: 'ingresos', barras: barras(horas) },
        { titulo: 'Ingresos por día de la semana', unidad: 'ingresos', barras: barras(dias) },
      ].filter(g => g.barras.length),
      secciones: [
        { titulo: 'Ranking de vehículos', total: r.total, filas,
          columnas: [col('placa', 'Placa', 'placa'), col('foto_vehiculo', 'Vehículo', 'imagen'),
            col('foto_placa', 'Placa recortada', 'imagen'), col('nombre', 'Nombres y apellidos'), col('cedula', 'Cédula'), col('institucion', 'Institución'),
            col('cargo', 'Cargo'), col('marca', 'Marca'), col('modelo', 'Modelo'), col('tipo', 'Tipo'), col('color', 'Color'), col('situacion', 'Situación'),
            col('ingresos', 'Ingresos', 'numero'), col('participacion', '% de los ingresos', 'porcentaje'), col('dias', 'Días con ingreso', 'numero'),
            col('primero', 'Primer ingreso', 'fecha_hora'), col('ultimo', 'Último ingreso', 'fecha_hora'), col('permanencia', 'Permanencia promedio', 'duracion'),
            col('hora_texto', 'Hora habitual'), col('motivo_frecuente', 'Motivo más frecuente')] },
        tablaConteo('Marcas', 'Marca', marcas),
        tablaConteo('Instituciones', 'Institución', instituciones),
      ],
    };
  }

  async function estadoSistema(p: ParametrosLeidos, limite: number, parametros: [string, string][]): Promise<Cuerpo> {
    const ahora = d.tiempo.ahora();
    const fin = p.hasta! > ahora ? ahora : p.hasta!;
    const desfase = d.tiempo.desfaseMinutos(ahora);
    const [camaras, ev, lect, op, motor, disco] = await Promise.all([
      d.repositorio.camaras(), d.repositorio.eventosCamaras(p.desde!, fin), d.repositorio.lecturas({ desde: p.desde!, hasta: p.hasta!, desfase }),
      d.repositorio.operacion(d.diasAviso()), d.salud.motor(), d.salud.almacenamiento(),
    ]);
    const filasCamaras = camaras.map(c => {
      const disp = disponibilidad(ev.previos.find(e => e.camara_id === c.id) ?? null, ev.eventos.filter(e => e.camara_id === c.id), p.desde!, fin);
      const l = lect.porCamara.find(x => x.camara_id === c.id);
      const video = motor.camaras.find(x => x.id === c.id);
      const salud: CamaraSalud = {
        nombre: c.nombre, activa: c.activa, analisis: c.analisis, conectada: c.estado === 'EN_LINEA' ? true : c.estado === 'SIN_CONEXION' ? false : null,
        videoEnMotor: video ? video.conectada : motor.en_linea && c.analisis ? false : null, disponibilidad: disp.porcentaje, caidas: disp.caidas,
        tasaLectura: l ? porcentaje(l.leidas, l.pasos) : null, confianza: l?.confianza_ocr ?? null, pasos: l?.pasos ?? 0,
        sinPasosMin: c.ultimo_paso ? (ahora.getTime() - new Date(c.ultimo_paso).getTime()) / 60000 : null,
      };
      return { c, disp, l, salud };
    });
    const verificaciones = verificacionesSistema({
      motor, correo: d.salud.correo(), almacenamiento: disco, camaras: filasCamaras.map(x => x.salud),
      pendientes: op.pendientes, pendientesAntiguos: op.pendientes_antiguos, sinSalida: op.sin_salida, porVencer: op.por_vencer,
      vencidos: op.vencidos, diasAviso: d.diasAviso(), usuariosPendientes: op.usuarios_pendientes, usuariosBloqueados: op.usuarios_bloqueados,
    });
    const activas = camaras.filter(c => c.activa);
    const total = lect.porCamara.reduce((a, x) => ({ pasos: a.pasos + x.pasos, leidas: a.leidas + x.leidas, sin: a.sin + x.sin_placa,
      ilegibles: a.ilegibles + x.ilegibles, corregidas: a.corregidas + x.corregidas }), { pasos: 0, leidas: 0, sin: 0, ilegibles: 0, corregidas: 0 });
    const disponibles = filasCamaras.filter(x => x.c.activa && x.disp.porcentaje !== null);
    const dispMedia = disponibles.length ? Math.round((disponibles.reduce((s, x) => s + x.disp.porcentaje!, 0) / disponibles.length) * 10) / 10 : null;
    const pasosDia = new Map<string, number>();
    for (const x of lect.porDia) if (x.dia) pasosDia.set(x.dia, (pasosDia.get(x.dia) ?? 0) + x.pasos);
    const ESTADO: Record<string, string> = { ok: 'Correcto', atencion: 'Atención', falla: 'Falla' };
    const graficos: Grafico[] = [
      { titulo: 'Disponibilidad por cámara', unidad: '%', maximo: 100,
        barras: disponibles.map(x => ({ etiqueta: x.c.nombre, valor: x.disp.porcentaje!, detalle: `${x.disp.caidas} ${x.disp.caidas === 1 ? 'caída' : 'caídas'} · ${textoDuracion(x.disp.sinConexion / 60000)} sin conexión` })) },
      { titulo: 'Tasa de lectura por cámara', unidad: '%', maximo: 100,
        barras: lect.porCamara.filter(x => x.pasos).map(x => ({ etiqueta: x.camara, valor: porcentaje(x.leidas, x.pasos)!, detalle: `${numero(x.leidas)} de ${numero(x.pasos)} vehículos` })) },
      { titulo: 'Resultado de las lecturas', unidad: 'pasos', barras: [
        { etiqueta: 'Placa leída', valor: total.leidas }, { etiqueta: 'Sin placa visible', valor: total.sin },
        { etiqueta: 'Placa ilegible', valor: total.ilegibles }, { etiqueta: 'Corregida por el personal', valor: total.corregidas }].filter(b => b.valor > 0) },
      { titulo: 'Vehículos detectados por día', unidad: 'pasos',
        barras: [...pasosDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, n]) => ({ etiqueta: diaCorto(dia), valor: n })) },
    ];
    return {
      parametros,
      avisos: ev.eventos.length || ev.previos.length ? [] : ['El historial de conexión de las cámaras se guarda desde el 12/11/2026: antes de esa fecha la disponibilidad figura sin datos.'],
      resumen: [['Estado general', estadoGeneral(verificaciones)],
        ['Cámaras en línea', `${activas.filter(c => c.estado === 'EN_LINEA').length} de ${activas.length}`],
        ['Disponibilidad media', pct(dispMedia)], ['Tasa de lectura', pct(porcentaje(total.leidas, total.pasos))],
        ['Pendientes de revisión', numero(op.pendientes)]],
      hallazgos: hallazgosDeVerificaciones(verificaciones),
      graficos: graficos.filter(g => g.barras.length),
      secciones: [
        { titulo: 'Verificaciones', columnas: [col('componente', 'Componente'), col('estado', 'Estado'), col('detalle', 'Detalle'), col('recomendacion', 'Qué hacer')],
          filas: verificaciones.map(x => ({ ...x, estado: ESTADO[x.estado] })), total: verificaciones.length },
        { titulo: 'Cámaras', total: filasCamaras.length,
          columnas: [col('camara', 'Cámara'), col('ubicacion', 'Ubicación'), col('direccion', 'Dirección'), col('estado', 'Conexión'), col('video', 'Video en el motor'),
            col('disponibilidad', 'Disponibilidad', 'porcentaje'), col('caidas', 'Caídas', 'numero'), col('sin_conexion', 'Tiempo sin conexión', 'duracion'),
            col('mayor_caida', 'Caída más larga', 'duracion'), col('pasos', 'Vehículos detectados', 'numero'), col('tasa', 'Tasa de lectura', 'porcentaje'),
            col('ultimo_paso', 'Último paso', 'fecha_hora'), col('ultimo_ping', 'Última verificación', 'fecha_hora'), col('latencia', 'Respuesta (ms)', 'numero')],
          filas: filasCamaras.map(({ c, disp, l, salud }) => ({
            camara: c.nombre, ubicacion: c.ubicacion, direccion: c.direccion === 'salida' ? 'Salida' : 'Ingreso',
            estado: !c.activa ? 'Deshabilitada' : c.estado === 'EN_LINEA' ? 'En línea' : c.estado === 'SIN_CONEXION' ? 'Sin conexión' : 'Sin verificar',
            video: salud.videoEnMotor === null ? '—' : salud.videoEnMotor ? 'Recibe video' : 'Sin video', disponibilidad: disp.porcentaje, caidas: disp.caidas,
            sin_conexion: Math.round(disp.sinConexion / 60000), mayor_caida: Math.round(disp.mayorCaida / 60000), pasos: l?.pasos ?? 0,
            tasa: l ? porcentaje(l.leidas, l.pasos) : null, ultimo_paso: c.ultimo_paso, ultimo_ping: c.ultimo_ping, latencia: c.tiempo_respuesta_ms,
          })) },
        { titulo: 'Lectura por día', total: lect.porDia.length,
          columnas: [col('dia', 'Fecha', 'fecha'), col('camara', 'Cámara'), col('pasos', 'Vehículos detectados', 'numero'), col('leidas', 'Placas leídas', 'numero'),
            col('tasa', 'Tasa de lectura', 'porcentaje'), col('sin_placa', 'Sin placa visible', 'numero'), col('ilegibles', 'Ilegibles', 'numero'),
            col('corregidas', 'Corregidas por el personal', 'numero'), col('confianza', 'Confianza media', 'porcentaje')],
          filas: lect.porDia.map(x => ({ ...x, tasa: porcentaje(x.leidas, x.pasos), confianza: x.confianza_ocr === null ? null : Math.round(x.confianza_ocr * 1000) / 10 })) },
        { titulo: 'Cambios de conexión', total: ev.eventos.length,
          columnas: [col('fecha', 'Fecha y hora', 'fecha_hora'), col('camara', 'Cámara'), col('estado', 'Cambio'), col('mensaje', 'Mensaje')],
          filas: ev.eventos.slice(-limite).reverse().map(e => ({ fecha: e.fecha, camara: camaras.find(c => c.id === e.camara_id)?.nombre ?? `Cámara ${e.camara_id}`,
            estado: e.estado === 'EN_LINEA' ? 'Volvió a estar en línea' : 'Se perdió la conexión', mensaje: e.mensaje })) },
      ],
    };
  }

  async function auditoria(p: ParametrosLeidos, limite: number, parametros: [string, string][]): Promise<Cuerpo> {
    const desfase = d.tiempo.desfaseMinutos(d.tiempo.ahora());
    const r = await d.repositorio.auditoria({ desde: p.desde!, hasta: p.hasta!, usuario: (p.valores.usuario as string | null) ?? null, desfase, limite, sistema: SISTEMA });
    const total = r.conteos.reduce((s, x) => s + x.n, 0);
    const usuarios = new Map<string, { usuario: string; rol: string | null; total: number; sensibles: number; eliminaciones: number; fuera: number; categorias: Map<string, number> }>();
    const tipos = new Map<string, number>();
    const categorias = new Map<string, number>();
    for (const c of r.conteos) {
      const a = accionAuditada(c.accion);
      const u = usuarios.get(c.usuario) ?? { usuario: c.usuario, rol: c.rol, total: 0, sensibles: 0, eliminaciones: 0, fuera: 0, categorias: new Map<string, number>() };
      u.total += c.n;
      if (a.sensible) u.sensibles += c.n;
      if (a.categoria === 'Eliminaciones') u.eliminaciones += c.n;
      if (c.fuera) u.fuera += c.n;
      u.categorias.set(a.categoria, (u.categorias.get(a.categoria) ?? 0) + c.n);
      usuarios.set(c.usuario, u);
      tipos.set(a.nombre, (tipos.get(a.nombre) ?? 0) + c.n);
      categorias.set(a.categoria, (categorias.get(a.categoria) ?? 0) + c.n);
    }
    const listaUsuarios = [...usuarios.values()].sort((a, b) => b.total - a.total);
    const exitosos = r.sesiones.filter(s => s.exito).reduce((s, x) => s + x.n, 0);
    const fallidos = r.sesiones.filter(s => !s.exito).reduce((s, x) => s + x.n, 0);
    const porCorreo = new Map<string, { email: string; usuario: string | null; exitosos: number; fallidos: number; ips: number; ultimo: string | Date }>();
    for (const s of r.sesiones) {
      const x = porCorreo.get(s.email) ?? { email: s.email, usuario: s.usuario, exitosos: 0, fallidos: 0, ips: 0, ultimo: s.ultimo };
      x[s.exito ? 'exitosos' : 'fallidos'] += s.n;
      x.ips = Math.max(x.ips, s.ips);
      if (new Date(s.ultimo) > new Date(x.ultimo)) x.ultimo = s.ultimo;
      porCorreo.set(s.email, x);
    }
    const sesiones = [...porCorreo.values()].sort((a, b) => b.fallidos - a.fallidos || b.exitosos - a.exitosos);
    const conNombre = (f: FilaAccion) => ({ ...f, accion: accionAuditada(f.accion).nombre, categoria: accionAuditada(f.accion).categoria });
    const columnasAccion = [col('fecha', 'Fecha y hora', 'fecha_hora'), col('usuario', 'Usuario'), col('rol', 'Rol'), col('accion', 'Acción'),
      col('categoria', 'Categoría'), col('detalle', 'Detalle'), col('ip', 'IP')];
    const graficos: Grafico[] = [
      grafico('Acciones por usuario', 'acciones', listaUsuarios.map(u => ({ etiqueta: u.usuario, valor: u.total,
        detalle: `${numero(u.sensibles)} sensibles · ${numero(u.fuera)} fuera de la jornada` }))),
      grafico('Acciones más frecuentes', 'acciones', [...tipos.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor }))),
      grafico('Acciones por categoría', 'acciones', [...categorias.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor })), 10, false),
      grafico('Intentos fallidos de inicio de sesión', 'intentos', sesiones.filter(s => s.fallidos).map(s => ({ etiqueta: s.email, valor: s.fallidos,
        detalle: `${numero(s.ips)} ${s.ips === 1 ? 'IP distinta' : 'IP distintas'}` }))),
      { titulo: 'Actividad por hora del día', unidad: 'acciones', barras: [...r.porHora].sort((a, b) => a.hora - b.hora).map(h => ({ etiqueta: franjaHora(h.hora), valor: h.n })) },
    ];
    return {
      parametros, avisos: [],
      resumen: [['Acciones', numero(total)], ['Usuarios con actividad', numero(listaUsuarios.filter(u => u.usuario !== SISTEMA).length)],
        ['Acciones sensibles', numero(r.sensibles.total)], ['Inicios de sesión', numero(exitosos)], ['Intentos fallidos', numero(fallidos)]],
      hallazgos: hallazgosAuditoria({ conteos: r.conteos, sesiones: r.sesiones, sistema: SISTEMA }),
      graficos: graficos.filter(g => g.barras.length),
      secciones: [
        { titulo: 'Actividad por usuario', total: listaUsuarios.length,
          columnas: [col('usuario', 'Usuario'), col('rol', 'Rol'), col('total', 'Acciones', 'numero'), col('sensibles', 'Sensibles', 'numero'),
            col('eliminaciones', 'Eliminaciones', 'numero'), col('fuera', 'Fuera de la jornada', 'numero'), col('principal', 'Lo que más hizo')],
          filas: listaUsuarios.map(({ categorias: cats, ...u }) => ({ ...u, principal: [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
            .map(([c, v]) => `${c} (${numero(v)})`).join(' · ') })) },
        { titulo: 'Acciones sensibles', total: r.sensibles.total, columnas: columnasAccion, filas: r.sensibles.filas.map(conNombre),
          nota: 'Eliminaciones, correcciones de registros, exportaciones y consultas de datos personales, configuración y cuentas.' },
        { titulo: 'Inicios de sesión por cuenta', total: sesiones.length,
          columnas: [col('email', 'Correo'), col('usuario', 'Usuario'), col('exitosos', 'Exitosos', 'numero'), col('fallidos', 'Fallidos', 'numero'),
            col('ips', 'IP distintas', 'numero'), col('ultimo', 'Último intento', 'fecha_hora')], filas: sesiones },
        { titulo: 'Intentos fallidos', total: r.fallidos.total,
          columnas: [col('fecha', 'Fecha y hora', 'fecha_hora'), col('email', 'Correo'), col('usuario', 'Usuario'), col('motivo', 'Motivo'), col('ip', 'IP')],
          filas: r.fallidos.filas.map(f => ({ ...f, motivo: f.motivo === 'credenciales' ? 'Contraseña o correo incorrectos' : f.motivo })) },
        { titulo: 'Todas las acciones', total: r.detalle.total, columnas: columnasAccion, filas: r.detalle.filas.map(conNombre) },
      ],
    };
  }

  async function generar(tipo: unknown, consulta: Record<string, unknown>, limite: number): Promise<Reporte> {
    const def: DefinicionReporte | null = definicionReporte(tipo);
    if (!def) throw errorNoEncontrado('Ese reporte no existe.');
    const ahora = d.tiempo.ahora();
    const leidos = leerParametros(def, consulta, ahora, (f, dias) => d.tiempo.inicioDiaLocal(f, dias));
    if (!leidos.ok) throw errorValidacion(leidos.error);
    const p = leidos.valor;
    const parametros: [string, string][] = [];
    if (p.desde && p.hasta) parametros.push(['Período', `${diaHora(p.desde)} a ${diaHora(p.hasta)}`]);
    for (const param of def.parametros) {
      const valor = p.valores[param.clave];
      if (valor === null || valor === '' || valor === undefined || (param.clave === 'minimo' && valor === 1)) continue;
      if (param.tipo === 'camara') parametros.push([param.etiqueta, (await d.repositorio.nombreCamara(Number(valor))) ?? `Cámara ${valor}`]);
      else if (param.tipo === 'opcion') parametros.push([param.etiqueta, param.opciones?.find(o => o.valor === valor)?.etiqueta ?? String(valor)]);
      else parametros.push([param.etiqueta, `${valor}${param.unidad ? ` ${param.unidad}` : ''}`]);
    }
    const cuerpo = def.id === 'vehiculos-frecuentes' ? await vehiculos(p, limite, parametros)
      : def.id === 'estado-sistema' ? await estadoSistema(p, limite, parametros) : await auditoria(p, limite, parametros);
    for (const s of cuerpo.secciones) {
      if (s.total > s.filas.length) s.nota = `${s.nota ? `${s.nota} ` : ''}Se muestran ${numero(s.filas.length)} de ${numero(s.total)} filas; acote el período o los filtros.`;
    }
    return { tipo: def.id, categoria: def.categoria, titulo: def.titulo, descripcion: def.descripcion, generado: ahora.toISOString(), ...cuerpo };
  }

  /** Hoy en la zona de la institución (AAAA-MM-DD), para el nombre del archivo. */
  const hoy = () => {
    const ahora = d.tiempo.ahora();
    return new Date(ahora.getTime() + d.tiempo.desfaseMinutos(ahora) * 60000).toISOString().slice(0, 10);
  };

  return {
    /** Reportes disponibles con sus parámetros (las tarjetas de Reportes). */
    catalogo() {
      return { categorias: CATEGORIAS, reportes: CATALOGO };
    },

    /** Reporte para la vista previa (hasta LIMITE_VISTA filas por sección). */
    generar: (tipo: unknown, consulta: Record<string, unknown>) => generar(tipo, consulta, LIMITE_VISTA),

    /** Excel del reporte con las mismas tablas (sin fotos); la descarga queda en la auditoría. */
    async excel(tipo: unknown, consulta: Record<string, unknown>, actor: Actor) {
      const r = await generar(tipo, consulta, LIMITE_EXCEL);
      const contenido = await d.documentos.excel(r, d.zona);
      const filas = r.secciones.reduce((s, x) => s + x.filas.length, 0);
      await d.auditoria.operacion(actor, 'REPORTE_EXPORTADO', 'reporte', null,
        `${r.titulo} · Excel · ${r.parametros.map(([k, v]) => `${k}: ${v}`).join(' · ') || 'sin filtros'} · ${filas} filas`);
      return { nombre: `${r.tipo}_${hoy()}.xlsx`, contenido };
    },
  };
}

export type CasosReportes = ReturnType<typeof casosReportes>;
