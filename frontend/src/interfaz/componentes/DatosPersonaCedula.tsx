import React, { useEffect, useRef, useState } from 'react';
import { UserCheck } from 'lucide-react';
import api from '../../infraestructura/api';
import {
  CAMPOS_PERSONA, type CamposPersona, camposDesdePersona, camposDistintosPersona, type PersonaConocida, textoOrigenPersona,
} from '../../dominio/personaConocida';

/**
 * Autollenado de la persona por su cédula: al completar los 10 dígitos (0,4 s después de la última
 * tecla) se buscan en el propio sistema su nombre, institución, cargo y departamento (permiso
 * vigente, último ingreso, última solicitud o permiso anterior) y se completan los campos vacíos.
 * Si alguno ya escrito no coincide, se ofrece «Usar estos datos». Nunca pisa lo que la persona
 * escribió. La cédula no sale a ningún servicio externo.
 */

type Estado =
  | { tipo: 'inactivo' }
  | { tipo: 'datos'; respuesta: PersonaConocida }
  | { tipo: 'sin-datos' };

export function usePersonaConocida(cedula: string): Estado {
  const [estado, setEstado] = useState<Estado>({ tipo: 'inactivo' });
  const clave = /^\d{10}$/.test(cedula.trim()) ? cedula.trim() : '';
  useEffect(() => {
    if (!clave) { setEstado({ tipo: 'inactivo' }); return undefined; }
    let cancelado = false;
    const t = window.setTimeout(async () => {
      try {
        const r = await api.get<PersonaConocida>(`/detecciones/buscar-cedula/${encodeURIComponent(clave)}`);
        if (!cancelado) setEstado(r.data?.persona ? { tipo: 'datos', respuesta: r.data } : { tipo: 'sin-datos' });
      } catch {
        // Sin permiso o sin conexión con el servidor: el formulario se llena a mano, sin avisos
        if (!cancelado) setEstado({ tipo: 'inactivo' });
      }
    }, 400);
    return () => { cancelado = true; window.clearTimeout(t); };
  }, [clave]);
  return estado;
}

export const DatosPersonaCedula: React.FC<{ cedula: string; valor: CamposPersona; onCambiar: (c: Partial<CamposPersona>) => void }> = ({ cedula, valor, onCambiar }) => {
  const estado = usePersonaConocida(cedula);
  const respuesta = estado.tipo === 'datos' ? estado.respuesta : null;
  const registrados = respuesta ? camposDesdePersona(respuesta) : null;
  const aplicada = useRef('');
  // Lo que se llenó solo con la cédula anterior: se reemplaza con la nueva (lo escrito a mano no)
  const rellenado = useRef<Partial<CamposPersona>>({});
  const [completados, setCompletados] = useState(0);
  useEffect(() => {
    const clave = estado.tipo === 'datos' ? estado.respuesta.cedula : estado.tipo === 'sin-datos' ? `sin:${cedula.trim()}` : '';
    if (!clave || aplicada.current === clave) return;
    aplicada.current = clave;
    const cambios: Partial<CamposPersona> = {};
    const nuevos: Partial<CamposPersona> = {};
    for (const k of CAMPOS_PERSONA) {
      const automatico = rellenado.current[k] !== undefined && valor[k] === rellenado.current[k];
      if (valor[k].trim() && !automatico) continue;
      const v = registrados?.[k];
      if (v) { cambios[k] = v; nuevos[k] = v; } else if (automatico) cambios[k] = '';
    }
    rellenado.current = nuevos;
    setCompletados(Object.keys(nuevos).length);
    if (Object.keys(cambios).length) onCambiar(cambios);
    // Solo cuando llega la respuesta de otra cédula
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  if (estado.tipo === 'inactivo') return null;
  if (estado.tipo === 'sin-datos') {
    return <small className="texto-secundario" role="status">Cédula sin registros en el sistema: escriba los datos de la persona.</small>;
  }
  const distintos = registrados ? camposDistintosPersona(valor, registrados) : [];
  if (!completados && !distintos.length) return null;
  return (
    <div className="persona-cedula-datos" role="status">
      <UserCheck size={15} aria-hidden="true" />
      <span>
        {distintos.length
          ? <><b>Registrado con esta cédula:</b> {registrados!.propietario}{registrados!.institucion ? ` · ${registrados!.institucion}` : ''} (de {textoOrigenPersona(estado.respuesta)}).</>
          : <>Se cargaron los datos de la persona desde {textoOrigenPersona(estado.respuesta)}. Confírmelos con su documento.</>}
      </span>
      {distintos.length > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCambiar(registrados!)}>Usar estos datos</button>}
    </div>
  );
};
