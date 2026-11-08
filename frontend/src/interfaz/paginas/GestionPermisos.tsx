import React, { useEffect, useState } from 'react';
import { AvisoFlotante } from '../componentes/AvisoFlotante';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Plus, ShieldCheck, UserCheck } from 'lucide-react';
import api from '../../infraestructura/api';
import { useAuth } from '../../aplicacion/AuthContext';
import { useEvento, useReconexion } from '../../aplicacion/tiempoReal';
import { useConsulta, useDiferido } from '../../aplicacion/hooks';
import type { PanelAccesos as Panel } from '../../dominio/tipos';
import { numero, relativo } from '../../dominio/formato';
import { formatearPlaca } from '../../dominio/validacion';
import { Kpi } from '../componentes/ui';
import { FormularioLista } from '../componentes/FormularioLista';

import { useNotificar } from '../componentes/Notificaciones';
import Listas from './Listas';

/** Vista del gestor: concede y administra únicamente los permisos de su usuario. */
const GestionPermisos: React.FC = () => {
  const { user } = useAuth();
  const notificar = useNotificar();
  const [params, setParams] = useSearchParams();
  const [concediendo, setConcediendo] = useState<string | null>(null);
  // Los enlaces históricos de solicitudes conservan la pantalla de permisos sin consultar pedidos.
  useEffect(() => {
    const siguientes = new URLSearchParams(params);
    for (const clave of ['pestana', 'seccion', 'id', 'usuarioId']) siguientes.delete(clave);
    if (siguientes.toString() !== params.toString()) setParams(siguientes, { replace: true });
  }, [params, setParams]);

  const { datos: p, cargando, error, recargar } = useConsulta<Panel>(() => api.get('/panel/accesos').then(r => r.data), []);
  const diferido = useDiferido(() => recargar(true), 3000);
  useReconexion(() => recargar(true));
  useEvento('listas:actualizadas', diferido);
  useEvento('deteccion:actualizada', diferido);

  const cambiar = (filtros: Record<string, string> = {}) => setParams(filtros);

  return (
    <div className="pagina">
      <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 21, fontWeight: 800 }}>Gestión de permisos · {user?.nombre.split(' ')[0]}</h2>
          <p className="texto-secundario">Entregue y administre los permisos de acceso de su lista blanca · {p ? `actualizado ${relativo(p.generado)}` : 'cargando…'}</p>
        </div>
        <button className="btn btn-navy" onClick={() => setConcediendo('')}><Plus size={16} /> Entregar permiso</button>
      </div>
      {error && <AvisoFlotante tipo="error" style={{ marginBottom: 16 }}>{error}</AvisoFlotante>}

      <div className="pila">
        <div className="grid-kpi">
          <Kpi etiqueta="Mis permisos vigentes" valor={numero(p?.padron.vigentes)} icono={<ShieldCheck size={17} />} cargando={cargando}
            color="var(--autorizado)" fondo="var(--autorizado-bg)" onClick={() => cambiar({ vigencia: 'vigentes' })}
            pie={p ? `${numero(p.padron.con_horario)} con horario · ${numero(p.padron.por_iniciar)} por iniciar` : undefined} />
          <Kpi etiqueta="Mis permisos vencidos" valor={numero(p?.padron.vencidos)} icono={<CalendarClock size={17} />} cargando={cargando}
            color="var(--no-registrado)" fondo="var(--no-registrado-bg)" onClick={() => cambiar({ vigencia: 'vencidas' })}
            pie="Permisos vencidos sin retirar" />
          <Kpi etiqueta="Mis permisos otorgados" valor={numero(p?.padron.total)} icono={<UserCheck size={17} />} cargando={cargando}
            color="var(--navy-700)" onClick={() => cambiar()}
            pie={`${numero(p?.padron.sin_placa)} pendientes de placa · solo su usuario`} />
        </div>

        {/* La clave reinicia los filtros de la lista cuando cambian en la URL (vigencia, búsqueda) */}
        <Listas key={params.toString()} tipo="autorizados" incrustada soloMios />

      </div>

      {concediendo !== null && (
        <FormularioLista tipo="autorizados" inicial={concediendo ? { placa: concediendo } : undefined} onCerrar={() => setConcediendo(null)}
          onGuardado={r => { setConcediendo(null); notificar('exito', `Permiso concedido a ${r.placa ? formatearPlaca(r.placa) : r.propietario}`); recargar(true); }} />
      )}
    </div>
  );
};

export default GestionPermisos;
