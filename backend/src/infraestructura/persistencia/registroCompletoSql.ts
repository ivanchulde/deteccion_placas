import { DATOS_AUSENTES_REGISTRO } from '../../dominio/registroCompleto';
import { placaAntSql } from './placaSql';

const ausentes = DATOS_AUSENTES_REGISTRO.map(v => `'${v}'`).join(', ');
const dato = (campo: string) => `CASE WHEN LOWER(BTRIM(${campo})) IN (${ausentes}) THEN NULL ELSE BTRIM(${campo}) END`;
/**
 * Campo de los datos del SRI guardados en el paso, solo si son de su placa actual (igual que
 * vehiculoSriVigente en dominio/vehiculoPublico.ts). El JSON lo escribe únicamente el backend.
 */
const sri = (campo: 'tipo' | 'marca') => `CASE WHEN NULLIF(registro.vehiculo_sri, '') IS NOT NULL
      AND ${placaAntSql("registro.vehiculo_sri::jsonb ->> 'placa'")}
        = ${placaAntSql("COALESCE(NULLIF(registro.placa_validada, ''), registro.placa_reconocida)")}
      THEN NULLIF(BTRIM(registro.vehiculo_sri::jsonb ->> '${campo}'), '') END`;
/** EXISTS permite reutilizar la regla también en COUNT y eliminación sin depender de joins externos. */
export const DATOS_INGRESO_COMPLETOS_SQL = `(
  COALESCE(d.tipo_movimiento, 'ingreso') = 'ingreso'
  AND d.fecha_hora_ingreso IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM DeteccionVehiculo registro
    LEFT JOIN ListaBlanca permiso ON permiso.id = registro.vehiculo_autorizado_id
    WHERE registro.id = d.id
      AND COALESCE(${dato('registro.persona_ingreso')}, ${dato('permiso.propietario')}) IS NOT NULL
      AND COALESCE(${dato('registro.tipo_vehiculo')}, ${dato('permiso.tipo_vehiculo')}, ${dato('registro.vehiculo_tipo')}, ${sri('tipo')}) IS NOT NULL
      AND COALESCE(${dato('registro.vehiculo_marca')}, ${dato('permiso.marca')}, ${sri('marca')}) IS NOT NULL
      AND COALESCE(${dato('registro.motivo_ingreso')}, ${dato('permiso.motivo_ingreso')}) IS NOT NULL
  )
)`;
export const REGISTRO_COMPLETO_SQL = `(${DATOS_INGRESO_COMPLETOS_SQL}
  AND d.fecha_hora_salida IS NOT NULL AND d.fecha_hora_salida >= d.fecha_hora_ingreso
)`;
