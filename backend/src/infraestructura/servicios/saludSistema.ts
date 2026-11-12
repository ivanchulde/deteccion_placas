import type { PuertoSaludSistema } from '../../aplicacion/reportes';
import { usoEvidencia } from './conservacionEvidencia';
import { emailService } from './emailService';
import { estadoServicioAnpr } from './servicioAnpr';

/** Motor ANPR, almacenamiento de evidencia y correo saliente para el reporte «Estado del sistema». */
export const saludSistema: PuertoSaludSistema = {
  async motor() {
    const e = await estadoServicioAnpr();
    if (!e.en_linea) return { en_linea: false, detalle: e.error ?? 'Servicio no disponible', cpu: null, camaras: [] };
    const camaras = e.camaras ?? [];
    const cpus = (e.motores ?? []).flatMap(m => (m.en_linea && m.cpu_pct !== null && Number.isFinite(m.cpu_pct) ? [m.cpu_pct] : []));
    return {
      en_linea: true,
      cpu: cpus.length ? cpus.reduce((s, v) => s + v, 0) / cpus.length : null,
      camaras: camaras.map(c => ({ id: c.id, conectada: c.conectada })),
      detalle: `En línea · ${camaras.filter(c => c.conectada).length} de ${camaras.length} cámaras con video · ${e.fps_procesamiento ?? 0} fps de análisis`
        + `${e.motores && e.motores.length > 1 ? ` · ${e.motores.filter(m => m.en_linea).length} de ${e.motores.length} motores` : ''}`,
    };
  },
  async almacenamiento() {
    const u = usoEvidencia();
    return { usados: u.bytes, libres: u.libres, maximo: u.maximo || null };
  },
  correo: () => emailService.smtpConfigurado(),
};
