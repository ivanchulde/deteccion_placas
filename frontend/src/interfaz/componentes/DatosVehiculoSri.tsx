import React, { useEffect, useRef, useState } from 'react';
import api from '../../infraestructura/api';
import { validarPlaca } from '../../dominio/validacion';
import { type CamposVehiculo, camposDesdeSri, type DatosVehiculoPublico } from '../../dominio/vehiculoPublico';

/**
 * Autollenado del vehículo con los datos públicos del SRI: al escribir o confirmar una placa
 * válida (0,6 s después de la última tecla) se piden marca, modelo, clase y color y se completan
 * los campos vacíos, sin mostrar ningún cuadro. Nunca pisa lo que la persona escribió ni lo que vino
 * del permiso. Sin internet, sin datos o con la consulta desactivada, el formulario se llena a mano.
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
        // 503 = desactivada en el servidor y 403 = sin permiso
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
  const aplicada = useRef('');
  // Lo que se llenó solo con la placa anterior: se reemplaza con la nueva (lo escrito a mano no)
  const rellenado = useRef<Partial<CamposVehiculo>>({});
  useEffect(() => {
    if (!datos || aplicada.current === datos.placa) return;
    aplicada.current = datos.placa;
    const sri = camposDesdeSri(datos);
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

  return null;
};
