/**
 * Mensajería interna del personal: la guardianía (guardias de turno) y servicios institucionales
 * (gestores de permisos) se escriben dentro del sistema, sin salir a un correo externo; el
 * administrador también participa. Cada mensaje va de una persona a otra.
 *
 * Funciones puras (pruebas en src/tests/dominio/mensajes.test.ts).
 */
import type { Rol } from './permisos';

export const LARGO_MAXIMO_MENSAJE = 2000;

/** Grupo en que aparece cada contacto en el panel de mensajes. */
export const GRUPO_CONTACTO: Record<Rol, { clave: 'guardiania' | 'servicios' | 'administracion'; etiqueta: string; orden: number }> = {
  Guardia: { clave: 'guardiania', etiqueta: 'Guardianía', orden: 1 },
  GestorPermisos: { clave: 'servicios', etiqueta: 'Servicios institucionales', orden: 2 },
  Admin: { clave: 'administracion', etiqueta: 'Administración', orden: 3 },
};

/**
 * Texto de un mensaje: conserva los saltos de línea (a diferencia de los campos de formulario),
 * quita caracteres de control y deja como máximo una línea en blanco seguida.
 */
export function leerTextoMensaje(valor: unknown): { ok: true; valor: string } | { ok: false; error: string } {
  if (typeof valor !== 'string') return { ok: false, error: 'Escriba el mensaje.' };
  const texto = valor
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .split('\n').map(l => l.replace(/\s+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!texto) return { ok: false, error: 'Escriba el mensaje.' };
  if (texto.length > LARGO_MAXIMO_MENSAJE) return { ok: false, error: `El mensaje admite como máximo ${LARGO_MAXIMO_MENSAJE} caracteres.` };
  return { ok: true, valor: texto };
}
