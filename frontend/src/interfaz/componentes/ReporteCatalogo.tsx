import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, ImageOff, Info, OctagonAlert, Printer } from 'lucide-react';
import api, { mensajeErrorDescarga, urlMedia } from '../../infraestructura/api';
import { useAuth } from '../../aplicacion/AuthContext';
import { useConsulta } from '../../aplicacion/hooks';
import type {
  Camara, CatalogoReportes, ColumnaReporte, DefinicionReporte, GraficoReporte, HallazgoReporte, NivelHallazgo, ReporteGenerado, SeccionReporte,
} from '../../dominio/tipos';
import { fecha, fechaHora, fechaIsoLocal, limiteDia, nombreDescarga, numero, sumarDias } from '../../dominio/formato';
import { formatearPlaca } from '../../dominio/validacion';
import { duracion } from '../../dominio/analisisAccesos';
import { descargarBlob } from '../../infraestructura/descargas';
import { Aviso, Cargando, Tarjeta } from './ui';
import { Informe, ResumenInforme } from './InformeImprimible';
import { PeriodoCompacto } from './PeriodoCompacto';
import { useNotificar } from './Notificaciones';

/**
 * Un reporte del servidor (GET /reportes/catalogo/:tipo): el formulario se arma con los parámetros
 * que declara el reporte y se genera al abrirlo. La vista previa es el documento imprimible (logo,
 * datos, cifras, hallazgos con qué hacer, gráficos de barras horizontales, tablas con las fotos y
 * firmas) y «Excel» descarga las mismas tablas.
 */

/** Valor de una celda según el tipo de su columna. */
export function celda(c: ColumnaReporte, v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') return c.tipo === 'imagen' ? <span className="informe-sin-foto" title="Sin foto"><ImageOff size={14} /></span> : '—';
  switch (c.tipo) {
    case 'imagen': {
      const src = urlMedia(String(v));
      return src ? <a href={src} target="_blank" rel="noreferrer" className="informe-foto-enlace" title="Abrir la foto"><img src={src} alt={c.titulo} loading="lazy" className="informe-foto" /></a> : '—';
    }
    case 'placa': return <span className="informe-placa">{formatearPlaca(String(v)) || String(v)}</span>;
    case 'fecha_hora': return fechaHora(String(v));
    case 'fecha': return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? fecha(`${String(v).slice(0, 10)}T12:00:00-05:00`) : String(v);
    case 'duracion': return Number.isFinite(Number(v)) ? duracion(Number(v)) : String(v);
    case 'porcentaje': return Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('es-EC', { maximumFractionDigits: 1 })} %` : String(v);
    case 'numero': return Number.isFinite(Number(v)) ? numero(Number(v)) : String(v);
    default: return String(v);
  }
}

const valorBarra = (g: GraficoReporte, v: number) => (g.unidad === '%' ? `${v.toLocaleString('es-EC', { maximumFractionDigits: 1 })} %` : numero(v));

/** Barras horizontales de una sola serie: etiqueta a la izquierda, valor al final de la barra y detalle al pasar el mouse. */
export const GraficoBarras: React.FC<{ g: GraficoReporte }> = ({ g }) => {
  const maximo = g.maximo ?? Math.max(0, ...g.barras.map(b => b.valor));
  return (
    <figure className="grafico-barras">
      <figcaption>{g.titulo}{g.unidad !== '%' && <small> · {g.unidad}</small>}</figcaption>
      <ul aria-label={g.titulo}>
        {g.barras.map(b => {
          const texto = `${b.etiqueta}: ${valorBarra(g, b.valor)}${g.unidad === '%' ? '' : ` ${g.unidad}`}${b.detalle ? ` · ${b.detalle}` : ''}`;
          return (
            <li key={b.etiqueta} tabIndex={0} title={texto} aria-label={texto} data-detalle={b.detalle ?? ''}>
              <span className="grafico-etiqueta">{b.etiqueta}</span>
              <span className="grafico-pista">
                <span className="grafico-barra" style={{ width: `${maximo > 0 ? Math.max(0.5, (b.valor / maximo) * 100) : 0}%` }} />
                <span className="grafico-valor">{valorBarra(g, b.valor)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
};

const NIVEL: Record<NivelHallazgo, { etiqueta: string; icono: React.ReactNode }> = {
  alerta: { etiqueta: 'Alerta', icono: <OctagonAlert size={16} /> },
  atencion: { etiqueta: 'Atención', icono: <AlertTriangle size={16} /> },
  info: { etiqueta: 'Dato', icono: <Info size={16} /> },
  ok: { etiqueta: 'Correcto', icono: <CheckCircle2 size={16} /> },
};

export const HallazgosReporte: React.FC<{ items: HallazgoReporte[] }> = ({ items }) => (
  <section className="informe-seccion reporte-hallazgos" aria-label="Hallazgos">
    <h2>Hallazgos y recomendaciones</h2>
    <ul>
      {items.map(h => (
        <li key={h.texto} className={`hallazgo hallazgo-${h.nivel}`}>
          <span className="hallazgo-nivel">{NIVEL[h.nivel].icono}{NIVEL[h.nivel].etiqueta}</span>
          <span className="hallazgo-texto">{h.texto}{h.recomendacion && <span className="hallazgo-recomendacion"><strong>Qué hacer:</strong> {h.recomendacion}</span>}</span>
        </li>
      ))}
    </ul>
  </section>
);

const TablaReporte: React.FC<{ s: SeccionReporte }> = ({ s }) => (
  <div className="informe-tabla-desplazable" role="region" aria-label={s.titulo} tabIndex={0}>
    <table className="informe-tabla informe-tabla-compacta" aria-label={s.titulo}>
      <thead><tr><th className="num">N.º</th>{s.columnas.map(c => <th key={c.clave} className={c.tipo === 'numero' || c.tipo === 'porcentaje' ? 'num' : undefined}>{c.titulo}</th>)}</tr></thead>
      <tbody>
        {s.filas.map((f, i) => (
          <tr key={i}>
            <td className="num">{i + 1}</td>
            {s.columnas.map(c => <td key={c.clave} className={c.tipo === 'numero' || c.tipo === 'porcentaje' ? 'num' : c.tipo === 'fecha_hora' || c.tipo === 'placa' ? 'nowrap' : undefined}>{celda(c, f[c.clave])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

type Valores = Record<string, string>;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

const valoresIniciales = (def: DefinicionReporte, inicial: Valores): Valores => Object.fromEntries(def.parametros.map(p => [p.clave,
  inicial[p.clave] ?? (p.omision === undefined || p.omision === null ? '' : String(p.omision))]));

/** Parámetros de la consulta: el período como límites del día local y solo los campos con valor. */
function consultaDe(def: DefinicionReporte, desde: string, hasta: string, valores: Valores): Record<string, string> {
  const q: Record<string, string> = {};
  if (def.periodo) { q.desde = limiteDia(desde); q.hasta = limiteDia(hasta, true); }
  for (const p of def.parametros) if (valores[p.clave]?.trim()) q[p.clave] = valores[p.clave].trim();
  return q;
}

function errorFormulario(def: DefinicionReporte, desde: string, hasta: string, valores: Valores): string | null {
  if (def.periodo) {
    if (!desde || !hasta) return 'Seleccione la fecha de inicio y de fin.';
    if (desde > hasta) return 'La fecha de inicio debe ser anterior o igual a la fecha de fin.';
    if (hasta > fechaIsoLocal()) return 'Seleccione fechas hasta el día de hoy.';
  }
  for (const p of def.parametros) {
    const v = valores[p.clave]?.trim() ?? '';
    if (p.requerido && !v) return `Indique «${p.etiqueta}».`;
    if (v && p.tipo === 'entero') {
      const n = Number(v);
      if (!Number.isInteger(n) || (p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max)) {
        return `${p.etiqueta}: un número entero${p.min !== undefined ? ` desde ${p.min}` : ''}${p.max !== undefined ? ` hasta ${numero(p.max)}` : ''}.`;
      }
    }
  }
  return null;
}

/** Período inicial: el de la URL (AAAA-MM-DD) o los últimos `diasOmision` días. */
const periodoInicial = (def: DefinicionReporte, inicial: Valores): [string, string] => {
  const hoy = fechaIsoLocal();
  return [DIA.test(inicial.desde ?? '') ? inicial.desde : sumarDias(hoy, -((def.diasOmision ?? 7) - 1)), DIA.test(inicial.hasta ?? '') ? inicial.hasta : hoy];
};

const Formulario: React.FC<{
  def: DefinicionReporte; inicial: Valores; camaras: Camara[]; cargando: boolean; listo: boolean; exportando: boolean;
  onGenerar: (q: Record<string, string>) => void; onModificado: (m: boolean) => void; consulta: Record<string, string> | null;
  onExcel: () => void;
}> = ({ def, inicial, camaras, cargando, listo, exportando, onGenerar, onModificado, consulta, onExcel }) => {
  const [desde, setDesde] = useState(() => periodoInicial(def, inicial)[0]);
  const [hasta, setHasta] = useState(() => periodoInicial(def, inicial)[1]);
  const [valores, setValores] = useState<Valores>(() => valoresIniciales(def, inicial));
  const [error, setError] = useState<string | null>(null);
  const modificado = Boolean(consulta) && JSON.stringify(consultaDe(def, desde, hasta, valores)) !== JSON.stringify(consulta);
  useEffect(() => { onModificado(modificado); }, [modificado, onModificado]);
  const cambiar = (clave: string, valor: string) => { setValores(v => ({ ...v, [clave]: valor })); setError(null); };
  const generar = (e: React.FormEvent) => {
    e.preventDefault();
    const fallo = errorFormulario(def, desde, hasta, valores);
    setError(fallo);
    if (!fallo) onGenerar(consultaDe(def, desde, hasta, valores));
  };
  return (
    <Tarjeta className="no-imprimir reporte-barra">
      <form className="reporte-parametros" onSubmit={generar} noValidate>
        {def.periodo && <PeriodoCompacto id="rc" desde={desde} hasta={hasta} onCambiar={(d, h) => { setDesde(d); setHasta(h); setError(null); }} />}
        {def.parametros.map(p => {
          const id = `rc-${p.clave}`;
          const etiqueta = `${p.etiqueta}${p.unidad ? ` (${p.unidad})` : ''}`;
          if (p.tipo === 'camara') {
            return <div key={p.clave} className="campo"><label htmlFor={id}>{etiqueta}</label>
              <select id={id} className="select" value={valores[p.clave] ?? ''} onChange={e => cambiar(p.clave, e.target.value)}>
                <option value="">{p.requerido ? 'Seleccione una cámara' : 'Todas las cámaras'}</option>
                {camaras.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select></div>;
          }
          if (p.tipo === 'opcion') {
            return <div key={p.clave} className="campo"><label htmlFor={id}>{etiqueta}</label>
              <select id={id} className="select" value={valores[p.clave] ?? ''} onChange={e => cambiar(p.clave, e.target.value)}>
                {p.opciones?.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
              </select></div>;
          }
          return <div key={p.clave} className={`campo${p.tipo === 'entero' ? ' reporte-campo-numero' : ''}`}><label htmlFor={id}>{etiqueta}</label>
            <input id={id} className="input" value={valores[p.clave] ?? ''} inputMode={p.tipo === 'entero' ? 'numeric' : undefined}
              type={p.tipo === 'entero' ? 'number' : 'text'} min={p.min} max={p.max} maxLength={p.tipo === 'texto' ? p.max : undefined}
              placeholder={p.ayuda && p.tipo === 'texto' ? p.ayuda : undefined} title={p.ayuda} autoComplete="off"
              onChange={e => cambiar(p.clave, e.target.value)} /></div>;
        })}
        <button type="submit" className="btn btn-navy" disabled={cargando}><FileText size={15} /> {cargando ? 'Generando…' : 'Generar reporte'}</button>
        <div className="reporte-acciones">
          <button type="button" className="btn btn-secondary" onClick={onExcel} disabled={!listo || modificado || exportando}>
            <Download size={15} /> {exportando ? 'Exportando…' : 'Excel'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()} disabled={!listo || modificado}><Printer size={15} /> Imprimir / guardar PDF</button>
        </div>
      </form>
      {error && <p className="error reporte-aviso" role="alert">{error}</p>}
      {modificado && !error && <p className="texto-secundario reporte-aviso" role="status">Cambió los datos. Pulse «Generar reporte» para actualizar la vista previa.</p>}
    </Tarjeta>
  );
};

export const ReporteCatalogo: React.FC<{ tipo: string; inicial?: Valores }> = ({ tipo, inicial = {} }) => {
  const { user } = useAuth();
  const notificar = useNotificar();
  const catalogo = useConsulta<CatalogoReportes>(() => api.get('/reportes/catalogo').then(r => r.data), []);
  const def = catalogo.datos?.reportes?.find(r => r.id === tipo) ?? null;
  const usaCamaras = Boolean(def?.parametros.some(p => p.tipo === 'camara'));
  const camaras = useConsulta<Camara[]>(() => (usaCamaras ? api.get('/camaras').then(r => r.data) : Promise.resolve([])), [usaCamaras]);
  const [consulta, setConsulta] = useState<Record<string, string> | null>(null);
  const [modificado, setModificado] = useState(false);
  const [exportando, setExportando] = useState(false);
  const clave = consulta ? JSON.stringify(consulta) : '';
  const claveInicial = JSON.stringify(inicial);

  // Al abrir, el reporte se genera con los valores de la URL o por omisión (si no pide datos obligatorios)
  useEffect(() => {
    if (!def) return;
    const valores = valoresIniciales(def, inicial);
    const [d, h] = periodoInicial(def, inicial);
    setConsulta(def.parametros.some(p => p.requerido && !valores[p.clave]) ? null : consultaDe(def, d, h, valores));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, claveInicial]);

  const reporte = useConsulta<ReporteGenerado | null>(async () => (consulta
    ? (await api.get(`/reportes/catalogo/${encodeURIComponent(tipo)}`, { params: consulta, timeout: 120000 })).data : null), [tipo, clave]);
  const r = reporte.datos && reporte.datos.tipo === tipo && consulta ? reporte.datos : null;
  const listo = Boolean(r && !reporte.cargando && !reporte.error);

  const excel = async () => {
    if (!consulta || exportando) return;
    setExportando(true);
    try {
      const x = await api.get(`/reportes/catalogo/${encodeURIComponent(tipo)}/excel`, { params: consulta, responseType: 'blob', timeout: 180000 });
      descargarBlob(x.data, nombreDescarga(x.headers['content-disposition'], `${tipo}.xlsx`));
    } catch (e) {
      notificar('error', 'No se pudo exportar el reporte', await mensajeErrorDescarga(e));
    } finally { setExportando(false); }
  };

  if (catalogo.cargando && !catalogo.datos) return <Cargando alto={200} />;
  if (catalogo.error) return <Aviso tipo="error">{catalogo.error}</Aviso>;
  if (!def) return <Aviso tipo="error">Ese reporte no existe o no está disponible en este servidor.</Aviso>;

  return <>
    <div className="reporte-paso no-imprimir"><strong>{def.titulo}</strong><small>{def.descripcion}</small></div>
    <Formulario key={`${def.id}|${claveInicial}`} def={def} inicial={inicial} camaras={camaras.datos ?? []} cargando={Boolean(consulta && reporte.cargando)} listo={listo}
      exportando={exportando} consulta={consulta} onModificado={setModificado} onGenerar={q => (JSON.stringify(q) === clave ? void reporte.recargar() : setConsulta(q))}
      onExcel={() => void excel()} />
    {reporte.error && consulta && <Aviso tipo="error">{reporte.error}</Aviso>}
    {!consulta ? (
      <Tarjeta><p className="texto-secundario">Complete los datos obligatorios y pulse «Generar reporte».</p></Tarjeta>
    ) : reporte.cargando && !r ? <Cargando alto={260} texto="Generando el reporte…" /> : r && !reporte.error && (
      <div className={modificado ? 'reporte-desactualizado' : undefined}>
        <div className="reporte-paso no-imprimir"><span>✓</span><strong>Vista previa</strong><small>Documento listo para imprimir o guardar en PDF; «Excel» descarga los mismos datos.</small></div>
        <Informe titulo={r.titulo} subtitulo={r.descripcion} datos={r.parametros} generadoPor={user?.nombre}>
          <div className="informe-catalogo">
            {r.resumen.length > 0 && <ResumenInforme cifras={r.resumen} />}
            {r.avisos.map(a => <p key={a} className="informe-nota">{a}</p>)}
            {r.hallazgos.length > 0 && <HallazgosReporte items={r.hallazgos} />}
            {r.graficos.length > 0 && (
              <section className="informe-seccion" aria-label="Gráficos">
                <h2>Gráficos</h2>
                <div className="graficos-reporte">{r.graficos.map(g => <GraficoBarras key={g.titulo} g={g} />)}</div>
              </section>
            )}
            {r.secciones.map(s => (
              <section key={s.titulo} className="informe-seccion">
                <h2>{s.titulo}</h2>
                {s.nota && <p className="informe-nota">{s.nota}</p>}
                {s.filas.length ? <TablaReporte s={s} /> : <p className="informe-vacio">Sin registros para los parámetros seleccionados.</p>}
              </section>
            ))}
          </div>
        </Informe>
      </div>
    )}
  </>;
};
