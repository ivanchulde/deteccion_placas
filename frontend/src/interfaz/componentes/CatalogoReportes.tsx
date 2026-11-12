import React from 'react';
import { CarFront, ServerCog, ShieldCheck, type LucideIcon } from 'lucide-react';

/**
 * Portada de Reportes: tres tarjetas de colores, una por reporte (vehículos que más ingresan,
 * estado del sistema y auditoría). Cada una abre el reporte del servidor (?reporte=…), que se
 * genera al abrirlo.
 */

export interface TarjetaReporte {
  id: string;
  titulo: string;
  ayuda: string;
  /** Lo que se obtiene, en tres frases cortas */
  incluye: string[];
  icono: LucideIcon;
  color: 'azul' | 'teal' | 'morado';
}

export const TARJETAS: TarjetaReporte[] = [
  { id: 'vehiculos-frecuentes', titulo: 'Vehículos que más ingresan', icono: CarFront, color: 'azul',
    ayuda: 'Ranking completo de vehículos con su titular, datos del vehículo y fotos.',
    incluye: ['Ranking con todos los datos y fotos', 'Marcas, tipos, colores e instituciones', 'Horas y días con más ingresos'] },
  { id: 'estado-sistema', titulo: 'Estado del sistema', icono: ServerCog, color: 'teal',
    ayuda: 'Qué funciona, qué falla y qué hacer: cámaras, motor ANPR, base de datos, almacenamiento y operación.',
    incluye: ['Verificación de cada componente', 'Disponibilidad y lectura por cámara', 'Recomendaciones para cada falla'] },
  { id: 'auditoria', titulo: 'Auditoría', icono: ShieldCheck, color: 'morado',
    ayuda: 'Quién hizo qué y cuándo, con las acciones sensibles e inicios de sesión fallidos.',
    incluye: ['Acciones por usuario y por tipo', 'Eliminaciones, correcciones y exportaciones', 'Inicios de sesión fallidos'] },
];

export const tarjetaDe = (id: string | null | undefined) => TARJETAS.find(t => t.id === id) ?? null;

export const CatalogoReportes: React.FC<{ onAbrir: (t: TarjetaReporte) => void }> = ({ onAbrir }) => (
  <ul className="reportes-tarjetas reportes-tarjetas-grandes">
    {TARJETAS.map(t => {
      const Icono = t.icono;
      return (
        <li key={t.id}>
          <button type="button" className={`reporte-tarjeta reporte-tarjeta-${t.color}`} title={t.ayuda} onClick={() => onAbrir(t)}>
            <span className="reporte-tarjeta-icono" aria-hidden="true"><Icono size={30} strokeWidth={1.8} /></span>
            <span className="reporte-tarjeta-titulo">{t.titulo}</span>
            <span className="reporte-tarjeta-incluye">{t.incluye.map(x => <span key={x}>{x}</span>)}</span>
          </button>
        </li>
      );
    })}
  </ul>
);
