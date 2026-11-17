import { ACTOR_SISTEMA, type Actor, errorNoDisponible, errorNoEncontrado, errorValidacion, type PuertoAuditoria } from './comun';
import { validarPlaca } from '../dominio/validacion';
import { type DatosVehiculoPublico, placaSri } from '../dominio/vehiculoPublico';

/**
 * Datos públicos del vehículo por placa (marca, modelo, año, clase, color): autocompletan los
 * formularios de ingreso y de permisos. Gratuito y sin datos del propietario.
 *
 * - Solo placas con formato ANT (400) y con el servicio habilitado (503).
 * - Caché en memoria por placa (también de las placas sin datos): un vehículo que entra cada día
 *   no se vuelve a consultar fuera del sistema.
 * - Cada consulta que sale del sistema queda en la auditoría (CONSULTA_VEHICULO) con su usuario.
 * - Una falla del servicio (sin internet, caída) no se guarda en la caché y llega como error.
 */

export interface ProveedorVehiculoPublico {
  readonly nombre: string;
  readonly habilitado: boolean;
  /** `placa` en el formato del sistema; el adaptador la envía como la registra el SRI */
  consultar(placa: string): Promise<DatosVehiculoPublico | null>;
}

export interface DependenciasVehiculoPublico {
  proveedor: ProveedorVehiculoPublico;
  auditoria: PuertoAuditoria;
  ahora?: () => number;
  /** Vigencia de la caché (12 h por omisión) */
  vigenciaMs?: number;
  /** Placas guardadas como máximo (500 por omisión) */
  maxCache?: number;
}

export const MENSAJE_DESHABILITADO_VEHICULO = 'La consulta de datos del vehículo está desactivada (VEHICULO_PUBLICO_HABILITADO=false).';

export function casosVehiculoPublico(d: DependenciasVehiculoPublico) {
  const ahora = d.ahora ?? Date.now;
  const vigencia = d.vigenciaMs ?? 12 * 3_600_000;
  const maximo = d.maxCache ?? 500;
  const cache = new Map<string, { t: number; datos: DatosVehiculoPublico | null }>();

  /** Datos de una placa ya validada (null = el SRI no la tiene); la consulta externa queda auditada. */
  async function buscar(placa: string, actor: Actor): Promise<DatosVehiculoPublico | null> {
    const guardado = cache.get(placa);
    if (guardado && ahora() - guardado.t < vigencia) return guardado.datos;
    const datos = await d.proveedor.consultar(placa);
    cache.delete(placa);
    cache.set(placa, { t: ahora(), datos });
    if (cache.size > maximo) cache.delete(cache.keys().next().value!);
    await d.auditoria.operacion(actor, 'CONSULTA_VEHICULO', 'vehiculo', null,
      `Datos públicos del vehículo · ${placaSri(placa)} · ${d.proveedor.nombre} · ${datos ? 'con datos' : 'sin datos'}`).catch(() => undefined);
    return datos;
  }

  return {
    habilitado: () => d.proveedor.habilitado,

    async consultar(entrada: unknown, actor: Actor): Promise<DatosVehiculoPublico> {
      const p = validarPlaca(entrada);
      if (!p.ok) throw errorValidacion(p.error);
      if (!d.proveedor.habilitado) throw errorNoDisponible(MENSAJE_DESHABILITADO_VEHICULO);
      const datos = await buscar(p.valor.placa, actor);
      if (!datos) throw errorNoEncontrado('El SRI no tiene datos públicos de esa placa.');
      return datos;
    },

    /**
     * Consulta del propio sistema al leer una placa (completa la fila del registro): null si el SRI
     * no tiene la placa; lanza si la placa no es válida, si está desactivada o si el servicio falla.
     */
    async porPlaca(entrada: string): Promise<DatosVehiculoPublico | null> {
      const p = validarPlaca(entrada);
      if (!p.ok) throw errorValidacion(p.error);
      if (!d.proveedor.habilitado) throw errorNoDisponible(MENSAJE_DESHABILITADO_VEHICULO);
      return buscar(p.valor.placa, ACTOR_SISTEMA);
    },
  };
}

export type CasosVehiculoPublico = ReturnType<typeof casosVehiculoPublico>;
