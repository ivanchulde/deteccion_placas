import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import type { Deteccion } from '../../dominio/tipos';
import { ImagenEvidencia, recortePlaca } from './deteccion';
import { VisorZoom } from './ZoomDual';
export const FotoVehiculoPermiso: React.FC<{ deteccion?: Deteccion; incluirPlaca?: boolean }> = ({ deteccion, incluirPlaca = false }) => {
  const [zoom, setZoom] = useState(false);
  const recorte = deteccion ? recortePlaca(deteccion) : null;
  const imagenVehiculo = deteccion?.imagen_vehiculo ?? null;
  const vehiculo = <section aria-label="Foto del vehículo">
    <div className="evidencia-permiso-cabecera"><span className="etiqueta-campo">Foto del vehículo</span>
      <button type="button" className="btn btn-ghost btn-sm btn-icono" disabled={!imagenVehiculo} onClick={() => setZoom(true)} aria-label="Ampliar foto del vehículo" title="Ampliar foto del vehículo"><Maximize2 size={14} /></button>
    </div>
    <ImagenEvidencia ruta={imagenVehiculo} alt="Vehículo del permiso" alto={incluirPlaca ? 'clamp(104px, 14vh, 128px)' : 'clamp(140px, 20vh, 180px)'} ajuste="contain" fondoOscuro onClick={() => setZoom(true)} />
    {!imagenVehiculo && <p className="texto-secundario">Sin fotografía disponible.</p>}
  </section>;
  return <div className="completo evidencia-permiso">
    {incluirPlaca ? <div className="grid-2" style={{ gap: 12 }}>
      {vehiculo}
      <section aria-label="Foto recortada de la placa">
        <div className="evidencia-permiso-cabecera"><span className="etiqueta-campo">Placa recortada</span>
          <button type="button" className="btn btn-ghost btn-sm btn-icono" disabled={!recorte} onClick={() => setZoom(true)} aria-label="Ampliar foto de la placa" title="Ampliar foto de la placa"><Maximize2 size={14} /></button>
        </div>
        <ImagenEvidencia ruta={recorte} alt="Placa recortada del ingreso" alto="clamp(104px, 14vh, 128px)" ajuste="contain" fondoOscuro onClick={() => setZoom(true)} />
        {!recorte && <p className="texto-secundario">Sin fotografía disponible.</p>}
      </section>
    </div> : vehiculo}
    {zoom && deteccion && <VisorZoom d={deteccion} onCerrar={() => setZoom(false)} />}
  </div>;
};
