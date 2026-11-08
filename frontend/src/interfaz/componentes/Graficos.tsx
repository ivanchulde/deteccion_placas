import React, { useLayoutEffect, useRef, useState } from 'react';
import { numero } from '../../dominio/formato';

/**
 * Gráficos SVG livianos (sin librerías). Reglas: una sola escala por gráfico, series en
 * orden fijo con leyenda siempre visible, separación de 2 px entre segmentos, extremos de
 * dato redondeados y tooltip al pasar el cursor.
 */

export interface Serie { clave: string; etiqueta: string; color: string }

function useAncho<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(e => setAncho(Math.floor(e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho];
}

/** Máximo "redondo" para el eje (1, 2, 5 × 10ⁿ) y sus marcas. */
function escala(max: number, marcas = 4): number[] {
  if (max <= 0) return [0, 1];
  const paso0 = max / marcas;
  const mag = Math.pow(10, Math.floor(Math.log10(paso0)));
  const paso = [1, 2, 5, 10].map(m => m * mag).find(p => p >= paso0) ?? 10 * mag;
  const pasoFinal = Math.max(1, paso);
  const n = Math.ceil(max / pasoFinal);
  return Array.from({ length: n + 1 }, (_, i) => i * pasoFinal);
}

export const Leyenda: React.FC<{ series: readonly Serie[] }> = ({ series }) => (
  <div className="leyenda">
    {series.map(s => <span key={s.clave}><i style={{ background: s.color }} />{s.etiqueta}</span>)}
  </div>
);

interface Tip { x: number; y: number; titulo: string; filas: { etiqueta: string; color: string; valor: number }[]; total: number }

const Tooltip: React.FC<{ tip: Tip | null }> = ({ tip }) => {
  if (!tip) return null;
  const izquierda = Math.min(tip.x + 14, window.innerWidth - 200);
  return (
    <div className="tooltip-grafico" style={{ left: izquierda, top: tip.y + 14 }}>
      <strong>{tip.titulo}</strong>
      {tip.filas.map(f => (
        <div className="fila-tt" key={f.etiqueta}><span><i style={{ background: f.color }} /> {f.etiqueta}</span><b>{numero(f.valor)}</b></div>
      ))}
      {tip.filas.length > 1 && (
        <div className="fila-tt" style={{ borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 4, paddingTop: 4 }}><span>Total</span><b>{numero(tip.total)}</b></div>
      )}
    </div>
  );
};

/** Trayectoria de un rectángulo con las esquinas superiores redondeadas. */
function rectSuperiorRedondeado(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Conteo de una serie en una fila (0 si falta). */
const conteo = (fila: object, clave: string) => Number((fila as Record<string, unknown>)[clave] || 0);

export function BarrasApiladas<T extends object>({ datos, series, etiquetaX, tituloTip, alto = 220, cadaEtiqueta = 1, resaltar, ejes, mostrarTotales }: {
  datos: T[];
  series: readonly Serie[];
  etiquetaX: (d: T, i: number) => string;
  tituloTip?: (d: T, i: number) => string;
  alto?: number;
  cadaEtiqueta?: number;
  resaltar?: number;
  ejes?: { x: string; y: string };
  mostrarTotales?: boolean;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const totales = datos.map(d => series.reduce((s, x) => s + conteo(d, x.clave), 0));
  const marcas = escala(Math.max(...totales, 0));
  const maxEje = marcas[marcas.length - 1] || 1;
  const margen = {
    izq: Math.max(34, numero(maxEje).length * 7 + 8), der: 6,
    sup: ejes ? 32 : mostrarTotales ? 20 : 8, inf: ejes ? 42 : 24,
  };
  const w = Math.max(0, ancho - margen.izq - margen.der);
  const h = alto - margen.sup - margen.inf;
  const banda = datos.length ? w / datos.length : 0;
  const anchoBarra = Math.max(2, Math.min(36, banda * 0.66));
  const y = (v: number) => margen.sup + h - (v / maxEje) * h;

  return (
    <div ref={ref} style={{ width: '100%' }} onMouseLeave={() => { setTip(null); setHover(null); }}>
      {ancho > 0 && (
        // viewBox: al imprimir el gráfico se ajusta al ancho de la hoja
        <svg className="grafico" width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img"
          aria-label={ejes ? `Gráfico de barras con ${ejes.x.toLowerCase()} en el eje X y ${ejes.y.toLowerCase()} en el eje Y`
            : series.length > 1 ? 'Gráfico de barras por estado' : `Gráfico de barras: ${series[0]?.etiqueta ?? ''}`}>
          {mostrarTotales && <desc>{datos.map((d, i) => `${(tituloTip ?? etiquetaX)(d, i)}, ${numero(totales[i])}`).join('. ')}</desc>}
          {ejes && <text x={margen.izq} y={12} fontWeight={600}>{ejes.y}</text>}
          {marcas.map(m => (
            <g key={m}>
              <line className="rejilla" x1={margen.izq} x2={ancho - margen.der} y1={y(m)} y2={y(m)} />
              <text x={margen.izq - 6} y={y(m) + 4} textAnchor="end">{numero(m)}</text>
            </g>
          ))}
          {datos.map((d, i) => {
            const centro = margen.izq + (i + 0.5) * banda;
            const x0 = centro - anchoBarra / 2;
            const total = numero(totales[i]);
            let acumulado = 0;
            const visibles = series.filter(s => conteo(d, s.clave) > 0);
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                {resaltar === i && <rect x={margen.izq + i * banda} y={margen.sup} width={banda} height={h} fill="#f1f5f9" />}
                {visibles.map((s, j) => {
                  const v = conteo(d, s.clave);
                  const yTop = y(acumulado + v);
                  const alturaSeg = y(acumulado) - yTop;
                  acumulado += v;
                  const esUltimo = j === visibles.length - 1;
                  // 2 px de separación entre segmentos apilados
                  const alt = Math.max(0, alturaSeg - (esUltimo ? 0 : 2));
                  return esUltimo
                    ? <path key={s.clave} d={rectSuperiorRedondeado(x0, yTop, anchoBarra, alt, 4)} fill={s.color} />
                    : <rect key={s.clave} x={x0} y={yTop + 2} width={anchoBarra} height={alt} fill={s.color} />;
                })}
                {mostrarTotales && banda >= total.length * 7 + 4 && (
                  <text x={centro} y={y(totales[i]) - 6} textAnchor="middle" fontWeight={600}>{total}</text>
                )}
                {/* Zona de interacción más grande que la barra */}
                <rect x={margen.izq + i * banda} y={margen.sup} width={banda} height={h} fill="transparent"
                  onMouseMove={e => {
                    setHover(i);
                    setTip({
                      x: e.clientX, y: e.clientY, titulo: (tituloTip ?? etiquetaX)(d, i), total: totales[i],
                      filas: series.map(s => ({ etiqueta: s.etiqueta, color: s.color, valor: conteo(d, s.clave) })),
                    });
                  }} />
                {i % cadaEtiqueta === 0 && (
                  <text x={centro} y={y(0) + 18} textAnchor="middle">{etiquetaX(d, i)}</text>
                )}
              </g>
            );
          })}
          <line className="eje" x1={margen.izq} x2={ancho - margen.der} y1={y(0)} y2={y(0)} />
          {ejes && <>
            <line className="eje" x1={margen.izq} x2={margen.izq} y1={y(maxEje)} y2={y(0)} />
            <text x={margen.izq + w / 2} y={alto - 6} textAnchor="middle" fontWeight={600}>{ejes.x}</text>
          </>}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/**
 * Dona de una distribución (como el panel de vigilance-heart): porcentaje junto a cada segmento,
 * total al centro y leyenda a la derecha. Separación de 2 px entre segmentos.
 */
export const Dona: React.FC<{ valores: object; series: readonly Serie[]; tamano?: number; unidad?: string }> =
  ({ valores, series, tamano = 220, unidad = 'ingresos' }) => {
    const total = series.reduce((s, x) => s + conteo(valores, x.clave), 0);
    const margen = 34;   // espacio para los porcentajes alrededor
    const lado = tamano + margen * 2;
    const c = lado / 2;
    const radio = tamano * 0.38;
    const grosor = tamano * 0.16;
    const circ = 2 * Math.PI * radio;
    let acumulado = 0;
    const segmentos = series.map(s => {
      const v = conteo(valores, s.clave);
      const frac = total ? v / total : 0;
      const inicio = acumulado;
      acumulado += frac;
      return { s, v, frac, inicio };
    }).filter(x => x.v > 0);
    const separacion = segmentos.length > 1 ? 2 : 0;
    return (
      <div className="dona">
        <svg width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`} role="img"
          aria-label={`Distribución: ${segmentos.map(x => `${x.s.etiqueta} ${Math.round(x.frac * 100)} %`).join(', ') || 'sin datos'}`}>
          <circle cx={c} cy={c} r={radio} fill="none" stroke="var(--surface-3)" strokeWidth={grosor} />
          {segmentos.map(({ s, v, frac, inicio }) => {
            const largo = Math.max(0, frac * circ - separacion);
            return (
              <circle key={s.clave} cx={c} cy={c} r={radio} fill="none" stroke={s.color} strokeWidth={grosor}
                strokeDasharray={`${largo} ${circ - largo}`} strokeDashoffset={-inicio * circ} transform={`rotate(-90 ${c} ${c})`}>
                <title>{`${s.etiqueta}: ${numero(v)}`}</title>
              </circle>
            );
          })}
          {segmentos.map(({ s, frac, inicio }) => {
            if (frac < 0.03) return null;
            const angulo = (inicio + frac / 2) * 2 * Math.PI - Math.PI / 2;
            const d = radio + grosor / 2 + 17;
            return (
              <text key={s.clave} x={c + d * Math.cos(angulo)} y={c + d * Math.sin(angulo)} textAnchor="middle" dominantBaseline="middle"
                fill={s.color} fontSize={14} fontWeight={600}>{Math.round(frac * 100)}%</text>
            );
          })}
          <text x={c} y={c - 4} textAnchor="middle" fontSize={26} fontWeight={600} fill="var(--text)">{numero(total)}</text>
          <text x={c} y={c + 17} textAnchor="middle" fontSize={10.5} fill="var(--text-3)" letterSpacing="1.5">{unidad.toUpperCase()}</text>
        </svg>
        <div className="dona-leyenda">
          {series.map(s => (
            <span key={s.clave} style={{ color: s.color }}><i style={{ background: s.color }} />{s.etiqueta} <b>{numero(conteo(valores, s.clave))}</b></span>
          ))}
        </div>
      </div>
    );
  };
