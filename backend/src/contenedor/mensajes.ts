import { casosMensajes } from '../aplicacion/mensajes';
import { auditoriaSql } from '../infraestructura/adaptadores';
import { repositorioMensajesSql } from '../infraestructura/persistencia/mensajesSql';
import { emitirAUsuarios } from '../infraestructura/servicios/socket';

/** Raíz de composición de la mensajería interna (ver aplicacion/mensajes.ts). */
export const mensajes = casosMensajes({
  repositorio: repositorioMensajesSql,
  eventos: { aUsuarios: (usuarios, canal, datos) => emitirAUsuarios(usuarios, canal, datos) },
  auditoria: auditoriaSql,
});
