import { REGLAS_VEHICULO } from './reglas';
import { valorPrecargado } from './validacion';

/**
 * Datos públicos del vehículo por placa (SRI, GET /api/vehiculo-publico/:placa): marca, modelo,
 * año, clase y color de la matrícula. No incluyen al propietario. Aquí se convierten en los
 * campos del formulario (tipo, marca, modelo, color), siempre válidos para sus reglas.
 */
export interface DatosVehiculoPublico {
  placa: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  clase: string | null;
  color: string | null;
  pais: string | null;
  cilindraje: number | null;
  ultimoAnioPagado: number | null;
  fuente: string;
}

export type CamposVehiculo = { tipo_vehiculo: string; marca: string; modelo: string; color: string };

/** Clase de la matrícula del SRI → tipo de vehículo del catálogo (null si no se reconoce). */
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

/** Campos que el SRI permite completar (solo los que trae y pasan la validación del formulario). */
export function camposDesdeSri(d: DatosVehiculoPublico): Partial<CamposVehiculo> {
  const c: Partial<CamposVehiculo> = {};
  const poner = (campo: keyof CamposVehiculo, valor: string | null | undefined) => {
    const v = valorPrecargado((valor ?? '').slice(0, REGLAS_VEHICULO[campo].max), REGLAS_VEHICULO[campo]);
    if (v) c[campo] = v;
  };
  poner('tipo_vehiculo', tipoDesdeClase(d.clase));
  poner('marca', d.marca);
  poner('modelo', d.modelo);
  poner('color', d.color);
  return c;
}

const igual = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/** Campos ya escritos que no coinciden con el SRI (para ofrecer reemplazarlos). */
export function camposDistintos(actual: CamposVehiculo, sri: Partial<CamposVehiculo>): (keyof CamposVehiculo)[] {
  return (Object.keys(sri) as (keyof CamposVehiculo)[]).filter(k => actual[k].trim() && !igual(actual[k], sri[k]!));
}

/** «SUZUKI FORSA · 1988 · Ecuador · matrícula pagada hasta 2026» */
export function resumenSri(d: DatosVehiculoPublico): string {
  return [[d.marca, d.modelo].filter(Boolean).join(' '), d.anio ? `año ${d.anio}` : null, d.clase?.toLowerCase(), d.color?.toLowerCase(),
    d.ultimoAnioPagado ? `matrícula pagada hasta ${d.ultimoAnioPagado}` : null].filter(Boolean).join(' · ');
}
