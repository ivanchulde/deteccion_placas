import React, { useEffect, useRef } from 'react';
import type { TipoAviso } from '../../aplicacion/notificar';
import { useNotificar } from './Notificaciones';

const TITULOS: Record<TipoAviso, string> = {
  info: 'Información', exito: 'Operación completada',
  error: 'No se pudo completar la operación', advertencia: 'Atención',
};

function textoDelAviso(contenido: React.ReactNode): string {
  return React.Children.toArray(contenido).map(parte => {
    if (typeof parte === 'string' || typeof parte === 'number') return String(parte);
    if (React.isValidElement<{ children?: React.ReactNode }>(parte)) {
      const texto = textoDelAviso(parte.props.children);
      return typeof parte.type === 'string' && ['br', 'div', 'li', 'p', 'ul'].includes(parte.type) ? ` ${texto} ` : texto;
    }
    return '';
  }).join('');
}

/** Emite el aviso en la esquina una vez por mensaje, sin ocupar espacio dentro del módulo. */
export const AvisoFlotante: React.FC<{
  tipo?: TipoAviso; titulo?: string; children: React.ReactNode;
  alClic?: () => void; style?: React.CSSProperties;
}> = ({ tipo = 'info', titulo = TITULOS[tipo], children, alClic }) => {
  const notificar = useNotificar();
  const texto = textoDelAviso(children).replace(/\s+/g, ' ').trim();
  const emitido = useRef('');
  const accion = useRef(alClic);
  accion.current = alClic;
  const tieneAccion = Boolean(alClic);
  useEffect(() => {
    const clave = JSON.stringify([tipo, titulo, texto, tieneAccion]);
    if (!texto || emitido.current === clave) return;
    emitido.current = clave;
    notificar(tipo, titulo, texto, tieneAccion ? () => accion.current?.() : undefined);
  }, [notificar, tipo, titulo, texto, tieneAccion]);
  return null;
};
