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

/** Placa como la registra el SRI: los autos de 3 dígitos llevan un 0 delante (PZX001 → PZX0001). */
export function placaSri(placa: string): string {
  return /^[A-Z]{3}\d{3}$/.test(placa) ? `${placa.slice(0, 3)}0${placa.slice(3)}` : placa;
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
