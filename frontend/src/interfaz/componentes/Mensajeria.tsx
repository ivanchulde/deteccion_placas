import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, MessageSquare, Search, Send, Trash2, X } from 'lucide-react';
import api, { mensajeError } from '../../infraestructura/api';
import { useAuth } from '../../aplicacion/AuthContext';
import { useEvento, useReconexion } from '../../aplicacion/tiempoReal';
import { fechaHora, hora, iniciales } from '../../dominio/formato';
import { Confirmar } from './ui';

/** Aviso de Socket.IO: se eliminó la conversación entre `usuarios` (por uno de ellos, `por`). */
interface ConversacionEliminada { usuarios: number[]; por: number }

/**
 * Mensajería interna del personal: la guardianía (guardias de turno), servicios institucionales
 * (gestores de permisos) y la administración se escriben dentro del sistema. El ícono del
 * encabezado muestra los mensajes sin leer y abre un panel lateral derecho con los contactos
 * agrupados y la conversación; todo llega en tiempo real (Socket.IO).
 */

export interface ContactoMensajes {
  id: number;
  nombre: string;
  email: string;
  cargo: string | null;
  rol_nombre: string;
  grupo: 'guardiania' | 'servicios' | 'administracion';
  grupo_etiqueta: string;
  no_leidos: number;
  ultimo: { texto: string; fecha: string; es_mio: boolean } | null;
}

export interface MensajeInterno {
  id: number;
  remitente_id: number;
  destinatario_id: number;
  texto: string;
  fecha_envio: string;
  fecha_lectura: string | null;
}

const GRUPOS: { clave: ContactoMensajes['grupo']; etiqueta: string }[] = [
  { clave: 'guardiania', etiqueta: 'Guardianía' },
  { clave: 'servicios', etiqueta: 'Servicios institucionales' },
  { clave: 'administracion', etiqueta: 'Administración' },
];
const LARGO_MAXIMO = 2000;

/** Primero quien tiene mensajes sin leer, luego la conversación más reciente, luego por nombre. */
const ordenar = (a: ContactoMensajes, b: ContactoMensajes) =>
  (b.no_leidos > 0 ? 1 : 0) - (a.no_leidos > 0 ? 1 : 0)
  || (b.ultimo?.fecha ?? '').localeCompare(a.ultimo?.fecha ?? '')
  || a.nombre.localeCompare(b.nombre, 'es');

const Avatar: React.FC<{ nombre: string }> = ({ nombre }) => <span className="msj-avatar" aria-hidden>{iniciales(nombre)}</span>;

const Conversacion: React.FC<{ contacto: ContactoMensajes; yo: number; onVolver: () => void; onLeidos: () => void; onEliminada: () => void }> = (
  { contacto, yo, onVolver, onLeidos, onEliminada }) => {
  const [mensajes, setMensajes] = useState<MensajeInterno[]>([]);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [hayAnteriores, setHayAnteriores] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const alFinal = useRef(true);

  const marcarLeidos = useCallback(() => {
    api.post(`/mensajes/${contacto.id}/leidos`).then(onLeidos).catch(() => undefined);
  }, [contacto.id, onLeidos]);

  const cargar = useCallback(async (antesDe?: number) => {
    try {
      const { data } = await api.get(`/mensajes/${contacto.id}`, { params: antesDe ? { antes_de: antesDe } : {} });
      setMensajes(actuales => (antesDe ? [...data.mensajes, ...actuales] : data.mensajes));
      setHayAnteriores(Boolean(data.hay_anteriores));
      if (!antesDe && data.mensajes.some((m: MensajeInterno) => m.remitente_id === contacto.id && !m.fecha_lectura)) marcarLeidos();
      setError(null);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo abrir la conversación.'));
    } finally {
      setCargando(false);
    }
  }, [contacto.id, marcarLeidos]);

  useEffect(() => { alFinal.current = true; setCargando(true); void cargar(); }, [cargar]);
  useReconexion(() => void cargar());

  useEvento<MensajeInterno>('mensaje:nuevo', m => {
    const deEsta = (m.remitente_id === contacto.id && m.destinatario_id === yo) || (m.remitente_id === yo && m.destinatario_id === contacto.id);
    if (!deEsta) return;
    alFinal.current = true;
    setAviso(null);
    setMensajes(actuales => (actuales.some(x => x.id === m.id) ? actuales : [...actuales, m]));
    if (m.remitente_id === contacto.id) marcarLeidos();
  });
  // Visto: el contacto leyó lo que le escribí
  useEvento<{ lector_id: number; remitente_id: number }>('mensajes:leidos', e => {
    if (e.lector_id !== contacto.id || e.remitente_id !== yo) return;
    const ahora = new Date().toISOString();
    setMensajes(actuales => actuales.map(m => (m.remitente_id === yo && !m.fecha_lectura ? { ...m, fecha_lectura: ahora } : m)));
  });

  // La otra persona eliminó la conversación: se vacía aquí también
  useEvento<ConversacionEliminada>('mensajes:conversacion-eliminada', e => {
    if (!e.usuarios.includes(contacto.id) || !e.usuarios.includes(yo) || e.por === yo) return;
    setMensajes([]);
    setHayAnteriores(false);
    setAviso(`${contacto.nombre} eliminó esta conversación.`);
  });

  useEffect(() => {
    if (alFinal.current && lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [mensajes]);

  const eliminar = async () => {
    try {
      await api.delete(`/mensajes/${contacto.id}`);
    } catch (e) {
      throw new Error(mensajeError(e, 'No se pudo eliminar la conversación.'));
    }
    onEliminada();
  };

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const { data } = await api.post<MensajeInterno>(`/mensajes/${contacto.id}`, { texto });
      alFinal.current = true;
      setMensajes(actuales => (actuales.some(x => x.id === data.id) ? actuales : [...actuales, data]));
      setTexto('');
    } catch (e) {
      setError(mensajeError(e, 'No se pudo enviar el mensaje.'));
    } finally {
      setEnviando(false);
    }
  };

  const ultimoMio = [...mensajes].reverse().find(m => m.remitente_id === yo);
  return (
    <div className="msj-conversacion">
      <div className="msj-conversacion-cabecera">
        <button type="button" className="btn btn-ghost btn-sm btn-icono" onClick={onVolver} aria-label="Volver a los contactos"><ChevronLeft size={18} /></button>
        <Avatar nombre={contacto.nombre} />
        <div className="msj-contacto-texto">
          <strong>{contacto.nombre}</strong>
          <span>{[contacto.grupo_etiqueta, contacto.cargo].filter(Boolean).join(' · ')}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm btn-icono" onClick={() => setConfirmarEliminar(true)}
          disabled={cargando || mensajes.length === 0} aria-label="Eliminar conversación" title="Eliminar conversación">
          <Trash2 size={16} color={mensajes.length ? 'var(--alerta)' : undefined} />
        </button>
      </div>
      {aviso && <div className="msj-error" role="status">{aviso}</div>}
      {confirmarEliminar && (
        <Confirmar titulo="Eliminar conversación" peligro textoBoton="Eliminar conversación" onCerrar={() => setConfirmarEliminar(false)}
          onConfirmar={eliminar}
          mensaje={<>Se borrarán de la base de datos {hayAnteriores ? 'todos los mensajes' : `los ${mensajes.length} ${mensajes.length === 1 ? 'mensaje' : 'mensajes'}`} con <strong>{contacto.nombre}</strong>,
            también para esa persona. No se puede deshacer. En la auditoría queda quién la eliminó y cuántos mensajes tenía, sin su contenido.</>} />
      )}
      <div ref={lista} className="msj-lista" aria-live="polite" aria-label={`Conversación con ${contacto.nombre}`}
        onScroll={e => { const el = e.currentTarget; alFinal.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {hayAnteriores && (
          <button type="button" className="btn btn-ghost btn-sm msj-anteriores" onClick={() => { alFinal.current = false; void cargar(mensajes[0]?.id); }}>
            Ver mensajes anteriores
          </button>
        )}
        {cargando ? <div className="msj-vacio"><Loader2 size={18} className="girar" /></div>
          : mensajes.length === 0 ? <div className="msj-vacio">Aún no hay mensajes. Escriba el primero.</div>
            : mensajes.map(m => (
              <div key={m.id} className={`msj-burbuja ${m.remitente_id === yo ? 'mia' : 'suya'}`} title={fechaHora(m.fecha_envio)}>
                <span className="msj-burbuja-texto">{m.texto}</span>
                <span className="msj-burbuja-hora">{hora(m.fecha_envio)}{m === ultimoMio && m.fecha_lectura ? ' · Visto' : ''}</span>
              </div>
            ))}
      </div>
      {error && <div className="msj-error" role="alert">{error}</div>}
      <form className="msj-redactar" onSubmit={e => { e.preventDefault(); void enviar(); }}>
        <textarea className="input" value={texto} onChange={e => setTexto(e.target.value)} maxLength={LARGO_MAXIMO} rows={2}
          placeholder={`Escriba a ${contacto.nombre.split(' ')[0]}…`} aria-label="Mensaje"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }} />
        <button type="submit" className="btn btn-navy btn-icono" disabled={!texto.trim() || enviando} aria-label="Enviar mensaje">
          {enviando ? <Loader2 size={16} className="girar" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
};

const PanelMensajes: React.FC<{ yo: number; onCerrar: () => void; onCambio: () => void }> = ({ yo, onCerrar, onCambio }) => {
  const [contactos, setContactos] = useState<ContactoMensajes[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [plegados, setPlegados] = useState<Set<string>>(new Set());

  const cargar = useCallback(() => {
    api.get<ContactoMensajes[]>('/mensajes/contactos')
      .then(r => { setContactos(r.data); setError(null); })
      .catch(e => setError(mensajeError(e, 'No se pudieron cargar los contactos.')));
  }, []);
  useEffect(cargar, [cargar]);
  useReconexion(cargar);
  useEvento('mensaje:nuevo', cargar);
  useEvento('mensajes:leidos', cargar);
  useEvento('mensajes:conversacion-eliminada', cargar);
  useEffect(() => {
    // Con una confirmación abierta, Escape solo la cierra a ella
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal-fondo')) onCerrar(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCerrar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (contactos ?? []).filter(c => !q || [c.nombre, c.email, c.cargo, c.rol_nombre].some(x => x?.toLowerCase().includes(q)));
  }, [contactos, busqueda]);
  const contacto = abierto !== null ? contactos?.find(c => c.id === abierto) ?? null : null;
  const alLeer = useCallback(() => { cargar(); onCambio(); }, [cargar, onCambio]);
  const alEliminar = useCallback(() => { setAbierto(null); cargar(); onCambio(); }, [cargar, onCambio]);

  return (
    <aside className="msj-panel" role="dialog" aria-label="Mensajes">
      <div className="msj-panel-cabecera">
        <strong>Mensajes</strong>
        <button type="button" className="btn btn-ghost btn-sm btn-icono" onClick={onCerrar} aria-label="Cerrar mensajes"><X size={18} /></button>
      </div>
      {contacto ? <Conversacion key={contacto.id} contacto={contacto} yo={yo} onVolver={() => setAbierto(null)} onLeidos={alLeer} onEliminada={alEliminar} /> : (
        <>
          <div className="msj-buscar">
            <div className="input-icono"><Search size={15} />
              <input className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)} maxLength={80}
                placeholder="Buscar persona…" aria-label="Buscar contacto" />
            </div>
          </div>
          {error && <div className="msj-error" role="alert">{error}</div>}
          <div className="msj-contactos">
            {contactos === null && !error ? <div className="msj-vacio"><Loader2 size={18} className="girar" /></div> : GRUPOS.map(g => {
              const lista = filtrados.filter(c => c.grupo === g.clave).sort(ordenar);
              if (!lista.length && g.clave === 'administracion') return null;
              const plegado = plegados.has(g.clave) && !busqueda;
              const sinLeer = lista.reduce((s, c) => s + c.no_leidos, 0);
              return (
                <section key={g.clave} className="msj-grupo">
                  <button type="button" className="msj-grupo-titulo" aria-expanded={!plegado}
                    onClick={() => setPlegados(p => { const n = new Set(p); if (n.has(g.clave)) n.delete(g.clave); else n.add(g.clave); return n; })}>
                    {plegado ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    <strong>{g.etiqueta}</strong> <span>({lista.length})</span>
                    {sinLeer > 0 && <span className="msj-contador">{sinLeer}</span>}
                  </button>
                  {!plegado && (lista.length === 0
                    ? <div className="msj-vacio pequeno">Sin usuarios en este grupo.</div>
                    : lista.map(c => (
                      <button key={c.id} type="button" className={`msj-contacto${c.no_leidos ? ' sin-leer' : ''}`} onClick={() => setAbierto(c.id)}
                        aria-label={`Conversación con ${c.nombre}${c.no_leidos ? `, ${c.no_leidos} sin leer` : ''}`}>
                        <Avatar nombre={c.nombre} />
                        <span className="msj-contacto-texto">
                          <strong>{c.nombre}</strong>
                          <span>{c.ultimo ? `${c.ultimo.es_mio ? 'Usted: ' : ''}${c.ultimo.texto}` : c.cargo || c.rol_nombre}</span>
                        </span>
                        <span className="msj-contacto-meta">
                          {c.ultimo && <span>{hora(c.ultimo.fecha)}</span>}
                          {c.no_leidos > 0 ? <span className="msj-contador">{c.no_leidos}</span> : <ChevronRight size={15} />}
                        </span>
                      </button>
                    )))}
                </section>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
};

/** Ícono de mensajes del encabezado, con los no leídos, que abre el panel lateral. */
export const BotonMensajes: React.FC = () => {
  const { user } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [noLeidos, setNoLeidos] = useState(0);

  const actualizar = useCallback(() => {
    api.get<{ no_leidos: number }>('/mensajes/resumen').then(r => setNoLeidos(r.data.no_leidos)).catch(() => undefined);
  }, []);
  useEffect(actualizar, [actualizar]);
  useReconexion(actualizar);
  useEvento<MensajeInterno>('mensaje:nuevo', m => { if (user && m.destinatario_id === user.id) actualizar(); });
  useEvento('mensajes:leidos', actualizar);
  useEvento('mensajes:conversacion-eliminada', actualizar);
  const cerrar = useCallback(() => setAbierto(false), []);

  if (!user) return null;
  const etiqueta = noLeidos ? `${noLeidos} sin leer` : 'sin mensajes nuevos';
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm btn-icono campana" onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto} aria-haspopup="dialog" aria-label={`Mensajes: ${etiqueta}`} title={`Mensajes · ${etiqueta}`}>
        <MessageSquare size={18} />
        {noLeidos > 0 && <span className="campana-contador">{noLeidos > 99 ? '99+' : noLeidos}</span>}
      </button>
      {abierto && <PanelMensajes yo={user.id} onCerrar={cerrar} onCambio={actualizar} />}
    </>
  );
};
