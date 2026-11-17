import { vehiculoSriVigente } from './vehiculoPublico';

/** Campos de la hoja de registros; la matrícula ilegible puede ser null, igual que modelo o color. */
export const DATOS_AUSENTES_REGISTRO = ['', '-', '—', 'desconocido', 'sin clasificar', 'sin identificar', 'unknown', 'n/a', 'sin placa'] as const;
export function datoRegistro(...valores: unknown[]): string | null {
  for (const valor of valores) {
    if (typeof valor !== 'string') continue;
    const texto = valor.trim();
    if (!(DATOS_AUSENTES_REGISTRO as readonly string[]).includes(texto.toLowerCase())) return texto;
  }
  return null;
}
/**
 * Datos de la fila. Lo escrito por el personal manda; después, el permiso de la lista blanca y, al
 * final, los datos públicos del SRI de esa placa. En el tipo, el del SRI (clase de la matrícula)
 * reemplaza la clasificación de la cámara salvo que una persona o el permiso lo hayan fijado
 * (tipo_vehiculo); la observación de la cámara sigue en vehiculo_tipo para el segundo factor.
 */
export function datosRegistro(d: Record<string, any>) {
  const sri = vehiculoSriVigente(d);
  const tipoFijado = datoRegistro(d.tipo_vehiculo);
  return {
    nombre: datoRegistro(d.persona_ingreso, d.propietario),
    placa: datoRegistro(d.placa_validada, d.placa_reconocida),
    tipo: tipoFijado
      ? datoRegistro(d.vehiculo_tipo, d.tipo_vehiculo, d.autorizado_tipo)
      : datoRegistro(sri?.tipo, d.vehiculo_tipo, d.autorizado_tipo),
    marca: datoRegistro(d.vehiculo_marca, d.autorizado_marca, sri?.marca),
    modelo: datoRegistro(d.vehiculo_modelo, d.autorizado_modelo, sri?.modelo),
    // El motivo del paso o, si está vacío, el del permiso de la lista blanca
    motivo: datoRegistro(d.motivo_ingreso, d.autorizado_motivo),
  };
}
/**
 * Fila del reporte de Registro de Salidas: los datos del registro más la cédula y el modelo, que
 * son opcionales. Una cédula vaciada a propósito en el paso ('') no se repone desde el permiso.
 */
export function datosReporteSalida(d: Record<string, any>) {
  return {
    ...datosRegistro(d),
    cedula: d.cedula_ingreso === '' ? null : datoRegistro(d.cedula_ingreso, d.autorizado_cedula),
  };
}
export function faltantesIngreso(d: Record<string, any>): string[] {
  const campos = datosRegistro(d);
  const etiquetas = { nombre: 'Nombre', tipo: 'Tipo de vehículo', marca: 'Marca', motivo: 'Motivo' };
  const faltantes = (Object.keys(etiquetas) as (keyof typeof etiquetas)[]).filter(k => !campos[k]).map(k => etiquetas[k]);
  const ingreso = d.fecha_hora_ingreso ? new Date(d.fecha_hora_ingreso).getTime() : NaN;
  if (!Number.isFinite(ingreso)) faltantes.push('Fecha de ingreso');
  return faltantes;
}
export function faltantesRegistro(d: Record<string, any>): string[] {
  const faltantes = faltantesIngreso(d);
  const ingreso = d.fecha_hora_ingreso ? new Date(d.fecha_hora_ingreso).getTime() : NaN;
  const salida = d.fecha_hora_salida ? new Date(d.fecha_hora_salida).getTime() : NaN;
  if (!Number.isFinite(salida)) faltantes.push('Salida');
  else if (salida < ingreso) faltantes.push('Salida posterior al ingreso');
  return faltantes;
}
