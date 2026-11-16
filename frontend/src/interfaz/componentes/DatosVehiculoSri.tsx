import React, { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';
import api from '../../infraestructura/api';
import { validarPlaca } from '../../dominio/validacion';
import {
  type CamposVehiculo, camposDesdeSri, camposDistintos, type DatosVehiculoPublico, resumenSri,
} from '../../dominio/vehiculoPublico';

/**
 * Autollenado del vehículo con los datos públicos del SRI: al escribir o confirmar una placa
 * válida (0,6 s después de la última tecla) se piden marca, modelo, clase y color, se completan
 * los campos vacíos y, si alguno ya escrito no coincide, se ofrece «Usar los datos del SRI».
 * Nunca pisa lo que la persona escribió ni lo que vino del permiso. Sin internet o con la consulta
 * desactivada, el formulario se llena a mano como siempre.
 */

type Estado =
  | { tipo: 'inactivo' }
  | { tipo: 'consultando' }
  | { tipo: 'datos'; datos: DatosVehiculoPublico }
  | { tipo: 'sin-datos' }
  | { tipo: 'error' };

export function useVehiculoPublico(placa: string): Estado {
  const [estado, setEstado] = useState<Estado>({ tipo: 'inactivo' });
  const leida = validarPlaca(placa);
  const clave = leida.ok ? leida.valor.placa : '';
  useEffect(() => {
    if (!clave) { setEstado({ tipo: 'inactivo' }); return undefined; }
    let cancelado = false;
    const t = window.setTimeout(async () => {
      setEstado({ tipo: 'consultando' });
      try {
        const r = await api.get<DatosVehiculoPublico>(`/vehiculo-publico/${encodeURIComponent(clave)}`, { timeout: 15000 });
        if (!cancelado) setEstado({ tipo: 'datos', datos: r.data });
      } catch (e) {
        if (cancelado) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        // 503 = desactivada en el servidor y 403 = sin permiso: no se muestra nada
        setEstado(status === 404 ? { tipo: 'sin-datos' } : status === 503 || status === 403 ? { tipo: 'inactivo' } : { tipo: 'error' });
      }
    }, 600);
    return () => { cancelado = true; window.clearTimeout(t); };
  }, [clave]);
  return estado;
}

export const DatosVehiculoSri: React.FC<{ placa: string; valor: CamposVehiculo; onCambiar: (c: Partial<CamposVehiculo>) => void }> = ({ placa, valor, onCambiar }) => {
  const estado = useVehiculoPublico(placa);
  const datos = estado.tipo === 'datos' ? estado.datos : null;
  const sri = datos ? camposDesdeSri(datos) : null;
  const aplicada = useRef('');
  // Lo que se llenó solo con la placa anterior: se reemplaza con la nueva (lo escrito a mano no)
  const rellenado = useRef<Partial<CamposVehiculo>>({});
  useEffect(() => {
    if (!datos || !sri || aplicada.current === datos.placa) return;
    aplicada.current = datos.placa;
    const cambios: Partial<CamposVehiculo> = {};
    const nuevos: Partial<CamposVehiculo> = {};
    for (const k of ['tipo_vehiculo', 'marca', 'modelo', 'color'] as const) {
      const automatico = rellenado.current[k] !== undefined && valor[k] === rellenado.current[k];
      if (valor[k].trim() && !automatico) continue;
      if (sri[k]) { cambios[k] = sri[k]; nuevos[k] = sri[k]; } else if (automatico) cambios[k] = '';
    }
    rellenado.current = nuevos;
    if (Object.keys(cambios).length) onCambiar(cambios);
    // Solo cuando llegan los datos de otra placa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos]);

  if (estado.tipo === 'inactivo') return null;
  if (estado.tipo === 'consultando') return <small className="texto-secundario vehiculo-sri" role="status"><Loader2 size={13} className="girar" /> Buscando los datos del vehículo en el SRI…</small>;
  if (estado.tipo === 'sin-datos') return <small className="texto-secundario vehiculo-sri" role="status">El SRI no tiene datos públicos de esta placa: complete el vehículo a mano.</small>;
  if (estado.tipo === 'error') return <small className="texto-secundario vehiculo-sri" role="status">No se pudo consultar el SRI (sin conexión o servicio caído): complete el vehículo a mano.</small>;
  const distintos = sri ? camposDistintos(valor, sri) : [];
  return (
    <div className="vehiculo-sri vehiculo-sri-datos" role="status">
      <BadgeCheck size={15} aria-hidden="true" />
      <span><b>Datos del SRI:</b> {resumenSri(estado.datos)}</span>
      {distintos.length > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCambiar(sri!)}>Usar los datos del SRI</button>}
    </div>
  );
};
