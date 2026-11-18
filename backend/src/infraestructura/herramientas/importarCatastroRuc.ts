/**
 * Importa el catastro del RUC que el SRI publica como datos abiertos a la tabla catastroruc, para
 * completar el nombre de una persona por su cédula sin consultar servicios externos.
 *
 * Solo guarda personas naturales y de ellas solo dos datos: la cédula (los 10 primeros dígitos del
 * RUC, que es la cédula + 001) y el nombre (razón social, APELLIDOS NOMBRES). Cubre a quienes tienen
 * RUC; el resto se sigue escribiendo a mano. Repetirla actualiza los nombres; no borra a nadie.
 *
 * Uso, dentro del contenedor del backend:
 *   node dist/infraestructura/herramientas/importarCatastroRuc.js todas                  las 24 provincias (2,9 GB, ~9 min, ~710 MB en la base)
 *   node dist/infraestructura/herramientas/importarCatastroRuc.js Tungurahua Pichincha   solo esas provincias
 *   node dist/infraestructura/herramientas/importarCatastroRuc.js --archivo /tmp/SRI_RUC_Tungurahua.csv   sin internet
 *   node dist/infraestructura/herramientas/importarCatastroRuc.js --vaciar               borra el catastro importado
 */
import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import { Readable } from 'stream';
import type { ReadableStream as FlujoWeb } from 'stream/web';
import { Pool } from 'pg';
import { validarTexto } from '../../dominio/validacion';
import { REGLA_PERSONA_INGRESO } from '../../dominio/detecciones';

/** Nombres de los archivos SRI_RUC_<provincia>.csv publicados por el SRI. */
export const PROVINCIAS = [
  'Azuay', 'Bolivar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi', 'El_Oro', 'Esmeraldas', 'Galapagos', 'Guayas',
  'Imbabura', 'Loja', 'Los_Rios', 'Manabi', 'Morona_Santiago', 'Napo', 'Orellana', 'Pastaza', 'Pichincha',
  'Santa_Elena', 'Santo_Domingo', 'Sucumbios', 'Tungurahua', 'Zamora_Chinchipe',
] as const;

const URL_BASE = (process.env.CATASTRO_RUC_URL || 'https://descargas.sri.gob.ec/download/datosAbiertos').replace(/\/+$/, '');
const LOTE = 2000;

export interface PersonaCatastro { cedula: string; nombre: string }
export interface ColumnasCatastro { ruc: number; razon: number; tipo: number }

/** Posiciones de las columnas usadas, desde la cabecera del archivo (separado por «|»). */
export function columnasCatastro(cabecera: string): ColumnasCatastro {
  const c = cabecera.replace(/^﻿/, '').split('|').map(x => x.trim().toUpperCase());
  const col = { ruc: c.indexOf('NUMERO_RUC'), razon: c.indexOf('RAZON_SOCIAL'), tipo: c.indexOf('TIPO_CONTRIBUYENTE') };
  if (col.ruc < 0 || col.razon < 0 || col.tipo < 0) {
    throw new Error('El archivo no es el catastro del RUC del SRI: faltan NUMERO_RUC, RAZON_SOCIAL o TIPO_CONTRIBUYENTE.');
  }
  return col;
}

/**
 * Persona natural de una línea del catastro, o null si es una sociedad, si su RUC no sale de una
 * cédula o si el nombre no pasaría la validación del titular (así el autollenado nunca falla).
 */
export function personaDeLinea(linea: string, col: ColumnasCatastro): PersonaCatastro | null {
  const c = linea.split('|');
  if (c.length <= Math.max(col.ruc, col.razon, col.tipo)) return null;
  if (c[col.tipo].trim().toUpperCase() !== 'PERSONA NATURAL') return null;
  const ruc = /^(\d{10})001$/.exec(c[col.ruc].trim());
  if (!ruc) return null;
  const nombre = validarTexto(c[col.razon].toUpperCase(), { ...REGLA_PERSONA_INGRESO, requerido: true });
  return nombre.ok && nombre.valor ? { cedula: ruc[1], nombre: nombre.valor } : null;
}

/** Provincia escrita por la persona → nombre del archivo ("santo domingo" → Santo_Domingo). */
export function provinciaDe(texto: string): (typeof PROVINCIAS)[number] | null {
  const plano = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_-]+/g, '').toLowerCase();
  return PROVINCIAS.find(p => plano(p) === plano(texto)) ?? null;
}

interface Origen { etiqueta: string; lineas: AsyncIterable<string>; fechaCorte: string }

const fechaIso = (d: Date) => (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 10);

/** Líneas de un archivo local o de la descarga del SRI, con la fecha de publicación como corte. */
async function abrir(fuente: string): Promise<Origen> {
  if (/^https?:\/\//.test(fuente)) {
    const r = await fetch(fuente, { headers: { 'User-Agent': 'SistemaANPR/1.0 (catastro RUC, datos abiertos)' } });
    if (!r.ok || !r.body) throw new Error(`El SRI respondió HTTP ${r.status} para ${fuente}`);
    const entrada = Readable.fromWeb(r.body as unknown as FlujoWeb<Uint8Array>);
    return {
      etiqueta: decodeURIComponent(fuente.split('/').pop() ?? fuente),
      lineas: readline.createInterface({ input: entrada, crlfDelay: Infinity }),
      fechaCorte: fechaIso(new Date(r.headers.get('last-modified') ?? '')),
    };
  }
  if (!fs.existsSync(fuente)) throw new Error(`No existe el archivo ${fuente}`);
  return {
    etiqueta: fuente,
    lineas: readline.createInterface({ input: fs.createReadStream(fuente), crlfDelay: Infinity }),
    fechaCorte: fechaIso(fs.statSync(fuente).mtime),
  };
}

async function guardarLote(pool: Pool, lote: Map<string, string>, fechaCorte: string): Promise<void> {
  if (!lote.size) return;
  await pool.query(`
    INSERT INTO catastroruc (cedula, nombre, fecha_corte)
    SELECT c, n, $3::date FROM unnest($1::varchar[], $2::varchar[]) AS t(c, n)
    ON CONFLICT (cedula) DO UPDATE SET nombre = EXCLUDED.nombre, fecha_corte = EXCLUDED.fecha_corte
    WHERE catastroruc.fecha_corte IS NULL OR EXCLUDED.fecha_corte >= catastroruc.fecha_corte`,
  [[...lote.keys()], [...lote.values()], fechaCorte]);
  lote.clear();
}

/** Importa un archivo: devuelve las líneas leídas y las personas guardadas. */
export async function importar(pool: Pool, fuente: string): Promise<{ lineas: number; personas: number }> {
  const inicio = Date.now();
  const origen = await abrir(fuente);
  let col: ColumnasCatastro | null = null;
  let lineas = 0;
  let personas = 0;
  const lote = new Map<string, string>(); // un RUC aparece una vez por establecimiento
  for await (const linea of origen.lineas) {
    if (!col) { col = columnasCatastro(linea); continue; }
    lineas++;
    const p = personaDeLinea(linea, col);
    if (!p) continue;
    if (!lote.has(p.cedula)) personas++;
    lote.set(p.cedula, p.nombre);
    if (lote.size >= LOTE) await guardarLote(pool, lote, origen.fechaCorte);
  }
  if (!col) throw new Error(`${origen.etiqueta} está vacío.`);
  await guardarLote(pool, lote, origen.fechaCorte);
  // Una persona con establecimientos en distintos lotes cuenta más de una vez: el total real lo da la base
  console.log(`[Catastro RUC] ${origen.etiqueta}: ${lineas} líneas, ${personas} filas de personas naturales (corte ${origen.fechaCorte}) en ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
  return { lineas, personas };
}

const USO = `Uso: node dist/infraestructura/herramientas/importarCatastroRuc.js (todas | <provincia>... | --archivo <ruta>... | --vaciar)
Provincias: ${PROVINCIAS.join(', ')}`;

async function main(argumentos: string[]): Promise<void> {
  const fuentes: string[] = [];
  let vaciar = false;
  for (let i = 0; i < argumentos.length; i++) {
    const a = argumentos[i];
    if (a === '--vaciar') vaciar = true;
    else if (a === '--archivo') { if (!argumentos[i + 1]) throw new Error(USO); fuentes.push(argumentos[++i]); }
    else if (a.toLowerCase() === 'todas') fuentes.push(...PROVINCIAS.map(p => `${URL_BASE}/SRI_RUC_${encodeURIComponent(p)}.csv`));
    else {
      const p = provinciaDe(a);
      if (!p) throw new Error(`Provincia desconocida: ${a}\n${USO}`);
      fuentes.push(`${URL_BASE}/SRI_RUC_${encodeURIComponent(p)}.csv`);
    }
  }
  if (!vaciar && !fuentes.length) throw new Error(USO);

  const docker = process.env.DOCKER_CONTAINER === 'true';
  const pool = new Pool({
    host: process.env.DB_SERVER || (docker ? 'db' : '127.0.0.1'),
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'anpr',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'ANPR_ECU911',
    max: 2,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  });
  try {
    const tabla = await pool.query("SELECT to_regclass('public.catastroruc') AS t");
    if (!tabla.rows[0]?.t) throw new Error('Falta la tabla catastroruc: arranque el backend actualizado una vez para que la cree.');
    if (vaciar) {
      await pool.query('TRUNCATE catastroruc');
      console.log('[Catastro RUC] Catastro vaciado: el autollenado usa solo los registros del sistema.');
    }
    const fallidas: string[] = [];
    for (const fuente of fuentes) {
      try { await importar(pool, fuente); } catch (e) {
        fallidas.push(fuente);
        console.error(`[Catastro RUC] No se pudo importar ${decodeURIComponent(fuente)}: ${(e as Error).message}`);
      }
    }
    const r = await pool.query(`SELECT COUNT(*)::int AS personas, MAX(fecha_corte)::text AS corte,
      pg_size_pretty(pg_total_relation_size('catastroruc')) AS tamano FROM catastroruc`);
    const { personas, corte, tamano } = r.rows[0];
    console.log(`[Catastro RUC] En la base: ${personas} personas (corte ${corte ?? '—'}, ${tamano}).`);
    if (fallidas.length) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(e => { console.error(`[Catastro RUC] ${(e as Error).message}`); process.exit(1); });
}
