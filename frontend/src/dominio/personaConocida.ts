import { REGLAS_LISTA_BLANCA } from './reglas';
import { valorPrecargado } from './validacion';
import { fecha as formatoFecha, fechaHora } from './formato';

/**
 * Datos de una persona que el sistema ya tiene registrados con su cédula
 * (GET /api/detecciones/buscar-cedula/:cedula): nombre, institución, cargo y departamento de su
 * permiso vigente, su último ingreso, su última solicitud o un permiso anterior. Todo es local:
 * la cédula no sale a ningún servicio externo. Aquí se convierten en los campos del formulario.
 */

export type OrigenPersona = 'permiso' | 'ingreso' | 'solicitud' | 'permiso_anterior';

export interface PersonaConocida {
  cedula: string;
  origen: OrigenPersona | null;
  fecha: string | null;
  persona: { propietario: string; institucion: string | null; cargo: string | null; departamento: string | null } | null;
}

export const CAMPOS_PERSONA = ['propietario', 'institucion', 'cargo', 'departamento'] as const;
export type CampoPersona = typeof CAMPOS_PERSONA[number];
export type CamposPersona = Record<CampoPersona, string>;

/** Campos que se pueden completar (solo los que vienen y pasan la validación del formulario). */
export function camposDesdePersona(r: PersonaConocida): Partial<CamposPersona> {
  const c: Partial<CamposPersona> = {};
  if (!r.persona) return c;
  for (const campo of CAMPOS_PERSONA) {
    const v = valorPrecargado((r.persona[campo] ?? '').slice(0, REGLAS_LISTA_BLANCA[campo].max), REGLAS_LISTA_BLANCA[campo]);
    if (v) c[campo] = v;
  }
  return c;
}

const igual = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/** Campos ya escritos que no coinciden con lo registrado (para ofrecer reemplazarlos). */
export function camposDistintosPersona(actual: CamposPersona, registrados: Partial<CamposPersona>): CampoPersona[] {
  return (Object.keys(registrados) as CampoPersona[]).filter(k => actual[k].trim() && !igual(actual[k], registrados[k]!));
}

/** De dónde salen los datos, para mostrarlo junto a ellos. */
export function textoOrigenPersona(r: Pick<PersonaConocida, 'origen' | 'fecha'>): string {
  switch (r.origen) {
    case 'permiso': return 'su permiso vigente en la lista blanca';
    case 'ingreso': return `su ingreso del ${fechaHora(r.fecha)}`;
    case 'solicitud': return `su solicitud del ${formatoFecha(r.fecha)}`;
    case 'permiso_anterior': return 'un permiso anterior que ya no está vigente';
    default: return 'los registros del sistema';
  }
}
