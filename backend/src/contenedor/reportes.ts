import { casosReportes } from '../aplicacion/reportes';
import { auditoriaSql } from '../infraestructura/adaptadores';
import { calendarioLocal } from '../infraestructura/calendarioLocal';
import { repositorioReportesSql } from '../infraestructura/persistencia/reportesSql';
import { config } from '../infraestructura/servicios/configuracion';
import { documentosReportes } from '../infraestructura/servicios/documentosReportes';
import { saludSistema } from '../infraestructura/servicios/saludSistema';
import { ZONA_HORARIA } from '../infraestructura/servicios/tiempo';

/** Raíz de composición del catálogo de reportes: consultas SQL, Excel, salud del sistema y auditoría. */
export const reportes = casosReportes({
  repositorio: repositorioReportesSql,
  documentos: documentosReportes,
  salud: saludSistema,
  tiempo: calendarioLocal,
  zona: ZONA_HORARIA,
  diasAviso: () => config.entero('aviso_vencimiento_dias'),
  auditoria: auditoriaSql,
});
