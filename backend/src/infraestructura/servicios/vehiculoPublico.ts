import type { ProveedorVehiculoPublico } from '../../aplicacion/vehiculoPublico';
import { leerVehiculoPublico, placaSri } from '../../dominio/vehiculoPublico';

/**
 * Adaptador HTTP de los datos públicos de matriculación del SRI, a través del servicio gratuito
 * de ecuadorlegalonline.com (responde JSON con marca, modelo, año, clase y color; nunca el
 * propietario). Se configura en .env:
 *
 *   VEHICULO_PUBLICO_HABILITADO=true|false   (true por omisión; false = no sale ninguna placa del sistema)
 *   VEHICULO_PUBLICO_URL=…{placa}…           (otra URL con el mismo formato de respuesta)
 *   VEHICULO_PUBLICO_TIMEOUT_MS=8000
 *
 * Sin internet la consulta falla en el tiempo límite y el formulario se llena a mano.
 */

export const URL_VEHICULO_PUBLICO = 'https://www.ecuadorlegalonline.com/modulo/sri/matriculacion/consultar-vehiculo-rubros.php?placa={placa}';
const TAMANO_MAXIMO = 200_000;

export function crearProveedorVehiculoPublico(env: NodeJS.ProcessEnv = process.env, pedir: typeof fetch = fetch): ProveedorVehiculoPublico {
  const plantilla = env.VEHICULO_PUBLICO_URL?.trim() || URL_VEHICULO_PUBLICO;
  let sitio = 'servicio externo';
  try { sitio = new URL(plantilla.replace('{placa}', 'X')).hostname.replace(/^www\./, ''); } catch { /* URL inválida: queda deshabilitado */ }
  const valida = /^https:\/\//i.test(plantilla) && plantilla.includes('{placa}') && sitio !== 'servicio externo';
  const habilitado = valida && (env.VEHICULO_PUBLICO_HABILITADO ?? 'true').trim().toLowerCase() !== 'false';
  const tiempo = Math.min(30_000, Math.max(1_000, Number(env.VEHICULO_PUBLICO_TIMEOUT_MS) || 8_000));
  const nombre = `SRI (${sitio})`;

  return {
    nombre,
    habilitado,
    async consultar(placa: string) {
      const r = await pedir(plantilla.replace('{placa}', encodeURIComponent(placaSri(placa))), {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; SistemaANPR/1.0)' },
        redirect: 'error', signal: AbortSignal.timeout(tiempo),
      });
      if (!r.ok) throw new Error(`${nombre} respondió HTTP ${r.status}`);
      const texto = await r.text();
      if (texto.length > TAMANO_MAXIMO) throw new Error(`${nombre}: respuesta demasiado grande`);
      let json: unknown;
      try { json = JSON.parse(texto); } catch { throw new Error(`${nombre}: la respuesta no es JSON`); }
      return leerVehiculoPublico(json, placa, nombre);
    },
  };
}
