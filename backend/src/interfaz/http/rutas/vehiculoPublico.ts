import { Router } from 'express';
import { authMiddleware, requiereUnoDe } from '../middlewares/auth';
import { vehiculoPublico } from '../../../contenedor/vehiculoPublico';
import { controladorExterno } from '../servicioExterno';
import { actorDe } from '../respuesta';

/**
 * Datos públicos del vehículo por placa (SRI): autocompletan marca, modelo, clase y color en los
 * formularios de ingreso y de permisos. No entrega datos del propietario.
 *
 *   GET /:placa   200 datos · 400 placa inválida · 404 sin datos · 503 desactivado · 502 servicio caído o sin internet
 *
 * Casos de uso en aplicacion/vehiculoPublico.ts; adaptador en infraestructura/servicios/vehiculoPublico.ts.
 */
const router = Router();
router.use(authMiddleware, requiereUnoDe('detecciones:validar', 'padron:agregar', 'padron:gestionar', 'solicitudes:crear', 'alertas:restringir'));

router.get('/:placa', controladorExterno('VEHICULO datos públicos', 'No se pudo consultar los datos del vehículo en el SRI.', async (req, res) => {
  res.json(await vehiculoPublico.consultar(req.params.placa, actorDe(req)));
}));

export default router;
