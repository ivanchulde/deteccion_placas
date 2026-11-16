import type { GraficoReporte } from './tipos';

/**
 * Lectura de un gráfico de barras de los reportes, al estilo del análisis de Excel: la escala con
 * números redondos (0, 10, 20… con un paso de holgura) y la conclusión del título, con las barras
 * que sobresalen resaltadas («Marca: Chevrolet registra notablemente más ingresos que el resto»).
 * Las barras «Sin dato», «Sin clasificar» y «Otros (n)» nunca se resaltan.
 */

export interface Escala { tope: number; marcas: number[] }

/** Tope y marcas del eje: unas 7 marcas de 1, 2, 5 o 10 × 10ⁿ; en porcentajes con tope fijo, de 20 en 20. */
export function escalaEje(maximo: number, fijo?: number): Escala {
  if (fijo && fijo > 0) {
    const paso = fijo / 5;
    return { tope: fijo, marcas: Array.from({ length: 6 }, (_, i) => Math.round(i * paso * 100) / 100) };
  }
  if (!(maximo > 0)) return { tope: 1, marcas: [0, 1] };
  const bruto = maximo / 7;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / potencia;
  const paso = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * potencia);
  const tope = (Math.floor(maximo / paso) + 1) * paso;
  return { tope, marcas: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) };
}

const NO_DESTACAR = /^(sin dato|sin clasificar|otros \(\d+\))$/i;

export interface Conclusion {
  /** Barras resaltadas (índices de `barras`) */
  destacadas: number[];
  /** Nombres de las barras resaltadas, para el título */
  nombres: string[];
  /** Resto del título después de los nombres; null = sin conclusión (se usa el título del gráfico) */
  texto: string | null;
}

/**
 * Qué barras resaltar y qué dice el título. Con `destacar: 'mayor'` (por omisión) sobresalen las
 * barras de al menos el 75 % de la mayor, si son hasta 3 y la siguiente queda en dos tercios de
 * ellas o menos y a 3 o más de distancia («notablemente más»); si no, se resalta la mayor si es
 * única o empata con hasta 2.
 * Con `'menor'` se resalta la más baja (disponibilidad o lectura de una cámara).
 */
export function conclusionGrafico(g: GraficoReporte, valor: (v: number) => string): Conclusion {
  const ninguna: Conclusion = { destacadas: [], nombres: [], texto: null };
  const candidatas = g.barras.map((b, i) => ({ ...b, i })).filter(b => !NO_DESTACAR.test(b.etiqueta.trim()) && b.valor > 0);
  if (!candidatas.length) return ninguna;
  if (candidatas.length === 1) return { destacadas: [candidatas[0].i], nombres: [], texto: null };
  const porcentaje = g.unidad === '%';
  const verbo = (n: number) => (n === 1 ? 'registra' : 'registran');
  const tiene = (n: number) => (n === 1 ? 'tiene' : 'tienen');

  if (g.destacar === 'menor') {
    const minimo = Math.min(...candidatas.map(b => b.valor));
    const maximo = Math.max(...candidatas.map(b => b.valor));
    const menores = candidatas.filter(b => b.valor === minimo);
    if (minimo === maximo || menores.length > 2) return ninguna;
    return { destacadas: menores.map(b => b.i), nombres: menores.map(b => b.etiqueta), texto: `${tiene(menores.length)} el valor más bajo (${valor(minimo)})` };
  }

  const orden = [...candidatas].sort((a, b) => b.valor - a.valor);
  const maximo = orden[0].valor;
  const grupo = orden.filter(b => b.valor >= maximo * 0.75);
  const siguiente = orden[grupo.length]?.valor ?? 0;
  const menorDelGrupo = grupo[grupo.length - 1].valor;
  // «Notablemente»: la siguiente queda en dos tercios o menos y con al menos 3 de diferencia (2 contra 1 no lo es)
  if (grupo.length <= 3 && grupo.length < orden.length && siguiente <= menorDelGrupo * (2 / 3) && (porcentaje || menorDelGrupo - siguiente >= 3)) {
    return { destacadas: grupo.map(b => b.i), nombres: grupo.map(b => b.etiqueta),
      texto: porcentaje ? `${tiene(grupo.length)} un valor notablemente más alto que el resto` : `${verbo(grupo.length)} notablemente más ${g.unidad} que el resto` };
  }
  const empatadas = orden.filter(b => b.valor === maximo);
  if (empatadas.length === orden.length || empatadas.length > 2) return ninguna;
  return { destacadas: empatadas.map(b => b.i), nombres: empatadas.map(b => b.etiqueta),
    texto: porcentaje ? `${tiene(empatadas.length)} el valor más alto (${valor(maximo)})` : `${verbo(empatadas.length)} más ${g.unidad} (${valor(maximo)}${empatadas.length > 1 ? ' cada una' : ''})` };
}

/** Nombre del eje horizontal: «Número de ingresos», «Porcentaje (%)». */
export const tituloMedida = (g: GraficoReporte) => (g.unidad === '%' ? 'Porcentaje (%)' : `Número de ${g.unidad}`);
