import React, { useState } from 'react';
import api, { mensajeError } from '../../infraestructura/api';
import type { RegistroLista } from '../../dominio/tipos';
import { formatearPlaca, validarTexto } from '../../dominio/validacion';
import { REGLAS_LISTA_BLANCA } from '../../dominio/reglas';
import { AvisoFlotante } from './AvisoFlotante';
import { CampoTexto } from './campos';
import { RUTA_API, type TipoLista } from './FormularioLista';
import { Modal } from './ui';

/** Edición de la ficha laboral de un registro, sin alterar su permiso ni su restricción. */
export const EditarFichaLista: React.FC<{
  tipo: TipoLista; registro: RegistroLista; onCerrar: () => void; onGuardada: (r: RegistroLista) => void;
}> = ({ tipo, registro, onCerrar, onGuardada }) => {
  const [institucion, setInstitucion] = useState(registro.institucion ?? '');
  const [cargo, setCargo] = useState(registro.cargo ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valido = validarTexto(institucion, REGLAS_LISTA_BLANCA.institucion).ok
    && validarTexto(cargo, REGLAS_LISTA_BLANCA.cargo).ok;
  const cambiado = institucion.trim() !== (registro.institucion ?? '') || cargo.trim() !== (registro.cargo ?? '');
  const guardar = async () => {
    setEnviando(true); setError(null);
    try {
      const { data } = await api.patch<{ item: RegistroLista }>(`${RUTA_API[tipo]}/${registro.id}/ficha`, {
        institucion: institucion.trim(), cargo: cargo.trim(),
      });
      onGuardada(data.item);
    } catch (e) { setError(mensajeError(e)); setEnviando(false); }
  };
  return <Modal titulo="Editar institución y cargo" subtitulo={`${tipo === 'autorizados' ? 'Lista blanca' : 'Lista negra'} · ${registro.placa ? formatearPlaca(registro.placa) : registro.propietario ?? 'Sin placa'}`}
    onCerrar={onCerrar} bloquear={enviando} pie={<>
      <button type="button" className="btn btn-secondary" onClick={onCerrar} disabled={enviando}>Cancelar</button>
      <button type="button" className="btn btn-navy" onClick={() => void guardar()} disabled={!valido || !cambiado || enviando}>{enviando ? 'Guardando…' : 'Guardar cambios'}</button>
    </>}>
    <div className="form-grid">
      <CampoTexto id="ficha-institucion" etiqueta="Institución" valor={institucion} onCambiar={setInstitucion}
        regla={REGLAS_LISTA_BLANCA.institucion} placeholder="Ej.: ECU 911" autoFocus deshabilitado={enviando} />
      <CampoTexto id="ficha-cargo" etiqueta="Cargo" valor={cargo} onCambiar={setCargo}
        regla={REGLAS_LISTA_BLANCA.cargo} placeholder="Ej.: Agente de seguridad" deshabilitado={enviando} />
    </div>
    {error && <AvisoFlotante tipo="error">{error}</AvisoFlotante>}
  </Modal>;
};
