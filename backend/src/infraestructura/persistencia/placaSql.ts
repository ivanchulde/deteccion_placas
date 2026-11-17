/**
 * Placa de una columna SQL en la forma vigente de la ANT, igual que placaAnt (dominio/validacion.ts):
 * sin separadores, en mayúsculas y con el 0 delante en las placas de automóvil de 3 dígitos
 * (PZX-970 → PZX0970). Compárese siempre con un parámetro que ya pasó por placaAnt.
 *
 * En PostgreSQL las referencias de regexp_replace son de un dígito: '\10\2' = grupo 1, «0», grupo 2.
 */
export const placaAntSql = (expr: string): string =>
  `REGEXP_REPLACE(UPPER(REGEXP_REPLACE(COALESCE(${expr}, ''), '[^A-Za-z0-9]', '', 'g')), '^([A-Z]{3})([0-9]{3})$', '\\10\\2')`;
