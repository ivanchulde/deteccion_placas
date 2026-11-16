import type { Deteccion } from './tipos';
import { REGLA_MOTIVO_INGRESO, REGLAS_LISTA_BLANCA, REGLAS_VEHICULO } from './reglas';
import { valorPrecargado } from './validacion';

/**
 * Dueño y vehículo que el sistema ya conoce de una placa (GET /detecciones/buscar-placa/:placa):
 * el titular de su permiso en la lista blanca o, si no tiene, la persona de su último ingreso
 * registrado (visitas que ya vinieron). Todo es local: ningún dato sale del sistema.
 *
 * Al cambiar la placa, los datos que se cargaron solos se reemplazan por los de la nueva placa (o
 * se vacían); lo que escribió la persona no se toca nunca.
 */

export const CAMPOS_AUTOLLENADO = ['propietario', 'cedula', 'institucion', 'cargo', 'departamento', 'tipo_vehiculo', 'marca', 'modelo', 'color', 'motivo_ingreso'] as const;
export type CampoAutollenado = typeof CAMPOS_AUTOLLENADO[number];
export type DatosConocidos = Partial<Record<CampoAutollenado, string | null | undefined>>;

export interface BusquedaPlaca {
  placa: string;
  alerta: unknown;
  autorizado: DatosConocidos | null;
  ultimos_ingresos?: Deteccion[];
}

export type OrigenDatos =
  | { tipo: 'permiso' }
  | { tipo: 'historial'; fecha: string }
  | { tipo: 'nuevo' };

/** Datos de la persona y del vehículo para la placa, y de dónde salen. */
export function datosConocidos(r: BusquedaPlaca): { origen: OrigenDatos; datos: DatosConocidos | null; alerta: boolean } {
  const alerta = Boolean(r.alerta);
  if (r.autorizado) return { origen: { tipo: 'permiso' }, datos: r.autorizado, alerta };
  const previo = (r.ultimos_ingresos ?? []).find(x => (x.datos_permiso?.propietario || x.persona_ingreso || '').trim());
  if (!previo) return { origen: { tipo: 'nuevo' }, datos: null, alerta };
  const p = previo.datos_permiso ?? {};
  return {
    origen: { tipo: 'historial', fecha: previo.fecha_hora_ingreso },
    alerta,
    datos: {
      propietario: p.propietario || previo.persona_ingreso, cedula: p.cedula, institucion: p.institucion, cargo: p.cargo, departamento: p.departamento,
      tipo_vehiculo: p.tipo_vehiculo || previo.tipo_vehiculo || previo.vehiculo?.tipo, marca: p.marca || previo.vehiculo?.marca,
      modelo: p.modelo || previo.vehiculo?.modelo, color: p.color || previo.vehiculo?.color, motivo_ingreso: previo.motivo_ingreso,
    },
  };
}

const REGLAS = { ...REGLAS_LISTA_BLANCA, ...REGLAS_VEHICULO, motivo_ingreso: REGLA_MOTIVO_INGRESO };

/** Valor listo para el formulario (válido para su regla) o '' si no sirve. */
function limpio(campo: CampoAutollenado, valor: string | null | undefined): string {
  const texto = String(valor ?? '').trim();
  if (campo === 'cedula') return /^\d{10}$/.test(texto) ? texto : '';
  return valorPrecargado(texto.slice(0, REGLAS[campo].max), REGLAS[campo]);
}

/**
 * Aplica los datos conocidos sobre el formulario. `previos` son los valores que se cargaron solos
 * con la placa anterior: esos campos se reemplazan (o se vacían si la nueva placa no los trae);
 * un campo escrito por la persona se conserva.
 */
export function aplicarDatosConocidos<T extends Partial<Record<CampoAutollenado, string>>>(actual: T, datos: DatosConocidos | null, previos: Partial<Record<CampoAutollenado, string>>):
  { formulario: T; aplicados: Partial<Record<CampoAutollenado, string>> } {
  const formulario = { ...actual };
  const aplicados: Partial<Record<CampoAutollenado, string>> = {};
  for (const campo of CAMPOS_AUTOLLENADO) {
    const valor = String(actual[campo] ?? '');
    const automatico = previos[campo] !== undefined && valor === previos[campo];
    if (valor.trim() && !automatico) continue;
    const nuevo = limpio(campo, datos?.[campo]);
    if (nuevo) { (formulario as Record<string, string>)[campo] = nuevo; aplicados[campo] = nuevo; }
    else if (automatico) (formulario as Record<string, string>)[campo] = '';
  }
  return { formulario, aplicados };
}
