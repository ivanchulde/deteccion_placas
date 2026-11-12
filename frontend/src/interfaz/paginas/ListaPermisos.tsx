import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Clock, Download, FileCheck2, LogIn, Search, UserCheck } from 'lucide-react';
import api from '../../infraestructura/api';
import { useAuth } from '../../aplicacion/AuthContext';
import { useEvento, useReconexion } from '../../aplicacion/tiempoReal';
import { useConsulta, useDiferido } from '../../aplicacion/hooks';
import type { EstadoPermisoHoy, PermisoOtorgado } from '../../dominio/tipos';
import { fecha, fechaHora, fechaIsoLocal, hora, numero } from '../../dominio/formato';
import { descargarBlob } from '../../infraestructura/descargas';
import { AvisoFlotante } from '../componentes/AvisoFlotante';
import { FilasEsqueleto, Kpi, Placa, Segmentado, Tarjeta, Vacio } from '../componentes/ui';

/**
 * Lista de Permisos de la garita: cada permiso que otorgó un gestor de permisos (servicios
 * institucionales), uno por uno, para que el guardia sepa quién ingresa hoy, por qué y quién lo
 * autorizó. Los permisos ya están en la lista blanca (la cámara los autoriza sola); esta vista es de
 * consulta y se actualiza en tiempo real cuando se otorga o retira un permiso o hay un ingreso.
 */
type Vista = 'hoy' | 'activos' | 'todos';

export const ESTADO_HOY: Record<EstadoPermisoHoy, { etiqueta: string; clase: string; ayuda: string }> = {
  habilitado_ahora: { etiqueta: 'Puede ingresar ahora', clase: 'autorizado', ayuda: 'Permiso vigente y dentro de su horario.' },
  habilitado_hoy: { etiqueta: 'Hoy, en otro horario', clase: 'info', ayuda: 'Tiene una franja de acceso hoy, pero no en este momento.' },
  no_habilitado_hoy: { etiqueta: 'Hoy no le corresponde', clase: 'no_reconocido', ayuda: 'Su horario no incluye el día de hoy.' },
  no_iniciado: { etiqueta: 'Aún no inicia', clase: 'info', ayuda: 'La vigencia empieza en una fecha futura.' },
  vencido: { etiqueta: 'Vencido', clase: 'neutro', ayuda: 'La vigencia terminó; ya no autoriza el ingreso.' },
  retirado: { etiqueta: 'Retirado', clase: 'neutro', ayuda: 'El permiso fue retirado; ya no autoriza el ingreso.' },
};

const HOY: EstadoPermisoHoy[] = ['habilitado_ahora', 'habilitado_hoy'];
const otorgadoHoy = (p: PermisoOtorgado) => fechaIsoLocal(new Date(p.fecha_registro)) === fechaIsoLocal();

function aCsv(filas: PermisoOtorgado[]): Blob {
  const c = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = ['N.º', 'Estado hoy', 'Nombres', 'Cédula', 'Institución', 'Cargo', 'Departamento', 'Placa', 'Marca', 'Modelo', 'Color',
    'Motivo de ingreso', 'Vigente desde', 'Vigente hasta', 'Horario', 'Observaciones', 'Ingresos hoy', 'Último ingreso',
    'Otorgado por', 'Cargo de quien otorgó', 'Correo', 'Fecha de otorgamiento'];
  const lineas = filas.map((p, i) => [i + 1, ESTADO_HOY[p.estado_hoy].etiqueta, p.propietario, p.cedula, p.institucion, p.cargo, p.departamento,
    p.placa, p.marca, p.modelo, p.color, p.motivo_ingreso, p.fecha_inicio?.slice(0, 10), p.fecha_vencimiento?.slice(0, 10), p.horario_texto,
    p.observaciones, p.ingresos_hoy, p.ultimo_ingreso ? fechaHora(p.ultimo_ingreso) : '', p.registrado_por_nombre, p.registrado_por_cargo,
    p.registrado_por_email, fechaHora(p.fecha_registro)].map(c).join(','));
  return new Blob(['﻿' + [cab.map(c).join(','), ...lineas].join('\n')], { type: 'text/csv;charset=utf-8' });
}

const Vigencia: React.FC<{ p: PermisoOtorgado }> = ({ p }) => (
  <>
    <span className="nowrap">{p.fecha_inicio ? `${fecha(p.fecha_inicio)} – ` : 'Desde su registro – '}{p.fecha_vencimiento ? fecha(p.fecha_vencimiento) : 'sin vencimiento'}</span>
    <span className="secundario"><Clock size={11} style={{ verticalAlign: -1 }} /> {p.horario_texto || 'Sin restricción horaria'}</span>
  </>
);

const ListaPermisos: React.FC = () => {
  const { puede } = useAuth();
  const verIngresos = puede('operacion:monitorear');
  const [vista, setVista] = useState<Vista>('hoy');
  const [busqueda, setBusqueda] = useState('');
  const [otorgante, setOtorgante] = useState('');
  const { datos, cargando, error, recargar } = useConsulta<{ generado: string | null; items: PermisoOtorgado[] }>(
    () => api.get('/vehiculos-autorizados/lista-permisos', { params: { estado: vista === 'todos' ? 'todos' : 'activos' } }).then(r => r.data),
    [vista === 'todos']);
  const diferido = useDiferido(() => recargar(true), 800);
  useReconexion(() => recargar(true));
  useEvento<{ lista: string }>('listas:actualizadas', e => { if (e.lista === 'autorizado') diferido(); });
  useEvento('deteccion:nueva', diferido);
  // «Puede ingresar ahora» cambia con la hora (franjas): se vuelve a calcular cada minuto
  useEffect(() => {
    const t = window.setInterval(() => recargar(true), 60_000);
    return () => window.clearInterval(t);
  }, [recargar]);

  const items = useMemo(() => datos?.items ?? [], [datos]);
  const otorgantes = useMemo(() => [...new Set(items.map(p => p.registrado_por_nombre || p.registrado_por_email || '').filter(Boolean))].sort(), [items]);
  const resumen = useMemo(() => ({
    ahora: items.filter(p => p.estado_hoy === 'habilitado_ahora').length,
    otroHorario: items.filter(p => p.estado_hoy === 'habilitado_hoy').length,
    ingresaron: items.filter(p => p.ingresos_hoy > 0).length,
    otorgadosHoy: items.filter(otorgadoHoy).length,
  }), [items]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    const qPlaca = q.replace(/[^A-Z0-9]/g, '');
    return items.filter(p => (vista !== 'hoy' || HOY.includes(p.estado_hoy))
      && (!otorgante || (p.registrado_por_nombre || p.registrado_por_email) === otorgante)
      && (!q || (qPlaca && p.placa?.includes(qPlaca))
        || [p.propietario, p.cedula, p.institucion, p.cargo, p.departamento, p.motivo_ingreso, p.observaciones, p.registrado_por_nombre]
          .some(x => x?.toUpperCase().includes(q))));
  }, [items, vista, otorgante, busqueda]);

  return (
    <div className="pagina">
      <div className="pila">
        <AvisoFlotante tipo="info" titulo="Permisos de los gestores">
          Cada permiso que otorga un gestor de permisos aparece aquí por separado y ya está en la lista blanca: la cámara autoriza
          sola el ingreso si la placa coincide y está dentro de su vigencia y horario. Es una consulta: los permisos los otorga y
          retira el gestor. Toda la lista blanca está en <Link to="/listas/autorizados">Lista blanca</Link>.
        </AvisoFlotante>
        {error && <AvisoFlotante tipo="error">{error}</AvisoFlotante>}

        <div className="grid-kpi">
          <Kpi etiqueta="Pueden ingresar ahora" valor={numero(resumen.ahora)} icono={<UserCheck size={22} aria-hidden />} color="var(--autorizado)"
            fondo="var(--autorizado-bg)" cargando={cargando && !datos} pie="Vigentes y dentro de su horario" onClick={() => setVista('hoy')} />
          <Kpi etiqueta="Hoy, en otro horario" valor={numero(resumen.otroHorario)} icono={<Clock size={22} aria-hidden />} color="var(--pendiente)"
            fondo="var(--pendiente-bg)" cargando={cargando && !datos} pie="Tienen una franja hoy, no en este momento" onClick={() => setVista('hoy')} />
          <Kpi etiqueta="Ingresaron hoy" valor={numero(resumen.ingresaron)} icono={<LogIn size={22} aria-hidden />} cargando={cargando && !datos}
            pie="Permisos con al menos un ingreso hoy" />
          <Kpi etiqueta="Otorgados hoy" valor={numero(resumen.otorgadosHoy)} icono={<CalendarCheck size={22} aria-hidden />} color="var(--text-2)"
            cargando={cargando && !datos} pie="Permisos nuevos del día" onClick={() => setVista('activos')} />
        </div>

        <Tarjeta titulo="Lista de Permisos"
          subtitulo="Quién tiene permiso de ingreso, por qué motivo y quién lo otorgó. Se actualiza en tiempo real."
          acciones={<button className="btn btn-secondary btn-sm" disabled={!filas.length}
            onClick={() => descargarBlob(aCsv(filas), `lista_permisos_${fechaIsoLocal()}.csv`)}><Download size={14} /> Exportar</button>}
          sinPadding>
          <div className="filtros" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div className="campo crece" style={{ maxWidth: 380 }}>
              <div className="input-icono"><Search size={15} />
                <input className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)} maxLength={100}
                  placeholder="Nombre, cédula, placa, institución, motivo…" aria-label="Buscar permiso" />
              </div>
            </div>
            <Segmentado<Vista> valor={vista} onCambiar={setVista} opciones={[
              { valor: 'hoy', etiqueta: `Pueden ingresar hoy (${resumen.ahora + resumen.otroHorario})` },
              { valor: 'activos', etiqueta: 'Activos' },
              { valor: 'todos', etiqueta: 'Todos, con retirados' },
            ]} />
            {otorgantes.length > 1 && (
              <select className="select" value={otorgante} onChange={e => setOtorgante(e.target.value)} aria-label="Otorgado por" style={{ maxWidth: 260 }}>
                <option value="">Todos los gestores</option>
                {otorgantes.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
          </div>
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr>
                <th className="num">N.º</th><th>Hoy</th><th>Persona</th><th>Placa y vehículo</th><th>Motivo de ingreso</th>
                <th>Vigencia y horario</th><th className="num">Ingresos hoy</th><th>Otorgado por</th>
              </tr></thead>
              <tbody>
                {cargando && !datos ? <FilasEsqueleto columnas={8} /> : filas.map((p, i) => {
                  const estado = ESTADO_HOY[p.estado_hoy];
                  return (
                    <tr key={p.id} className={HOY.includes(p.estado_hoy) ? '' : 'inactivo'}>
                      <td className="num texto-secundario">{i + 1}</td>
                      <td><span className={`insignia ${estado.clase}`} title={estado.ayuda}>{estado.etiqueta}</span></td>
                      <td><strong style={{ color: 'var(--text)', fontWeight: 600 }}>{p.propietario || '—'}</strong>
                        <span className="secundario">{[p.cedula && `C.I. ${p.cedula}`, p.institucion, p.cargo, p.departamento].filter(Boolean).join(' · ') || '—'}</span></td>
                      <td>{p.placa ? <Placa valor={p.placa} /> : <span className="insignia info">Pendiente de placa</span>}
                        <span className="secundario">{[p.tipo_vehiculo, [p.marca, p.modelo].filter(Boolean).join(' '), p.color].filter(Boolean).join(' · ')}</span></td>
                      <td style={{ maxWidth: 280 }}><span style={{ color: 'var(--text)' }}>{p.motivo_ingreso || '—'}</span>
                        {p.observaciones && <span className="secundario truncar" title={p.observaciones}>{p.observaciones}</span>}</td>
                      <td><Vigencia p={p} /></td>
                      <td className="num">{p.ingresos_hoy > 0
                        ? <>{verIngresos && p.placa ? <Link to={`/historial?placa=${p.placa}`} title="Ver sus ingresos en el historial">{numero(p.ingresos_hoy)}</Link> : numero(p.ingresos_hoy)}
                          {p.ultimo_ingreso && <span className="secundario">último {hora(p.ultimo_ingreso)}</span>}</>
                        : <span className="texto-secundario">0</span>}</td>
                      <td><strong style={{ fontWeight: 600 }}>{p.registrado_por_nombre || p.registrado_por_email || '—'}</strong>
                        <span className="secundario">{[p.registrado_por_cargo, p.registrado_por_rol_nombre].filter(Boolean).join(' · ')}</span>
                        <span className="secundario">el {fechaHora(p.fecha_registro)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {datos && filas.length === 0 && (
            <Vacio titulo={items.length ? 'Sin coincidencias' : 'Aún no hay permisos otorgados por los gestores'}
              texto={items.length ? (vista === 'hoy' ? 'Nadie más tiene permiso para hoy. Revise «Activos» para ver los demás.' : 'Ajuste la búsqueda o el filtro.')
                : 'Cuando un gestor de permisos otorgue uno, aparecerá aquí al instante.'} />
          )}
        </Tarjeta>
        <span className="texto-secundario" style={{ fontSize: 12 }}><FileCheck2 size={12} style={{ verticalAlign: -2 }} /> {datos?.generado ? `Estado calculado a las ${hora(datos.generado)}.` : ''}</span>
      </div>
    </div>
  );
};

export default ListaPermisos;
