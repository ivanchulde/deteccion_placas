import ExcelJS from 'exceljs';
import type { PuertoDocumentosReportes } from '../../aplicacion/reportes';
import { placaHoja } from '../../dominio/controlVehicular';
import { CATEGORIAS, nombrePropio, type Columna, type NivelHallazgo, type Reporte } from '../../dominio/reportes';
import { desfaseMinutos } from './tiempo';
import { leerLogo } from './documentosControl';

/**
 * Excel de un reporte del catálogo (aplicacion/reportes.ts): una hoja «Resumen» con el logo del
 * ECU 911, los parámetros, las cifras, los hallazgos y los avisos; una hoja con los datos de los gráficos y una
 * hoja por sección con sus columnas. Las
 * fechas se escriben en hora de Ecuador y las duraciones y porcentajes como números, para que se
 * puedan ordenar y sumar. Las fotos no van en el Excel: están en la vista previa imprimible.
 */

const DELGADO: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF94A3B8' } };
const BORDES: Partial<ExcelJS.Borders> = { top: DELGADO, left: DELGADO, bottom: DELGADO, right: DELGADO };
const FONDO_TITULO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };

/** Nombre de hoja válido y único (31 caracteres, sin : \ / ? * [ ]). */
function nombreHoja(titulo: string, usados: Set<string>): string {
  const base = titulo.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Hoja';
  let nombre = base;
  for (let i = 2; usados.has(nombre.toLowerCase()); i++) nombre = `${base.slice(0, 26)} ${i}`;
  usados.add(nombre.toLowerCase());
  return nombre;
}

const NIVEL: Record<NivelHallazgo, string> = { alerta: 'Alerta', atencion: 'Atención', info: 'Dato', ok: 'Correcto' };

const titulo = (c: Columna) => (c.tipo === 'duracion' ? `${c.titulo} (min)` : c.tipo === 'porcentaje' && !c.titulo.includes('%') ? `${c.titulo} (%)` : c.titulo);

/** Valor de la celda según el tipo de la columna (fechas en hora local de la institución). */
export function valorCelda(c: Columna, v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined || v === '') return null;
  switch (c.tipo) {
    case 'fecha_hora': {
      const f = new Date(v as string);
      return Number.isNaN(f.getTime()) ? String(v) : new Date(f.getTime() + desfaseMinutos(f) * 60000);
    }
    case 'fecha': {
      const texto = String(v).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T00:00:00Z`) : String(v);
    }
    case 'numero': case 'porcentaje': return Number.isFinite(Number(v)) ? Number(v) : String(v);
    case 'duracion': return Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : String(v);
    case 'placa': return placaHoja(String(v));
    default: return String(v);
  }
}

const FORMATO: Partial<Record<NonNullable<Columna['tipo']>, string>> = {
  fecha_hora: 'dd/mm/yyyy hh:mm', fecha: 'dd/mm/yyyy', porcentaje: '0.0', duracion: '0.0', numero: '#,##0.##',
};

export async function excelReporte(r: Reporte, zona: string): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Sistema ANPR ECU 911';
  libro.created = new Date();
  const usados = new Set<string>();
  const generado = new Intl.DateTimeFormat('es-EC', { timeZone: zona, dateStyle: 'short', timeStyle: 'short' }).format(new Date(r.generado));

  const resumen = libro.addWorksheet(nombreHoja('Resumen', usados), { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  resumen.columns = [{ width: 30 }, { width: 70 }];
  const logo = leerLogo();
  if (logo) {
    const id = libro.addImage({ buffer: logo as unknown as ExcelJS.Buffer, extension: 'png' });
    resumen.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 72, height: 72 } });
  }
  const linea = (fila: number, a: string, b?: string, estilo?: Partial<ExcelJS.Font>) => {
    resumen.getCell(fila, 1).value = a;
    if (b !== undefined) resumen.getCell(fila, 2).value = b;
    if (estilo) resumen.getCell(fila, b === undefined ? 1 : 2).font = estilo;
    resumen.getCell(fila, 1).alignment = { vertical: 'top', wrapText: true };
    resumen.getCell(fila, 2).alignment = { vertical: 'top', wrapText: true };
  };
  resumen.getCell(1, 2).value = 'Servicio Integrado de Seguridad ECU 911 · Control de acceso vehicular';
  resumen.getCell(1, 2).font = { size: 10, color: { argb: 'FF475569' } };
  resumen.getCell(2, 2).value = r.titulo;
  resumen.getCell(2, 2).font = { bold: true, size: 15 };
  resumen.getCell(3, 2).value = `${CATEGORIAS[r.categoria]} · ${r.descripcion}`;
  resumen.getCell(3, 2).alignment = { wrapText: true, vertical: 'top' };
  resumen.getRow(3).height = 32;
  let n = 6;
  const bloque = (nombre: string, filas: [string, string][]) => {
    if (!filas.length) return;
    linea(n++, nombre, undefined, { bold: true, size: 11 });
    for (const [k, v] of filas) {
      linea(n, k, v);
      resumen.getCell(n, 1).font = { color: { argb: 'FF475569' } };
      n++;
    }
    n++;
  };
  bloque('Datos del reporte', [...r.parametros, ['Generado', generado]]);
  bloque('Resumen', r.resumen);
  bloque('Hallazgos', r.hallazgos.map(h => [NIVEL[h.nivel], h.recomendacion ? `${h.texto} Qué hacer: ${h.recomendacion}` : h.texto] as [string, string]));
  bloque('Observaciones', r.avisos.map((a, i) => [`${i + 1}.`, a] as [string, string]));
  bloque('Hojas', r.secciones.map(s => [s.titulo, `${s.filas.length.toLocaleString('es-EC')} filas${s.total > s.filas.length ? ` de ${s.total.toLocaleString('es-EC')}` : ''}`] as [string, string]));

  if (r.graficos.length) {
    const hoja = libro.addWorksheet(nombreHoja('Gráficos', usados), { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    hoja.columns = [{ width: 46 }, { width: 14 }, { width: 40 }];
    let fila = 1;
    for (const g of r.graficos) {
      hoja.getCell(fila, 1).value = g.titulo;
      hoja.getCell(fila, 1).font = { bold: true, size: 12 };
      fila++;
      const titulos = hoja.getRow(fila++);
      titulos.values = ['', g.unidad === '%' ? 'Porcentaje' : nombrePropio(g.unidad), 'Detalle'];
      titulos.eachCell(c => { c.font = { bold: true, size: 10 }; c.fill = FONDO_TITULO; c.border = BORDES; });
      for (const b of g.barras) {
        const row = hoja.getRow(fila++);
        row.values = [b.etiqueta, b.valor, b.detalle ?? ''];
        row.eachCell(c => { c.border = BORDES; });
      }
      fila++;
    }
  }

  for (const s of r.secciones) {
    // N.º como en la vista previa (el orden es el del reporte: en el ranking, el puesto)
    const columnas: Columna[] = [{ clave: '__n', titulo: 'N.º', tipo: 'numero' }, ...s.columnas.filter(c => c.tipo !== 'imagen')];
    const hoja = libro.addWorksheet(nombreHoja(s.titulo, usados), {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:3' },
      headerFooter: { oddFooter: `&L${r.titulo}&RGenerado por el Sistema ANPR ECU 911 · ${generado} · Página &P de &N` },
      views: [{ state: 'frozen', ySplit: 3 }],
    });
    hoja.getCell(1, 1).value = `${r.titulo} · ${s.titulo}`;
    hoja.getCell(1, 1).font = { bold: true, size: 13 };
    if (s.nota) { hoja.getCell(2, 1).value = s.nota; hoja.getCell(2, 1).font = { italic: true, color: { argb: 'FF475569' } }; }
    const encabezado = hoja.getRow(3);
    encabezado.values = columnas.map(titulo);
    encabezado.height = 30;
    encabezado.eachCell(c => {
      c.font = { bold: true, size: 10 };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = FONDO_TITULO;
      c.border = BORDES;
    });
    s.filas.forEach((fila, i) => {
      const row = hoja.getRow(4 + i);
      row.values = columnas.map(c => (c.clave === '__n' ? i + 1 : valorCelda(c, fila[c.clave])));
      columnas.forEach((c, j) => {
        const celda = row.getCell(j + 1);
        celda.border = BORDES;
        celda.alignment = { vertical: 'top', wrapText: c.tipo === undefined || c.tipo === 'texto' };
        if (c.tipo && FORMATO[c.tipo]) celda.numFmt = FORMATO[c.tipo]!;
      });
    });
    if (!s.filas.length) {
      hoja.getCell(4, 1).value = 'Sin registros para los parámetros seleccionados.';
      hoja.getCell(4, 1).font = { italic: true, color: { argb: 'FF475569' } };
    }
    hoja.columns.forEach((columna, j) => {
      const c = columnas[j];
      if (!c) return;
      const largo = Math.max(titulo(c).length, ...s.filas.slice(0, 200).map(f => String(valorCelda(c, f[c.clave]) ?? '').length));
      columna.width = c.tipo === 'fecha_hora' ? 17 : c.tipo === 'fecha' ? 12 : Math.min(48, Math.max(10, largo + 2));
    });
    if (s.filas.length) hoja.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + s.filas.length, column: columnas.length } };
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

export const documentosReportes: PuertoDocumentosReportes = { excel: excelReporte };
