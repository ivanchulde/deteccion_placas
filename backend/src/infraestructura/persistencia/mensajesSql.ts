import sql from '../postgres';
import { getDB } from '../db';
import { ROL_POR_CODIGO } from '../../dominio/permisos';
import type { FilaContacto, FilaMensaje, RepositorioMensajes, UsuarioContacto } from '../../aplicacion/mensajes';

/** Mensajería interna del personal (tabla MensajesInternos, db/postgresql/esquema.sql). */
const db = () => getDB();

const COLUMNAS_MENSAJE = 'id, remitente_id, destinatario_id, texto, fecha_envio, fecha_lectura';

export const repositorioMensajesSql: RepositorioMensajes = {
  async contactos(usuarioId) {
    const r = await db().request().input('yo', sql.Int, usuarioId).query(`
      WITH ultimos AS (
        SELECT DISTINCT ON (otro) otro, texto, fecha_envio, es_mio FROM (
          SELECT CASE WHEN m.remitente_id = @yo THEN m.destinatario_id ELSE m.remitente_id END AS otro,
                 m.texto, m.fecha_envio, m.id, (m.remitente_id = @yo) AS es_mio
          FROM MensajesInternos m WHERE m.remitente_id = @yo OR m.destinatario_id = @yo
        ) x ORDER BY otro, id DESC
      ), pendientes AS (
        SELECT remitente_id AS otro, COUNT(*) AS no_leidos FROM MensajesInternos
        WHERE destinatario_id = @yo AND fecha_lectura IS NULL GROUP BY remitente_id
      )
      SELECT u.id, u.nombre_completo AS nombre, u.email, u.cargo, ro.codigo AS rol_codigo,
             COALESCE(p.no_leidos, 0) AS no_leidos, ul.texto AS ultimo_texto, ul.fecha_envio AS ultima_fecha, ul.es_mio AS ultimo_es_mio
      FROM Usuarios u JOIN Roles ro ON ro.id = u.rol_id
      LEFT JOIN ultimos ul ON ul.otro = u.id
      LEFT JOIN pendientes p ON p.otro = u.id
      WHERE u.id <> @yo AND u.estado = 'activo'`);
    return r.recordset.map((f: any): FilaContacto => ({
      id: f.id, nombre: f.nombre, email: f.email, cargo: f.cargo ?? null, rol: ROL_POR_CODIGO[f.rol_codigo] ?? f.rol_codigo,
      no_leidos: Number(f.no_leidos) || 0, ultimo_texto: f.ultimo_texto ?? null, ultima_fecha: f.ultima_fecha ?? null,
      ultimo_es_mio: f.ultimo_es_mio ?? null,
    }));
  },

  async usuarioActivo(id) {
    const r = await db().request().input('id', sql.Int, id).query(`
      SELECT u.id, u.nombre_completo AS nombre, u.email, u.cargo, ro.codigo AS rol_codigo
      FROM Usuarios u JOIN Roles ro ON ro.id = u.rol_id WHERE u.id = @id AND u.estado = 'activo'`);
    const f = r.recordset[0];
    return f ? { id: f.id, nombre: f.nombre, email: f.email, cargo: f.cargo ?? null, rol: ROL_POR_CODIGO[f.rol_codigo] ?? f.rol_codigo } as UsuarioContacto : null;
  },

  async conversacion(usuarioId, otroId, limite, antesDe) {
    // El par se ordena aquí: los parámetros llegan sin tipo a PostgreSQL y LEAST(@a, @b) los tomaba
    // como texto («operator does not exist: integer = text»). Comparados con la columna, son enteros.
    const request = db().request()
      .input('menor', sql.Int, Math.min(usuarioId, otroId)).input('mayor', sql.Int, Math.max(usuarioId, otroId))
      .input('limite', sql.Int, limite);
    if (antesDe !== null) request.input('antes', sql.BigInt, antesDe);
    const r = await request.query(`
      SELECT ${COLUMNAS_MENSAJE} FROM MensajesInternos
      WHERE LEAST(remitente_id, destinatario_id) = @menor AND GREATEST(remitente_id, destinatario_id) = @mayor
        ${antesDe !== null ? 'AND id < @antes' : ''}
      ORDER BY id DESC LIMIT @limite`);
    return r.recordset as FilaMensaje[];
  },

  async eliminarConversacion(usuarioId, otroId) {
    const r = await db().request()
      .input('menor', sql.Int, Math.min(usuarioId, otroId)).input('mayor', sql.Int, Math.max(usuarioId, otroId))
      .query(`DELETE FROM MensajesInternos
        WHERE LEAST(remitente_id, destinatario_id) = @menor AND GREATEST(remitente_id, destinatario_id) = @mayor RETURNING id`);
    return r.recordset.length;
  },

  async crear(remitenteId, destinatarioId, texto) {
    const r = await db().request().input('de', sql.Int, remitenteId).input('para', sql.Int, destinatarioId)
      .input('texto', sql.NVarChar(2000), texto)
      .query(`INSERT INTO MensajesInternos (remitente_id, destinatario_id, texto) VALUES (@de, @para, @texto) RETURNING ${COLUMNAS_MENSAJE}`);
    return r.recordset[0] as FilaMensaje;
  },

  async marcarLeidos(usuarioId, otroId) {
    const r = await db().request().input('yo', sql.Int, usuarioId).input('otro', sql.Int, otroId).query(`
      UPDATE MensajesInternos SET fecha_lectura = CURRENT_TIMESTAMP
      WHERE destinatario_id = @yo AND remitente_id = @otro AND fecha_lectura IS NULL RETURNING id`);
    return r.recordset.length;
  },

  async noLeidos(usuarioId) {
    const r = await db().request().input('yo', sql.Int, usuarioId)
      .query('SELECT COUNT(*) AS n FROM MensajesInternos WHERE destinatario_id = @yo AND fecha_lectura IS NULL');
    return Number(r.recordset[0]?.n) || 0;
  },
};
