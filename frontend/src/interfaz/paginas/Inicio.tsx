import React, { useEffect, useState } from 'react';
import { AvisoFlotante } from '../componentes/AvisoFlotante';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, ArrowRight, CarFront, CheckCircle2, CircleAlert, CircleHelp, History, LogOut, MonitorPlay, ShieldCheck, ShieldX, Siren,
  TrendingDown, TrendingUp,
} from 'lucide-react';
import api, { mensajeError } from '../../infraestructura/api';
import { useAuth } from '../../aplicacion/AuthContext';
import { useEvento, useReconexion } from '../../aplicacion/tiempoReal';
import { useConsulta, useDiferido, usePaginaVisible } from '../../aplicacion/hooks';
import type { Deteccion, EstadoAnpr, ResumenPanel } from '../../dominio/tipos';
import { diaCorto, fecha, hora, numero, relativo, SERIES_ESTADO } from '../../dominio/formato';
import { formatearPlaca, validarPlaca } from '../../dominio/validacion';
import { ESTADOS_ACCESO, estadoAcceso } from '../../dominio/estadoAcceso';
import { Cargando, FilasEsqueleto, InsigniaEstado, Kpi, Tarjeta, Vacio } from '../componentes/ui';
import { BarrasApiladas, Dona } from '../componentes/Graficos';
import { PlacaFoto } from '../componentes/deteccion';
import { CeldaIngreso, actualizarCampoIngreso, type CampoIngreso } from '../componentes/CeldaIngreso';
import { ConfianzaRegistro } from '../componentes/ConfianzaRegistro';
import { VisorZoom } from '../componentes/ZoomDual';
import GestionPermisos from './GestionPermisos';
import { horasDelMovimiento } from '../../dominio/movimiento';
import { useNotificar } from '../componentes/Notificaciones';

function saludo(): string {
  const h = Number(new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: 'numeric', hour12: false }).format(new Date()));
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/** Recarga el resumen cuando llegan eventos (agrupados cada 5 s) y al volver a la pestaña. */
function useResumen() {
  const consulta = useConsulta<ResumenPanel>(() => api.get('/panel/resumen').then(r => r.data), []);
  const visible = usePaginaVisible();
  const [pendiente, setPendiente] = useState(false);
  const recargar = useDiferido(() => {
    if (document.visibilityState === 'visible') consulta.recargar(true);
    else setPendiente(true);
  }, 5000);
  useEffect(() => { if (visible && pendiente) { setPendiente(false); consulta.recargar(true); } }, [visible, pendiente]); // eslint-disable-line react-hooks/exhaustive-deps
  useEvento('deteccion:nueva', recargar);
  useEvento('deteccion:actualizada', () => {
    recargar();
    void consulta.recargar(true);
  });
  useEvento('deteccion:alerta', recargar);
  useEvento('deteccion:eliminada', recargar);
  useEvento('deteccion:eliminadas', recargar);
  useReconexion(recargar);
  useEvento('camara:estado', recargar);
  useEvento('camara:actualizada', recargar);
  useEvento('listas:actualizadas', recargar);
  return consulta;
}

const Variacion: React.FC<{ hoy: number; ayer: number }> = ({ hoy, ayer }) => {
  if (!ayer) return <span>{hoy ? 'Sin registros ayer a esta hora' : 'Sin actividad todavía'}</span>;
  const d = Math.round(((hoy - ayer) / ayer) * 100);
  return d === 0 ? <span>Igual que ayer a esta hora</span> : (
    <span className={d > 0 ? 'sube' : 'baja'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {d > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(d)} % vs. ayer a esta hora
    </span>
  );
};

/* ─────────────── Panel operativo (todos los roles) ─────────────── */

const KpisAdmin: React.FC<{ r: ResumenPanel | null; cargando: boolean }> = ({ r, cargando }) => {
  const navigate = useNavigate();
  const hoy = r?.hoy;
  return (
    <div className="grid-kpi">
      <Kpi etiqueta="Ingresos hoy" valor={numero(hoy?.total)} icono={<CarFront size={22} aria-hidden />} cargando={cargando}
        pie={r && <Variacion hoy={r.hoy.total} ayer={r.ayer_misma_hora} />} onClick={() => navigate('/monitoreo')} />
      <Kpi etiqueta="Lista blanca" valor={numero(r?.listas.lista_blanca)} icono={<ShieldCheck size={22} aria-hidden />} color="var(--autorizado)" fondo="var(--autorizado-bg)" cargando={cargando}
        pie="Registros sin retirar" onClick={() => navigate('/listas/autorizados')} />
      <Kpi etiqueta="Lista negra" valor={numero(r?.listas.lista_negra)} icono={<ShieldX size={22} aria-hidden />} color="var(--text-2)" cargando={cargando}
        pie="Registros sin retirar" onClick={() => navigate('/listas/alertas')} />
      <Kpi etiqueta="No registrados" valor={numero(hoy?.no_registrados)} icono={<CircleHelp size={22} aria-hidden />} color="var(--no-registrado)" fondo="var(--no-registrado-bg)" cargando={cargando}
        pie="Detectados hoy fuera de las listas" onClick={() => navigate('/historial?estado=no_registrados')} />
      <Kpi etiqueta="Alertas hoy" valor={numero(hoy?.alertas)} icono={<Siren size={22} aria-hidden />} color="var(--alerta)" fondo="var(--alerta-bg)" cargando={cargando}
        pie="Detecciones con alerta" onClick={() => navigate('/historial?estado=alertas')} />
    </div>
  );
};

const RelojGuardia: React.FC = () => {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setAhora(new Date()), 1000); return () => window.clearInterval(id); }, []);
  return <div className="guardia-reloj">
    <time dateTime={ahora.toISOString()}>{new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(ahora)}</time>
    <span>{new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ahora)}</span>
  </div>;
};

/**
 * Balance del día en tres celdas de la cuadrícula del guardia: entradas, salidas (anillo con su
 * parte de los movimientos) y el total.
 */
const BalanceGuardia: React.FC<{ entradas: number; salidas: number; cargando?: boolean }> = ({ entradas, salidas, cargando }) => {
  const total = entradas + salidas;
  const valor = (n: number) => (cargando ? '…' : numero(n));
  return <>{[
    { titulo: 'Entradas de hoy', valor: entradas, color: '#16a66a', clase: 'entrada' },
    { titulo: 'Salidas de hoy', valor: salidas, color: '#e35454', clase: 'salida' },
  ].map(x => {
    const porcentaje = total ? Math.round(x.valor / total * 100) : 0;
    return <section key={x.clase} className={`guardia-celda guardia-balance-item ${x.clase}`}>
      <h3>{x.titulo}</h3>
      <div className="guardia-anillo" role="img" aria-label={`${x.titulo}: ${x.valor}, ${porcentaje} % de los movimientos de hoy`}
        style={{ background: `conic-gradient(${x.color} ${porcentaje}%, var(--surface-3) 0)` }}>
        <div><strong>{valor(x.valor)}</strong><span>{porcentaje} % de movimientos</span></div>
      </div>
      <span className="texto-secundario">{x.clase === 'entrada' ? 'Ingresos registrados hoy' : 'Salidas registradas hoy'}</span>
    </section>;
  })}
  <section className="guardia-celda guardia-total">
    <h3>Movimientos de hoy</h3>
    <strong className="guardia-total-numero">{valor(total)}</strong>
    <div className="guardia-total-detalle">
      <span><i className="entrada" aria-hidden /> Entradas <b>{valor(entradas)}</b></span>
      <span><i className="salida" aria-hidden /> Salidas <b>{valor(salidas)}</b></span>
    </div>
    <p className="guardia-balance-total">Movimientos registrados hoy: <strong>{numero(total)}</strong> (entradas: {numero(entradas)} · salidas: {numero(salidas)})</p>
  </section></>;
};

/** Panel del guardia: control del turno, balance y accesos directos. */
const PanelOperador: React.FC = () => {
  const { user } = useAuth();
  const notificar = useNotificar();
  const resumen = useResumen();
  const { datos: r, cargando, error } = resumen;
  const [identificador, setIdentificador] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [confirmacion, setConfirmacion] = useState<{ titulo: string; texto: string; tipo: 'exito' | 'aviso' } | null>(null);
  const estadoSalida = useConsulta<EstadoAnpr>(() => api.get('/monitoreo/estado').then(x => x.data), []);
  const salidaManual = estadoSalida.datos?.salida_manual !== false;
  const identificadorValido = /^\d{10}$/.test(identificador) || validarPlaca(identificador).ok;

  useEffect(() => {
    if (!confirmacion) return;
    const cerrar = () => setConfirmacion(null);
    const temporizador = window.setTimeout(cerrar, 7000);
    window.addEventListener('keydown', cerrar);
    return () => {
      window.clearTimeout(temporizador);
      window.removeEventListener('keydown', cerrar);
    };
  }, [confirmacion]);

  const registrarMovimientoInteligente = async () => {
    if (!identificadorValido || registrando) return;
    setRegistrando(true);
    try {
      const { data } = await api.post<{ movimiento: 'entrada' | 'salida'; deteccion: Deteccion }>(
        '/detecciones/movimiento-placa',
        { identificador },
      );
      const d = data.deteccion;
      const persona = d.persona_ingreso?.trim() || d.autorizado?.propietario || d.datos_permiso?.propietario;
      if (data.movimiento === 'salida') {
        setConfirmacion({
          tipo: 'exito',
          titulo: 'Salida registrada',
          texto: `El usuario ${persona || 'registrado'} registró su salida vehicular con éxito${d.placa ? ` (${formatearPlaca(d.placa)})` : ''}.`,
        });
      } else {
        setConfirmacion({
          tipo: 'exito',
          titulo: `¡Bienvenido ${persona || 'usuario'}!`,
          texto: 'Su registro de ingreso vehicular ha sido registrado con éxito.',
        });
      }
      setIdentificador('');
      await resumen.recargar(true);
    } catch (e) {
      notificar('error', 'No se pudo registrar el movimiento', mensajeError(e));
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <div className="pagina dashboard-guardia">
      <div className="encabezado-pagina">
        <div>
          <h2>Control de garita</h2>
          <p>{saludo()}, {user?.nombre.split(' ')[0]} · su panel de operación</p>
        </div>
        <div className="fila">
          <Link to="/monitoreo" className="btn btn-primary"><MonitorPlay size={16} /> Abrir Registro de Ingresos</Link>
        </div>
      </div>
      {error && <AvisoFlotante tipo="error" style={{ marginBottom: 16 }}>{error}</AvisoFlotante>}
      {/* Cuadrícula que ocupa el alto visible en escritorio (sin scroll); en tableta y celular, en columna */}
      <div className="guardia-grid">
        <section className="guardia-celda guardia-control" aria-label="Registro de entrada o salida">
          <RelojGuardia />
          <div className="guardia-acciones">
            <div className="guardia-identificador">
              <label htmlFor="guardia-identificador">Placa o cédula</label>
              <input id="guardia-identificador" className="input" type="text" inputMode="text" autoComplete="off"
                maxLength={10} value={identificador} disabled={registrando}
                placeholder="ABC1234 o 0123456789"
                onChange={e => setIdentificador(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase().slice(0, 10))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void registrarMovimientoInteligente(); } }} />
              <small><kbd>Enter</kbd> registra entrada o salida. Si una cédula tiene varias placas o vehículos dentro, use la placa para elegir.</small>
            </div>
            <button className="btn guardia-movimiento" onClick={() => void registrarMovimientoInteligente()}
              disabled={!identificadorValido || registrando}>
              {registrando ? 'Registrando…' : 'Registrar movimiento'}
            </button>
          </div>
          <p className="guardia-indicacion">{salidaManual
            ? 'El sistema identifica si corresponde una entrada o una salida, ya sea por placa o por cédula.'
            : 'La salida manual está desactivada; la cámara registra la salida por placa.'}</p>
        </section>
        <section className="guardia-celda guardia-dentro" aria-label="Vehículos dentro">
          <span>Vehículos dentro</span><strong>{cargando && !r ? '…' : numero(r?.movimientos?.dentro)}</strong>
          <small>Ingresos autorizados que todavía no registran salida.</small>
          <div className="fila guardia-enlaces">
            <Link to="/detecciones" className="btn btn-secondary btn-sm"><LogOut size={14} /> Registro de Salidas: {cargando && !r ? '…' : numero(r?.movimientos?.registros_completos)}</Link>
            <Link to="/historial" className="btn btn-secondary btn-sm"><History size={14} /> Historial completo</Link>
          </div>
          <small className="texto-secundario guardia-historico">Accesos en el historial: {cargando && !r ? '…' : numero(r?.movimientos?.registros_acceso)}</small>
        </section>
        <BalanceGuardia entradas={r?.movimientos?.entradas ?? 0} salidas={r?.movimientos?.salidas ?? 0} cargando={cargando && !r} />
      </div>
      {confirmacion && <div className="guardia-confirmacion" role="alert" aria-live="assertive">
        <div className={`guardia-confirmacion-tarjeta ${confirmacion.tipo}`}>
          {confirmacion.tipo === 'exito' ? <CheckCircle2 size={30} aria-hidden /> : <CircleAlert size={30} aria-hidden />}
          <div><strong>{confirmacion.titulo}</strong><p>{confirmacion.texto}</p>
            <small>Presione cualquier tecla para continuar</small></div>
        </div>
      </div>}
    </div>
  );
};

/* ─────────────── Panel de gestión (permiso alertas:gestionar: Administrador) ─────────────── */

/** Dona: cómo se repartieron los ingresos de hoy entre los estados de la decisión. */
const DistribucionHoy: React.FC<{ r: ResumenPanel }> = ({ r }) => (
  <Tarjeta titulo="Distribución de ingresos" subtitulo={`Hoy · ${numero(r.hoy.total)} ingresos, ${numero(r.hoy.validados)} confirmados por el personal`}>
    {r.hoy.total === 0
      ? <Vacio titulo="Sin ingresos hoy" texto="La distribución aparece con el primer paso registrado." icono={<Activity size={22} />} />
      : <Dona valores={r.hoy} series={SERIES_ESTADO} />}
  </Tarjeta>
);

const SERIE_TOTAL_DIARIO = [{ clave: 'total', etiqueta: 'Ingresos', color: 'var(--accent-blue)' }] as const;

/** Una barra por día, con el total de ingresos en orden cronológico. */
const UltimosSieteDias: React.FC<{ r: ResumenPanel }> = ({ r }) => {
  const total = r.tendencia.reduce((s, d) => s + d.total, 0);
  return (
    <Tarjeta titulo="Ingresos por día" subtitulo={`Últimos 7 días · ${numero(total)} ingresos`}>
      {r.tendencia.length ? (
        <BarrasApiladas datos={r.tendencia} series={SERIE_TOTAL_DIARIO} etiquetaX={d => diaCorto(d.fecha)}
          tituloTip={d => fecha(d.fecha)} ejes={{ x: 'Días', y: 'Ingresos' }} mostrarTotales alto={280} />
      ) : <Vacio titulo="Sin ingresos en los últimos 7 días" icono={<Activity size={22} />} />}
    </Tarjeta>
  );
};

/** Los 50 ingresos más recientes en una tabla, actualizada en tiempo real. */
const IngresosRecientes: React.FC = () => {
  const [zoom, setZoom] = useState<Deteccion | null>(null);
  const navigate = useNavigate();
  const puedeEditarCampos = useAuth().puede('detecciones:validar');
  const { datos, cargando, error, recargar, setDatos } = useConsulta<Deteccion[]>(
    () => api.get('/detecciones/recientes', { params: { limite: 50 } }).then(r => r.data), []);
  const alEditar = (actualizada: Deteccion, campo?: CampoIngreso) => {
    setDatos(actuales => actuales?.map(d => d.id === actualizada.id ? actualizarCampoIngreso(d, actualizada, campo) : d) ?? null);
  };
  const diferido = useDiferido(() => recargar(true), 1500);
  useEvento('deteccion:nueva', diferido);
  useEvento('deteccion:actualizada', diferido);
  useEvento('deteccion:eliminada', diferido);
  useEvento('deteccion:eliminadas', diferido);
  useReconexion(diferido);
  return (
    <Tarjeta titulo="Movimientos recientes" subtitulo="Ingresos sin salida o con datos pendientes para el reporte; se actualiza en tiempo real"
      acciones={<Link to="/historial" className="btn btn-ghost btn-sm"><History size={14} /> Historial completo <ArrowRight size={14} /></Link>} sinPadding>
      {error && <AvisoFlotante tipo="error" style={{ margin: 12 }}>{error}</AvisoFlotante>}
      <div className="tabla-contenedor" style={{ maxHeight: 560 }} role="region" aria-label="Tabla de movimientos recientes" tabIndex={0}>
        <table className="tabla tabla-registros">
          <thead><tr>
            <th className="num" style={{ width: 44 }}>N.º</th><th>Cédula</th><th>Titular</th><th>Placa</th><th>Motivo</th><th>Fecha</th><th>Hora de entrada</th><th>Hora de salida</th>
            <th>Vehículo</th><th>Marca</th><th>Modelo</th><th>Cámara</th><th>Estado</th><th>Confianza</th><th>Registro de salida</th>
          </tr></thead>
          <tbody>
            {cargando && !datos ? <FilasEsqueleto columnas={15} /> : (datos ?? []).map((d, i) => (
              <tr key={d.id} className={`clic ${ESTADOS_ACCESO[estadoAcceso(d)].clase}`} onClick={() => navigate(`/monitoreo?registro=${d.id}`)}>
                <td className="num texto-secundario">{i + 1}</td>
                <CeldaIngreso d={d} campo="cedula" editable={puedeEditarCampos && d.tipo_movimiento !== 'salida'} onActualizada={alEditar} />
                <CeldaIngreso d={d} campo="persona_ingreso" editable={puedeEditarCampos && d.tipo_movimiento !== 'salida'} onActualizada={alEditar} />
                <td className="nowrap">
                  <PlacaFoto d={d} alto={36} onClick={() => setZoom(d)} />
                </td>
                <CeldaIngreso d={d} campo="motivo_ingreso" editable={puedeEditarCampos && d.tipo_movimiento !== 'salida'} onActualizada={alEditar} />
                <td className="nowrap">{fecha(d.fecha_hora_ingreso)}</td>
                <td className="nowrap">{horasDelMovimiento(d).entrada ? <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{hora(d.fecha_hora_ingreso)}</strong> : '—'}</td>
                <td className="nowrap">{horasDelMovimiento(d).salida ? hora(horasDelMovimiento(d).salida!) : '—'}</td>
                <CeldaIngreso d={d} campo="tipo_vehiculo" editable={puedeEditarCampos && d.tipo_movimiento !== 'salida'} onActualizada={alEditar} />
                <CeldaIngreso d={d} campo="marca" editable={puedeEditarCampos && d.tipo_movimiento !== 'salida'} onActualizada={alEditar} />
                <CeldaIngreso d={d} campo="modelo" editable={puedeEditarCampos && d.tipo_movimiento !== 'salida'} onActualizada={alEditar} />
                <td>{d.camara ? <>{d.camara.nombre}<span className="secundario">{d.camara.ubicacion}</span></> : <span className="texto-secundario">{d.fuente === 'manual' ? 'Registro manual' : '—'}</span>}</td>
                <td className="nowrap"><InsigniaEstado estado={d.estado_validacion} procesando={d.estado_procesamiento === 'pendiente_ocr'} corta /></td>
                <td className="nowrap"><ConfianzaRegistro valor={d.confianza_ocr} /></td>
                <td className="nowrap">{d.fecha_hora_salida ? <span className="texto-secundario">Registrada</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {datos && datos.length === 0 && (
        <Vacio titulo="Aún no hay ingresos registrados" texto="Los pasos vehiculares aparecerán aquí en cuanto el motor ANPR los registre." icono={<CarFront size={22} />} />
      )}
      {zoom && <VisorZoom d={zoom} onCerrar={() => setZoom(null)} />}
    </Tarjeta>
  );
};

/**
 * Dashboard de gestión, simple como el de vigilance-heart: indicadores del día, la distribución de
 * hoy, los últimos 7 días y los 50 ingresos recientes. Servicios, cuentas, listas de control y
 * exactitud están en Estado del sistema.
 */
const PanelGestion: React.FC = () => {
  const { user } = useAuth();
  const { datos: r, cargando, error } = useResumen();
  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <h2>Dashboard</h2>
          <p>Vista general del acceso vehicular · {saludo()}, {user?.nombre.split(' ')[0]} · {r ? `actualizado ${relativo(r.generado)}` : 'cargando…'}</p>
        </div>
        <div className="fila">
          <Link to="/reportes" className="btn btn-secondary"><Activity size={16} /> Reportes</Link>
          <Link to="/monitoreo" className="btn btn-primary"><MonitorPlay size={16} /> Registro de Ingresos</Link>
        </div>
      </div>
      {error && <AvisoFlotante tipo="error" style={{ marginBottom: 16 }}>{error}</AvisoFlotante>}
      <div className="pila">
        <KpisAdmin r={r} cargando={cargando} />
        {r
          ? <div className="grid-2"><DistribucionHoy r={r} /><UltimosSieteDias r={r} /></div>
          : <Tarjeta titulo="Distribución de ingresos"><Cargando /></Tarjeta>}
        <IngresosRecientes />
      </div>
    </div>
  );
};

/**
 * Inicio según los permisos: quien supervisa (reportes y alertas) ve la gestión; el gestor de
 * permisos, su única vista de gestión de permisos; el guardia, su turno.
 */
const Inicio: React.FC = () => {
  const { puede, user } = useAuth();
  // Guardia puede gestionar listas, pero su inicio sigue siendo el panel operativo del turno.
  // La matriz RBAC no debe decidir por sí sola qué dashboard se muestra.
  if (user?.rol === 'Guardia') return <PanelOperador />;
  if (puede('alertas:gestionar')) return <PanelGestion />;
  if (puede('padron:gestionar')) return <GestionPermisos />;
  if (puede('operacion:monitorear')) return <PanelOperador />;
  return <div className="pagina"><div className="tarjeta" style={{ padding: 24 }}>Su cuenta no tiene permisos asignados. Contacte al administrador.</div></div>;
};

export default Inicio;
