import { casosVehiculoPublico } from '../aplicacion/vehiculoPublico';
import { auditoriaSql } from '../infraestructura/adaptadores';
import { crearProveedorVehiculoPublico } from '../infraestructura/servicios/vehiculoPublico';

/** Raíz de composición de los datos públicos del vehículo: adaptador HTTP del SRI y auditoría en SQL. */
export const vehiculoPublico = casosVehiculoPublico({ proveedor: crearProveedorVehiculoPublico(), auditoria: auditoriaSql });
