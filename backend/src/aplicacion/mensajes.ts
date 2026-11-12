import { type Actor, errorNoEncontrado, errorValidacion, type PuertoAuditoria } from './comun';
import { GRUPO_CONTACTO, leerTextoMensaje } from '../dominio/mensajes';
import { esRol, NOMBRE_ROL } from '../dominio/permisos';
import { validarEntero } from '../dominio/validacion';

/**
 * Mensajería interna entre la guardianía y servicios institucionales (y el administrador). Cada
 * usuario ve solo sus conversaciones; los mensajes nuevos llegan en tiempo real a los dos
 * participantes. Persistencia en infraestructura/persistencia/mensajesSql.ts.
 */

export interface UsuarioContacto {
  id: number;
  nombre: string;
  email: string;
  cargo: string | null;
  /** Código de la aplicación (Guardia, GestorPermisos, Admin) */
  rol: string;
}

export interface FilaContacto extends UsuarioContacto {
  no_leidos: number;
  ultimo_texto: string | null;
  ultima_fecha: string | Date | null;
  ultimo_es_mio: boolean | null;
}

export interface FilaMensaje {
  id: number;
  remitente_id: number;
  destinatario_id: number;
  texto: string;
  fecha_envio: string | Date;
  fecha_lectura: string | Date | null;
}

export interface RepositorioMensajes {
  /** Usuarios activos (sin `usuarioId`) con su último mensaje con él y cuántos le dejaron sin leer */
  contactos(usuarioId: number): Promise<FilaContacto[]>;
  /** Usuario activo, o null si no existe o está deshabilitado */
  usuarioActivo(id: number): Promise<UsuarioContacto | null>;
  /** Mensajes entre los dos, los más recientes primero (antes del id `antesDe`, si se indica) */
  conversacion(usuarioId: number, otroId: number, limite: number, antesDe: number | null): Promise<FilaMensaje[]>;
  crear(remitenteId: number, destinatarioId: number, texto: string): Promise<FilaMensaje>;
  /** Borra de la base todos los mensajes entre los dos; devuelve cuántos */
  eliminarConversacion(usuarioId: number, otroId: number): Promise<number>;
  /** Marca como leídos los que `otroId` le envió a `usuarioId`; devuelve cuántos */
  marcarLeidos(usuarioId: number, otroId: number): Promise<number>;
  noLeidos(usuarioId: number): Promise<number>;
}

export interface DependenciasMensajes {
  repositorio: RepositorioMensajes;
  eventos: { aUsuarios(usuarios: number[], canal: string, datos: unknown): void };
  /** Constancia de las conversaciones eliminadas (sin su contenido) */
  auditoria: PuertoAuditoria;
}

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);

function grupoDe(rol: string) {
  return esRol(rol) ? GRUPO_CONTACTO[rol] : { clave: 'administracion' as const, etiqueta: 'Otros', orden: 9 };
}

function contactoDTO(u: UsuarioContacto) {
  const grupo = grupoDe(u.rol);
  return {
    id: u.id, nombre: u.nombre, email: u.email, cargo: u.cargo,
    rol: u.rol, rol_nombre: esRol(u.rol) ? NOMBRE_ROL[u.rol] : u.rol, grupo: grupo.clave, grupo_etiqueta: grupo.etiqueta,
  };
}

export function mensajeDTO(m: FilaMensaje) {
  return {
    id: Number(m.id), remitente_id: m.remitente_id, destinatario_id: m.destinatario_id, texto: m.texto,
    fecha_envio: iso(m.fecha_envio), fecha_lectura: iso(m.fecha_lectura),
  };
}

export type MensajeDTO = ReturnType<typeof mensajeDTO>;

export function casosMensajes(d: DependenciasMensajes) {
  const leerContacto = async (valor: unknown, actor: Actor, activo = true) => {
    const id = validarEntero(valor, { etiqueta: 'Usuario', min: 1, max: 2_147_483_647, requerido: true });
    if (!id.ok || id.valor === null) throw errorValidacion(id.ok ? 'Indique el usuario.' : id.error);
    if (id.valor === actor.id) throw errorValidacion('No puede escribirse a sí mismo.');
    const u = await d.repositorio.usuarioActivo(id.valor);
    if (!u && activo) throw errorNoEncontrado('El usuario no existe o está deshabilitado.');
    return { id: id.valor, usuario: u };
  };

  return {
    /** Contactos agrupados (Guardianía, Servicios institucionales, Administración) con su último mensaje. */
    async contactos(actor: Actor) {
      const filas = await d.repositorio.contactos(actor.id);
      return filas
        .map(f => ({
          ...contactoDTO(f), no_leidos: Number(f.no_leidos) || 0,
          ultimo: f.ultima_fecha ? { texto: f.ultimo_texto ?? '', fecha: iso(f.ultima_fecha), es_mio: Boolean(f.ultimo_es_mio) } : null,
        }))
        .sort((a, b) => grupoDe(a.rol).orden - grupoDe(b.rol).orden || a.nombre.localeCompare(b.nombre, 'es'));
    },

    /** Conversación con un usuario (40 mensajes por página, del más antiguo al más reciente). */
    async conversacion(actor: Actor, otro: unknown, consulta: Record<string, unknown>) {
      const { id, usuario } = await leerContacto(otro, actor, false);
      const antes = validarEntero(consulta.antes_de, { etiqueta: 'Mensaje', min: 1, max: Number.MAX_SAFE_INTEGER });
      if (!antes.ok) throw errorValidacion(antes.error);
      const filas = await d.repositorio.conversacion(actor.id, id, 41, antes.valor);
      return {
        contacto: usuario ? contactoDTO(usuario) : null,
        mensajes: filas.slice(0, 40).reverse().map(mensajeDTO),
        hay_anteriores: filas.length > 40,
      };
    },

    async enviar(actor: Actor, otro: unknown, cuerpo: unknown) {
      const { id } = await leerContacto(otro, actor);
      const texto = leerTextoMensaje((cuerpo as Record<string, unknown> | null)?.texto);
      if (!texto.ok) throw errorValidacion(texto.error);
      const mensaje = mensajeDTO(await d.repositorio.crear(actor.id, id, texto.valor));
      // Los dos participantes: el destinatario lo recibe y las otras pestañas del remitente se actualizan
      d.eventos.aUsuarios([id, actor.id], 'mensaje:nuevo', { ...mensaje, remitente_nombre: actor.nombre });
      return mensaje;
    },

    /** El usuario abrió la conversación: lo que `otro` le escribió queda leído (y `otro` ve el visto). */
    async marcarLeidos(actor: Actor, otro: unknown) {
      const { id } = await leerContacto(otro, actor, false);
      const leidos = await d.repositorio.marcarLeidos(actor.id, id);
      if (leidos) d.eventos.aUsuarios([id, actor.id], 'mensajes:leidos', { lector_id: actor.id, remitente_id: id });
      return { leidos };
    },

    /**
     * Elimina la conversación de la base para los dos participantes (no se puede deshacer). Queda
     * en la auditoría quién la eliminó, con quién y cuántos mensajes, sin su contenido; el otro
     * participante la ve desaparecer en tiempo real.
     */
    async eliminarConversacion(actor: Actor, otro: unknown) {
      const { id, usuario } = await leerContacto(otro, actor, false);
      const eliminados = await d.repositorio.eliminarConversacion(actor.id, id);
      if (eliminados) {
        await d.auditoria.operacion(actor, 'MENSAJES_CONVERSACION_ELIMINADA', 'usuario', id,
          `Conversación con ${usuario ? `${usuario.nombre} (${usuario.email})` : `el usuario #${id}`} · ${eliminados} ${eliminados === 1 ? 'mensaje' : 'mensajes'}`);
        d.eventos.aUsuarios([id, actor.id], 'mensajes:conversacion-eliminada', { usuarios: [actor.id, id], por: actor.id });
      }
      return { eliminados };
    },

    async resumen(actor: Actor) {
      return { no_leidos: await d.repositorio.noLeidos(actor.id) };
    },
  };
}

export type CasosMensajes = ReturnType<typeof casosMensajes>;
