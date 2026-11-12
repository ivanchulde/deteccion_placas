import sql, { PostgresRequest } from '../postgres';
import { getDB } from '../db';
import type { CamaraEstado, EventoCamara, FilaAccion, FilaPaso, FilaLectura, RepositorioReportes } from '../../aplicacion/reportes';
import { esSinPlaca, ETIQUETA_ESTADO } from '../../dominio/detecciones';
import { describirHorario } from '../../dominio/horario';
import { datoRegistro } from '../../dominio/registroCompleto';
import { ACCIONES_SENSIBLES } from '../../dominio/reportes';
import type { EstadoValidacion } from '../../dominio/decisionAcceso';
import { hoyLocalSql } from '../servicios/tiempo';
import { urlMedia } from '../servicios/media';

/**
 * Consultas de los reportes (aplicacion/reportes.ts) en PostgreSQL: vehículos que más ingresan,
 * estado del sistema y auditoría. Cada vehículo trae los datos de la persona y del vehículo tal
 * como los muestra el historial: lo anotado en el paso y, si falta, lo del permiso de la lista
 * blanca o del registro de la lista negra.
 *
 * Ojo con el adaptador (infraestructura/postgres.ts): separa sentencias por «;», así que ninguna
 * consulta lleva punto y coma, y los parámetros llegan sin tipo, por eso se convierten (::int).
 */

const db = () => getDB();

/** Pasos guardados (el motor ya decidió o los dejó para revisión). */
const BASE = "d.estado_procesamiento IN ('procesado', 'no_legible', 'pendiente_ocr')";
const ES_INGRESO = "COALESCE(d.tipo_movimiento, 'ingreso') = 'ingreso'";
/** Placa del paso sin guion ('' si no hay lectura). */
const PLACA = "REPLACE(COALESCE(NULLIF(d.placa_validada, ''), NULLIF(d.placa_reconocida, ''), ''), '-', '')";
const CON_PLACA = `${PLACA} NOT IN ('', 'NOLEGIBLE', 'SINRECONOCER')`;
const SIN_PLACA_VISIBLE = "COALESCE(d.evidencia_lectura, '') LIKE '%vehiculo_sin_placa%'";
const DE_CAMARA = "COALESCE(d.fuente, 'rtsp') <> 'manual'";
const sinTildes = (e: string) => `TRANSLATE(LOWER(COALESCE(${e}, '')), 'áéíóúüñ', 'aeiouun')`;
/** Primer dato no vacío, recortado ('' si ninguno). */
const primero = (...e: string[]) => `COALESCE(${e.map(x => `NULLIF(TRIM(${x}), '')`).join(', ')}, '')`;
const HORA_LOCAL = (columna: string) => `(${columna} + (@desfase::int * INTERVAL '1 minute'))`;

const SELECT_PASO = `
  SELECT d.id, d.fecha_hora_ingreso, d.fecha_hora_salida, d.tipo_movimiento, d.placa_validada, d.placa_reconocida,
         d.persona_ingreso, d.cedula_ingreso, d.institucion_ingreso, d.cargo_ingreso, d.motivo_ingreso,
         d.vehiculo_tipo, d.tipo_vehiculo, d.vehiculo_marca, d.vehiculo_modelo, d.vehiculo_color,
         d.ruta_imagen_ingreso, d.ruta_imagen_placa, d.fuente, d.estado_validacion, d.estado_procesamiento,
         d.restriccion_acceso, d.validado_manualmente, d.evidencia_lectura, d.confianza_ocr, d.categoria_permiso, d.horario_permiso,
         c.nombre AS camara_nombre,
         v.propietario, v.cedula AS autorizado_cedula, v.institucion AS autorizado_institucion, v.cargo AS autorizado_cargo,
         v.tipo_vehiculo AS autorizado_tipo, v.marca AS autorizado_marca, v.modelo AS autorizado_modelo, v.color AS autorizado_color,
         v.motivo_ingreso AS autorizado_motivo, v.categoria AS autorizado_categoria, v.horario AS autorizado_horario,
         l.motivo AS alerta_motivo, l.nivel_alerta, l.institucion AS alerta_institucion, l.cargo AS alerta_cargo,
         l.tipo_vehiculo AS alerta_tipo, l.marca AS alerta_marca, l.modelo AS alerta_modelo, l.color AS alerta_color,
         uv.nombre_completo AS validador_nombre
  FROM DeteccionVehiculo d
  LEFT JOIN Camaras c ON c.id = d.camara_id
  LEFT JOIN ListaNegra l ON l.id = d.alerta_id
  LEFT JOIN ListaBlanca v ON v.id = d.vehiculo_autorizado_id
  LEFT JOIN Usuarios uv ON uv.id = d.usuario_validador_id`;

/** Un campo vaciado a propósito en el paso ('') no se repone desde las listas. */
const dato = (propio: unknown, ...otros: unknown[]) => (propio === '' ? null : datoRegistro(propio, ...otros));

/** Fila de la base → paso del reporte, con las fotos en URL firmada. */
export function filaPaso(r: Record<string, any>): FilaPaso {
  const placa = datoRegistro(r.placa_validada, r.placa_reconocida);
  return {
    id: r.id,
    fecha: r.fecha_hora_ingreso,
    salida: r.fecha_hora_salida ?? null,
    movimiento: r.tipo_movimiento === 'salida' ? 'salida' : 'ingreso',
    placa: placa && !['NOLEGIBLE', 'SINRECONOCER'].includes(placa.replace(/-/g, '')) ? placa : null,
    nombre: datoRegistro(r.persona_ingreso, r.propietario),
    cedula: dato(r.cedula_ingreso, r.autorizado_cedula),
    institucion: dato(r.institucion_ingreso, r.autorizado_institucion, r.alerta_institucion),
    cargo: dato(r.cargo_ingreso, r.autorizado_cargo, r.alerta_cargo),
    motivo: datoRegistro(r.motivo_ingreso, r.autorizado_motivo),
    tipo: datoRegistro(r.vehiculo_tipo, r.tipo_vehiculo, r.autorizado_tipo, r.alerta_tipo),
    marca: datoRegistro(r.vehiculo_marca, r.autorizado_marca, r.alerta_marca),
    modelo: datoRegistro(r.vehiculo_modelo, r.autorizado_modelo, r.alerta_modelo),
    color: datoRegistro(r.vehiculo_color, r.autorizado_color, r.alerta_color),
    foto_vehiculo: urlMedia(r.ruta_imagen_ingreso),
    foto_placa: urlMedia(r.ruta_imagen_placa),
    camara: r.camara_nombre ?? (r.fuente === 'manual' ? 'Registro manual' : null),
    estado: ETIQUETA_ESTADO[r.estado_validacion as EstadoValidacion] ?? r.estado_validacion ?? '—',
    estado_codigo: r.estado_validacion ?? '',
    categoria: datoRegistro(r.categoria_permiso, r.autorizado_categoria),
    alerta_motivo: r.alerta_motivo ?? null,
    nivel: r.nivel_alerta ?? null,
    restriccion: r.restriccion_acceso ?? null,
    horario: r.horario_permiso || r.autorizado_horario ? describirHorario(r.horario_permiso || r.autorizado_horario) : null,
    validado: Boolean(r.validado_manualmente),
    validador: r.validador_nombre ?? null,
    sin_placa: esSinPlaca(r),
    no_legible: r.estado_procesamiento === 'no_legible',
    confianza: r.confianza_ocr ?? null,
  };
}

const enteros = (ids: unknown[]) => [...new Set(ids.map(Number).filter(Number.isInteger))];

/** Fichas de estos pasos (fotos y datos del último ingreso de cada vehículo). */
async function fichas(ids: unknown[]): Promise<Map<number, FilaPaso>> {
  const lista = enteros(ids);
  if (!lista.length) return new Map();
  const r = await db().request().query(`${SELECT_PASO} WHERE d.id IN (${lista.join(',')})`);
  return new Map(r.recordset.map(x => [Number(x.id), filaPaso(x)]));
}

/** Situación actual de una placa (sin guion) en las listas. */
const situacionSql = (placa: string) => `CASE
  WHEN EXISTS (SELECT 1 FROM ListaNegra n WHERE n.activo IS TRUE AND REPLACE(n.placa, '-', '') = ${placa}) THEN 'Lista negra'
  WHEN EXISTS (SELECT 1 FROM ListaBlanca b WHERE b.activo IS TRUE AND REPLACE(b.placa, '-', '') = ${placa}) THEN 'Lista blanca'
  ELSE 'Sin permiso' END`;

const SITUACION: Record<string, string> = { blanca: 'Lista blanca', sin_permiso: 'Sin permiso', negra: 'Lista negra' };

/**
 * Ingresos del período agrupados por placa (`sel`: los vehículos que cumplen los filtros) y sus
 * pasos con la marca, tipo, color e institución efectivos (`p`).
 */
function cteVehiculos(request: PostgresRequest, f: Parameters<RepositorioReportes['vehiculosFrecuentes']>[0]): string {
  request.input('desde', sql.DateTime, f.desde).input('hasta', sql.DateTime, f.hasta).input('desfase', sql.Int, f.desfase).input('minimo', sql.Int, f.minimo);
  const w = [BASE, ES_INGRESO, CON_PLACA, 'd.fecha_hora_ingreso >= @desde', 'd.fecha_hora_ingreso <= @hasta'];
  if (f.camara) { request.input('camara', sql.Int, f.camara); w.push('d.camara_id = @camara'); }
  let coincide = 'TRUE';
  if (f.buscar) {
    request.input('buscar', sql.NVarChar(70), `%${f.buscar}%`).input('buscarPlaca', sql.VarChar(70), `%${f.buscar.toUpperCase().replace(/[\s-]/g, '')}%`);
    coincide = `(${PLACA} LIKE @buscarPlaca OR ${sinTildes('d.persona_ingreso')} LIKE ${sinTildes('@buscar')} OR ${sinTildes('v.propietario')} LIKE ${sinTildes('@buscar')}
      OR COALESCE(d.cedula_ingreso, '') LIKE @buscar OR COALESCE(v.cedula, '') LIKE @buscar)`;
  }
  const situacion = f.situacion && SITUACION[f.situacion] ? ` AND situacion = '${SITUACION[f.situacion]}'` : '';
  return `
    WITH p AS (
      SELECT d.id, ${PLACA} AS placa, d.fecha_hora_ingreso AS t, d.fecha_hora_salida AS s, ${HORA_LOCAL('d.fecha_hora_ingreso')} AS lt,
             NULLIF(${primero('d.motivo_ingreso', 'v.motivo_ingreso')}, '') AS motivo,
             (d.estado_validacion = 'alerta' OR d.alerta_id IS NOT NULL) AS alerta,
             UPPER(${primero('d.vehiculo_marca', 'v.marca', 'l.marca')}) AS marca,
             ${primero('d.vehiculo_tipo', 'd.tipo_vehiculo', 'v.tipo_vehiculo', 'l.tipo_vehiculo')} AS tipo,
             UPPER(${primero('d.vehiculo_color', 'v.color', 'l.color')}) AS color,
             UPPER(${primero('d.institucion_ingreso', 'v.institucion', 'l.institucion')}) AS institucion,
             ${coincide} AS coincide
      FROM DeteccionVehiculo d
      LEFT JOIN ListaBlanca v ON v.id = d.vehiculo_autorizado_id
      LEFT JOIN ListaNegra l ON l.id = d.alerta_id
      WHERE ${w.join(' AND ')}
    ), g AS (
      SELECT placa, COUNT(*) AS ingresos, COUNT(DISTINCT lt::date) AS dias, MIN(t) AS primero, MAX(t) AS ultimo, MAX(id) AS ultimo_id,
             COUNT(*) FILTER (WHERE s >= t) AS con_salida,
             AVG(EXTRACT(EPOCH FROM (s - t)) / 60.0) FILTER (WHERE s >= t) AS permanencia,
             MODE() WITHIN GROUP (ORDER BY motivo) FILTER (WHERE motivo IS NOT NULL) AS motivo_frecuente,
             MODE() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM lt)::int) AS hora_habitual,
             BOOL_OR(alerta) AS alerta, BOOL_OR(coincide) AS coincide
      FROM p GROUP BY placa
    ), sit AS (
      SELECT g.*, CASE WHEN g.alerta THEN 'Lista negra' ELSE ${situacionSql('g.placa')} END AS situacion FROM g
    ), sel AS (
      SELECT * FROM sit WHERE ingresos >= @minimo::int AND coincide${situacion}
    )`;
}

export const repositorioReportesSql: RepositorioReportes = {
  async nombreCamara(id) {
    const r = await db().request().input('id', sql.Int, id).query('SELECT nombre FROM Camaras WHERE id = @id::int');
    return r.recordset[0]?.nombre ?? null;
  },

  async vehiculosFrecuentes(f) {
    const rq = db().request().input('limite', sql.Int, f.limite);
    const r = await rq.query(`${cteVehiculos(rq, f)}
      SELECT sel.*, COUNT(*) OVER () AS total_filas FROM sel ORDER BY sel.ingresos DESC, sel.ultimo DESC, sel.placa LIMIT @limite::int`);
    const rd = db().request();
    const dims = await rd.query(`${cteVehiculos(rd, f)}, x AS (SELECT p.* FROM p JOIN sel ON sel.placa = p.placa)
      SELECT 'total' AS dim, NULL AS valor, COUNT(*) AS ingresos, COUNT(DISTINCT placa) AS vehiculos FROM x
      UNION ALL SELECT 'unavez', NULL, COUNT(*), COUNT(*) FROM sel WHERE ingresos = 1
      UNION ALL SELECT 'marca', marca, COUNT(*), COUNT(DISTINCT placa) FROM x GROUP BY marca
      UNION ALL SELECT 'tipo', tipo, COUNT(*), COUNT(DISTINCT placa) FROM x GROUP BY tipo
      UNION ALL SELECT 'color', color, COUNT(*), COUNT(DISTINCT placa) FROM x GROUP BY color
      UNION ALL SELECT 'institucion', institucion, COUNT(*), COUNT(DISTINCT placa) FROM x GROUP BY institucion
      UNION ALL SELECT 'hora', EXTRACT(HOUR FROM lt)::int::text, COUNT(*), COUNT(DISTINCT placa) FROM x GROUP BY 2
      UNION ALL SELECT 'dia', EXTRACT(ISODOW FROM lt)::int::text, COUNT(*), COUNT(DISTINCT placa) FROM x GROUP BY 2`);
    const ficha = await fichas(r.recordset.map(x => x.ultimo_id));
    const totales = dims.recordset.find(x => x.dim === 'total');
    return {
      total: Number(r.recordset[0]?.total_filas ?? 0),
      ingresos: Number(totales?.ingresos ?? 0),
      vehiculos: Number(totales?.vehiculos ?? 0),
      unaVez: Number(dims.recordset.find(x => x.dim === 'unavez')?.ingresos ?? 0),
      dimensiones: dims.recordset.filter(x => !['total', 'unavez'].includes(x.dim))
        .map(x => ({ dim: x.dim, valor: x.valor ?? null, ingresos: Number(x.ingresos), vehiculos: Number(x.vehiculos) })),
      filas: r.recordset.map(x => ({
        ...(ficha.get(Number(x.ultimo_id)) ?? filaPaso({ id: x.ultimo_id })), placa: x.placa,
        ingresos: Number(x.ingresos), dias: Number(x.dias), primero: x.primero, ultimo: x.ultimo, con_salida: Number(x.con_salida),
        permanencia: x.permanencia === null || x.permanencia === undefined ? null : Number(x.permanencia),
        motivo_frecuente: x.motivo_frecuente ?? null, hora_habitual: x.hora_habitual === null || x.hora_habitual === undefined ? null : Number(x.hora_habitual),
        situacion: x.situacion,
      })),
    };
  },

  async camaras() {
    const r = await db().request().query(`
      SELECT c.id, c.nombre, c.ubicacion, c.direccion, c.activa, c.analisis_anpr, c.estado, c.ultimo_ping, c.tiempo_respuesta_ms, c.mensaje_ping,
             (SELECT MAX(x.fecha_hora_ingreso) FROM DeteccionVehiculo x WHERE x.camara_id = c.id) AS ultimo_paso
      FROM Camaras c ORDER BY c.nombre, c.id`);
    return r.recordset.map((x): CamaraEstado => ({
      id: x.id, nombre: x.nombre, ubicacion: x.ubicacion ?? null, direccion: x.direccion, activa: Boolean(x.activa), analisis: x.analisis_anpr !== false,
      estado: x.estado ?? null, ultimo_ping: x.ultimo_ping ?? null, tiempo_respuesta_ms: x.tiempo_respuesta_ms ?? null, mensaje_ping: x.mensaje_ping ?? null,
      ultimo_paso: x.ultimo_paso ?? null,
    }));
  },

  async eventosCamaras(desde, hasta) {
    const previos = await db().request().input('desde', sql.DateTime, desde).query(`
      SELECT DISTINCT ON (camara_id) camara_id, estado, fecha, mensaje FROM camaraseventos WHERE fecha < @desde ORDER BY camara_id, fecha DESC, id DESC`);
    const eventos = await db().request().input('desde', sql.DateTime, desde).input('hasta', sql.DateTime, hasta).query(`
      SELECT camara_id, estado, fecha, mensaje FROM camaraseventos WHERE fecha >= @desde AND fecha <= @hasta ORDER BY fecha, id`);
    const evento = (x: any): EventoCamara => ({ camara_id: Number(x.camara_id), estado: x.estado === 'EN_LINEA' ? 'EN_LINEA' : 'SIN_CONEXION',
      fecha: new Date(x.fecha), mensaje: x.mensaje ?? null });
    return { previos: previos.recordset.map(evento), eventos: eventos.recordset.map(evento) };
  },

  async lecturas(f) {
    const consulta = (porDia: boolean) => {
      const request = db().request().input('desfase', sql.Int, f.desfase).input('desde', sql.DateTime, f.desde).input('hasta', sql.DateTime, f.hasta);
      const lectura = "REPLACE(COALESCE(NULLIF(d.placa_ocr_original, ''), d.placa_reconocida, ''), '-', '')";
      const leida = `d.estado_procesamiento = 'procesado' AND ${lectura} NOT IN ('', 'NOLEGIBLE', 'SINRECONOCER') AND NOT ${SIN_PLACA_VISIBLE}`;
      return request.query(`
        SELECT d.camara_id, COALESCE(c.nombre, 'Sin cámara') AS camara, ${porDia ? `TO_CHAR(${HORA_LOCAL('d.fecha_hora_ingreso')}, 'YYYY-MM-DD')` : 'NULL'} AS dia,
               COUNT(*) AS pasos, COUNT(*) FILTER (WHERE ${leida}) AS leidas,
               COUNT(*) FILTER (WHERE ${SIN_PLACA_VISIBLE}) AS sin_placa,
               COUNT(*) FILTER (WHERE d.estado_procesamiento = 'no_legible' AND NOT ${SIN_PLACA_VISIBLE}) AS ilegibles,
               COUNT(*) FILTER (WHERE d.lectura_valida IS TRUE) AS confirmadas,
               COUNT(*) FILTER (WHERE ${leida} AND d.validado_manualmente IS TRUE AND COALESCE(d.placa_validada, '') <> ''
                 AND REPLACE(d.placa_validada, '-', '') <> ${lectura}) AS corregidas,
               AVG(d.confianza_ocr) AS confianza_ocr, ROUND(AVG(d.nitidez)::numeric, 1) AS nitidez
        FROM DeteccionVehiculo d LEFT JOIN Camaras c ON c.id = d.camara_id
        WHERE d.estado_procesamiento IN ('procesado', 'no_legible') AND ${DE_CAMARA}
          AND d.fecha_hora_ingreso >= @desde AND d.fecha_hora_ingreso <= @hasta
        GROUP BY 1, 2, 3 ORDER BY ${porDia ? '3 DESC, 2' : '2'}`);
    };
    const [camaras, dias] = await Promise.all([consulta(false), consulta(true)]);
    const fila = (x: any): FilaLectura => ({
      camara_id: x.camara_id ?? null, camara: x.camara, dia: x.dia ?? null, pasos: Number(x.pasos), leidas: Number(x.leidas), sin_placa: Number(x.sin_placa),
      ilegibles: Number(x.ilegibles), confirmadas: Number(x.confirmadas), corregidas: Number(x.corregidas),
      confianza_ocr: x.confianza_ocr === null ? null : Number(x.confianza_ocr), nitidez: x.nitidez === null ? null : Number(x.nitidez),
    });
    return { porCamara: camaras.recordset.map(fila), porDia: dias.recordset.map(fila) };
  },

  async operacion(diasAviso) {
    const hoy = hoyLocalSql();
    const r = await db().request().input('dias', sql.Int, diasAviso).query(`
      SELECT
        (SELECT COUNT(*) FROM DeteccionVehiculo d WHERE ${BASE} AND d.estado_validacion = 'pendiente_revision' AND d.validado_manualmente IS NOT TRUE) AS pendientes,
        (SELECT COUNT(*) FROM DeteccionVehiculo d WHERE ${BASE} AND d.estado_validacion = 'pendiente_revision' AND d.validado_manualmente IS NOT TRUE
           AND d.fecha_hora_ingreso < CURRENT_TIMESTAMP - INTERVAL '1 hour') AS pendientes_antiguos,
        (SELECT COUNT(*) FROM DeteccionVehiculo d WHERE ${BASE} AND ${ES_INGRESO} AND d.estado_validacion = 'autorizado' AND d.fecha_hora_salida IS NULL
           AND d.fecha_hora_ingreso < CURRENT_TIMESTAMP - INTERVAL '24 hours') AS sin_salida,
        (SELECT COUNT(*) FROM ListaBlanca WHERE activo IS TRUE AND fecha_vencimiento >= ${hoy} AND fecha_vencimiento <= ${hoy} + @dias::int) AS por_vencer,
        (SELECT COUNT(*) FROM ListaBlanca WHERE activo IS TRUE AND fecha_vencimiento < ${hoy}) AS vencidos,
        (SELECT COUNT(*) FROM Usuarios WHERE estado = 'pendiente') AS usuarios_pendientes,
        (SELECT COUNT(*) FROM Usuarios WHERE bloqueado IS TRUE) AS usuarios_bloqueados`);
    const x = r.recordset[0] ?? {};
    return {
      pendientes: Number(x.pendientes ?? 0), pendientes_antiguos: Number(x.pendientes_antiguos ?? 0), sin_salida: Number(x.sin_salida ?? 0),
      por_vencer: Number(x.por_vencer ?? 0), vencidos: Number(x.vencidos ?? 0), usuarios_pendientes: Number(x.usuarios_pendientes ?? 0),
      usuarios_bloqueados: Number(x.usuarios_bloqueados ?? 0),
    };
  },

  async auditoria(f) {
    const filtroUsuario = (request: PostgresRequest, nombre: string, correo: string) => {
      if (!f.usuario) return 'TRUE';
      request.input('usuario', sql.NVarChar(110), `%${f.usuario}%`);
      return `(${sinTildes(nombre)} LIKE ${sinTildes('@usuario')} OR LOWER(COALESCE(${correo}, '')) LIKE LOWER(@usuario))`;
    };
    const acciones = (request: PostgresRequest) => {
      request.input('desde', sql.DateTime, f.desde).input('hasta', sql.DateTime, f.hasta).input('desfase', sql.Int, f.desfase)
        .input('sistema', sql.NVarChar(40), f.sistema);
      return `
        WITH a AS (
          SELECT o.fecha, o.usuario_id, o.usuario_email AS email, o.accion, o.entidad, o.detalle, o.ip
          FROM AuditoriaOperaciones o WHERE o.fecha >= @desde AND o.fecha <= @hasta
          UNION ALL
          SELECT u.fecha, u.actor_id, u.actor_email, u.accion, 'usuario', CONCAT_WS(' · ', u.objetivo_email, u.detalle), u.ip
          FROM AuditoriaUsuarios u WHERE u.fecha >= @desde AND u.fecha <= @hasta
        ), x AS (
          SELECT a.*, CASE WHEN a.usuario_id IS NULL THEN @sistema ELSE COALESCE(us.nombre_completo, a.email) END AS usuario,
                 ro.nombre AS rol, ${HORA_LOCAL('a.fecha')} AS lt
          FROM a LEFT JOIN Usuarios us ON us.id = a.usuario_id LEFT JOIN Roles ro ON ro.id = us.rol_id
          WHERE ${filtroUsuario(request, 'us.nombre_completo', 'a.email')}
        )`;
      // Sin usuario (salidas automáticas, tareas programadas, la cuenta interna sistema@anpr): lo hizo el sistema
    };
    const sensibles = `(x.accion IN (${ACCIONES_SENSIBLES.map(a => `'${a}'`).join(', ')}) OR x.accion LIKE '%ELIMIN%' OR x.accion LIKE 'USUARIO%' OR x.accion LIKE '%PASSWORD%')`;
    const detalle = async (condicion: string) => {
      const request = db().request().input('limite', sql.Int, f.limite);
      const r = await request.query(`${acciones(request)}
        SELECT x.fecha, x.usuario, x.rol, x.accion, x.entidad, x.detalle, x.ip, COUNT(*) OVER () AS total_filas
        FROM x WHERE ${condicion} ORDER BY x.fecha DESC LIMIT @limite::int`);
      return { total: Number(r.recordset[0]?.total_filas ?? 0),
        filas: r.recordset.map((y): FilaAccion => ({ fecha: y.fecha, usuario: y.usuario, rol: y.rol ?? null, accion: y.accion, entidad: y.entidad ?? null, detalle: y.detalle ?? null, ip: y.ip ?? null })) };
    };
    const rc = db().request();
    const conteos = await rc.query(`${acciones(rc)}
      SELECT x.usuario, x.rol, x.accion, EXTRACT(HOUR FROM x.lt)::int AS hora,
             (EXTRACT(ISODOW FROM x.lt) >= 6 OR EXTRACT(HOUR FROM x.lt) < 7 OR EXTRACT(HOUR FROM x.lt) >= 19) AS fuera, COUNT(*) AS n
      FROM x GROUP BY 1, 2, 3, 4, 5`);
    const rs = db().request().input('desde', sql.DateTime, f.desde).input('hasta', sql.DateTime, f.hasta);
    const sesiones = await rs.query(`
      SELECT a.email, us.nombre_completo AS usuario, a.exito, a.motivo, COUNT(*) AS n, COUNT(DISTINCT a.ip) AS ips, MAX(a.fecha) AS ultimo
      FROM AuditoriaAccesos a LEFT JOIN Usuarios us ON us.id = a.usuario_id
      WHERE a.fecha >= @desde AND a.fecha <= @hasta AND ${filtroUsuario(rs, 'us.nombre_completo', 'a.email')}
      GROUP BY 1, 2, 3, 4`);
    const rf = db().request().input('desde', sql.DateTime, f.desde).input('hasta', sql.DateTime, f.hasta).input('limite', sql.Int, f.limite);
    const fallidos = await rf.query(`
      SELECT a.fecha, a.email, us.nombre_completo AS usuario, a.motivo, a.ip, COUNT(*) OVER () AS total_filas
      FROM AuditoriaAccesos a LEFT JOIN Usuarios us ON us.id = a.usuario_id
      WHERE a.exito IS NOT TRUE AND a.fecha >= @desde AND a.fecha <= @hasta AND ${filtroUsuario(rf, 'us.nombre_completo', 'a.email')}
      ORDER BY a.fecha DESC LIMIT @limite::int`);
    // Conteos por usuario y acción (con «fuera de la jornada») y actividad por hora, de la misma consulta
    const porAccion = new Map<string, { usuario: string; rol: string | null; accion: string; fuera: boolean; n: number }>();
    const porHora = new Map<number, number>();
    for (const x of conteos.recordset) {
      const clave = `${x.usuario}|${x.accion}|${x.fuera}`;
      const actual = porAccion.get(clave) ?? { usuario: x.usuario, rol: x.rol ?? null, accion: x.accion, fuera: Boolean(x.fuera), n: 0 };
      actual.n += Number(x.n);
      porAccion.set(clave, actual);
      porHora.set(Number(x.hora), (porHora.get(Number(x.hora)) ?? 0) + Number(x.n));
    }
    const [sens, todo] = await Promise.all([detalle(sensibles), detalle('TRUE')]);
    return {
      conteos: [...porAccion.values()],
      porHora: [...porHora.entries()].map(([hora, n]) => ({ hora, n })),
      sesiones: sesiones.recordset.map(x => ({ email: x.email, usuario: x.usuario ?? null, exito: Boolean(x.exito), motivo: x.motivo ?? null,
        n: Number(x.n), ips: Number(x.ips), ultimo: x.ultimo })),
      sensibles: sens,
      detalle: todo,
      fallidos: { total: Number(fallidos.recordset[0]?.total_filas ?? 0),
        filas: fallidos.recordset.map(x => ({ fecha: x.fecha, email: x.email, usuario: x.usuario ?? null, motivo: x.motivo ?? null, ip: x.ip ?? null })) },
    };
  },
};
