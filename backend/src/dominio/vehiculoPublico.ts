/**
 * Datos públicos del vehículo por su placa (dominio puro): lo que publica el SRI sobre la
 * matrícula —marca, modelo, año, clase, color, país y último año pagado—. NO trae datos del
 * propietario. La consulta la hace infraestructura/servicios/vehiculoPublico.ts y el caso de uso
 * (caché, auditoría) está en aplicacion/vehiculoPublico.ts.
 */

export interface DatosVehiculoPublico {
  placa: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  /** Clase de la matrícula (AUTOMOVIL, CAMIONETA, MOTOCICLETA…) */
  clase: string | null;
  color: string | null;
  pais: string | null;
  cilindraje: number | null;
  ultimoAnioPagado: number | null;
  /** Quién respondió, para mostrarlo junto a los datos */
  fuente: string;
}

import { normalizarPlaca, placaAnt, validarTexto } from './validacion';

/** Placa como la registra el SRI: los autos de 3 dígitos llevan un 0 delante (PZX001 → PZX0001). */
export function placaSri(placa: string): string {
  return placaAnt(placa);
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 60) : null);
const entero = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * Lee la respuesta `{ vehiculo: { descripcionMarca, descripcionModelo, anioAuto, … } }` del servicio
 * de matriculación. Devuelve null si no hay vehículo, si no trae ni marca ni modelo o si la placa
 * de la respuesta no es la consultada.
 */
export function leerVehiculoPublico(respuesta: unknown, placa: string, fuente: string): DatosVehiculoPublico | null {
  const v = respuesta && typeof respuesta === 'object' ? (respuesta as Record<string, unknown>).vehiculo : null;
  if (!v || typeof v !== 'object') return null;
  const x = v as Record<string, unknown>;
  const devuelta = texto(x.numeroPlaca)?.replace(/[^A-Z0-9]/g, '');
  if (devuelta && devuelta !== placaSri(placa) && devuelta !== placa) return null;
  const marca = texto(x.descripcionMarca);
  const modelo = texto(x.descripcionModelo);
  if (!marca && !modelo) return null;
  return {
    placa, marca, modelo, anio: entero(x.anioAuto, 1900, 2100), clase: texto(x.nombreClase), color: texto(x.colorVehiculo1),
    pais: texto(x.descripcionPais), cilindraje: entero(x.cilindraje, 1, 30000), ultimoAnioPagado: entero(x.ultimoAnioPagado, 1900, 2100), fuente,
  };
}

/**
 * Clase de la matrícula del SRI → tipo de vehículo del catálogo (null si no se reconoce). Es la misma
 * regla del formulario (frontend/src/dominio/vehiculoPublico.ts → tipoDesdeClase).
 */
export function tipoDesdeClase(clase: string | null | undefined): string | null {
  const t = (clase ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (!t.trim()) return null;
  if (/MOTO/.test(t)) return 'Motocicleta';
  if (/CAMIONETA|PICK ?UP/.test(t)) return 'Camioneta';
  if (/JEEP|SUV|TODO TERRENO/.test(t)) return 'SUV';
  if (/CAMION|VOLQUETA|TRAILER|TANQUERO|TRACTO/.test(t)) return 'Camión';
  if (/BUS/.test(t)) return 'Bus';
  if (/FURGON|\bVAN\b/.test(t)) return 'Furgoneta';
  if (/AUTOMOVIL|SEDAN|COUPE|HATCH|AUTO/.test(t)) return 'Automóvil';
  return null;
}

/**
 * Datos del SRI guardados en un paso (DeteccionVehiculo.vehiculo_sri, JSON): de qué placa son y los
 * campos que completan la fila (tipo, marca y modelo) más lo que solo se muestra. `sin_datos` = el
 * SRI no tiene esa placa (no se vuelve a consultar).
 */
export interface VehiculoSriPaso {
  placa: string;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  clase: string | null;
  anio: number | null;
  color: string | null;
  sin_datos?: true;
}

/** Mismo límite y caracteres que la persona puede escribir en la celda (alfanumérico, 50). */
function campoFila(valor: string | null): string | null {
  const v = (valor ?? '').trim().slice(0, 50).trim();
  return v && validarTexto(v, { etiqueta: 'Vehículo', tipo: 'alfanumerico', max: 50 }).ok ? v : null;
}

/** Lo que se guarda en el paso con la respuesta del SRI para `placa` (null = sin datos). */
export function vehiculoSriDelPaso(placa: string, datos: DatosVehiculoPublico | null): VehiculoSriPaso {
  const p = normalizarPlaca(placa);
  if (!datos) return { placa: p, tipo: null, marca: null, modelo: null, clase: null, anio: null, color: null, sin_datos: true };
  return {
    placa: p, tipo: tipoDesdeClase(datos.clase), marca: campoFila(datos.marca), modelo: campoFila(datos.modelo),
    clase: datos.clase, anio: datos.anio, color: datos.color,
  };
}

/** Datos del SRI guardados en el paso (texto JSON u objeto); null si faltan o están dañados. */
export function leerVehiculoSri(valor: unknown): VehiculoSriPaso | null {
  let v: unknown = valor;
  if (typeof valor === 'string') {
    if (!valor.trim()) return null;
    try { v = JSON.parse(valor); } catch { return null; }
  }
  if (!v || typeof v !== 'object' || typeof (v as VehiculoSriPaso).placa !== 'string') return null;
  return v as VehiculoSriPaso;
}

/**
 * Datos del SRI del paso solo si son de la placa que tiene ahora: si el personal corrige la placa,
 * los de la lectura anterior dejan de mostrarse solos (y se consultan los de la nueva).
 */
export function vehiculoSriVigente(d: Record<string, any>): VehiculoSriPaso | null {
  const sri = leerVehiculoSri(d.vehiculo_sri);
  if (!sri || sri.sin_datos) return null;
  const placa = normalizarPlaca(d.placa_validada || d.placa_reconocida);
  return placa && placaAnt(sri.placa) === placaAnt(placa) ? sri : null;
}
