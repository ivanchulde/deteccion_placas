import { Router } from 'express';
import { authMiddleware, requierePermiso } from '../middlewares/auth';
import { reportes } from '../../../contenedor/reportes';
import { actorDe, controlador, limitarSimultaneas } from '../respuesta';

/**
 * Catálogo de reportes (tarjetas de Reportes), montado en /api/reportes junto a la hoja de control
 * (reportes:ver). Ver aplicacion/reportes.ts.
 *
 *   GET /catalogo                 reportes disponibles, por categoría, con sus parámetros
 *   GET /catalogo/:tipo           reporte para la vista previa (columnas tipadas y filas; fotos con URL firmada)
 *   GET /catalogo/:tipo/excel     el mismo reporte en Excel (sin fotos), con la descarga auditada
 *
 * Los parámetros van en la consulta (desde, hasta, camara y los propios de cada reporte); un valor
 * inválido responde 400 y un reporte desconocido, 404.
 */
const router = Router();
const ver = [authMiddleware, requierePermiso('reportes:ver')];
const unaExportacionALaVez = limitarSimultaneas(2, 'Hay otras exportaciones en curso. Intente de nuevo en un momento.');

router.get('/catalogo', ...ver, (_req, res) => {
  res.json(reportes.catalogo());
});

router.get('/catalogo/:tipo([a-z-]+)', ...ver, controlador('REPORTES catálogo', 'No se pudo generar el reporte.', async (req, res) => {
  res.json(await reportes.generar(req.params.tipo, req.query as Record<string, unknown>));
}));

router.get('/catalogo/:tipo([a-z-]+)/excel', ...ver, unaExportacionALaVez, controlador('REPORTES Excel', 'No se pudo exportar el reporte.', async (req, res) => {
  const { nombre, contenido } = await reportes.excel(req.params.tipo, req.query as Record<string, unknown>, actorDe(req));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(contenido);
}));

export default router;
