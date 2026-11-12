import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { mensajes } from '../../../contenedor/mensajes';
import { actorDe, controlador } from '../respuesta';

/**
 * Mensajería interna del personal (guardianía, servicios institucionales y administración). Cada
 * usuario ve solo sus conversaciones; los mensajes nuevos llegan por Socket.IO (`mensaje:nuevo`,
 * `mensajes:leidos`) a los dos participantes.
 *
 *   GET  /contactos              usuarios activos agrupados, con su último mensaje y los no leídos
 *   GET  /resumen                { no_leidos } para el ícono del encabezado
 *   GET  /:usuarioId             conversación (40 por página; ?antes_de=<id> para los anteriores)
 *   POST /:usuarioId             envía { texto } (hasta 2000 caracteres, conserva los saltos de línea)
 *   POST /:usuarioId/leidos      marca como leído lo que ese usuario le escribió
 *   DELETE /:usuarioId           elimina la conversación para los dos (auditado, sin el contenido)
 *
 * Casos de uso en aplicacion/mensajes.ts.
 */
const router = Router();
router.use(authMiddleware);

router.get('/contactos', controlador('MENSAJES contactos', 'No se pudieron obtener los contactos.', async (req, res) => {
  res.json(await mensajes.contactos(actorDe(req)));
}));

router.get('/resumen', controlador('MENSAJES resumen', 'No se pudo obtener el resumen de mensajes.', async (req, res) => {
  res.json(await mensajes.resumen(actorDe(req)));
}));

router.get('/:usuarioId(\\d+)', controlador('MENSAJES conversación', 'No se pudo abrir la conversación.', async (req, res) => {
  res.json(await mensajes.conversacion(actorDe(req), req.params.usuarioId, req.query));
}));

router.post('/:usuarioId(\\d+)', controlador('MENSAJES enviar', 'No se pudo enviar el mensaje.', async (req, res) => {
  res.status(201).json(await mensajes.enviar(actorDe(req), req.params.usuarioId, req.body));
}));

router.post('/:usuarioId(\\d+)/leidos', controlador('MENSAJES leídos', 'No se pudieron marcar los mensajes como leídos.', async (req, res) => {
  res.json(await mensajes.marcarLeidos(actorDe(req), req.params.usuarioId));
}));

router.delete('/:usuarioId(\\d+)', controlador('MENSAJES eliminar conversación', 'No se pudo eliminar la conversación.', async (req, res) => {
  res.json(await mensajes.eliminarConversacion(actorDe(req), req.params.usuarioId));
}));

export default router;
