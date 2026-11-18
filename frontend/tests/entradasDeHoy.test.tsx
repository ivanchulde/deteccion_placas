// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { useFechaLocal } from '../src/aplicacion/hooks';
import { TablaIngresosRecientes } from '../src/interfaz/paginas/Monitoreo';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/infraestructura/api', () => ({ default: { get }, mensajeError: String, urlMedia: String }));
vi.mock('../src/interfaz/componentes/Notificaciones', () => ({ useNotificar: () => vi.fn() }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('muestra las entradas de hoy con y sin salida y permite volver a los pendientes de todas las fechas', async () => {
  const abierto = {
    id: 1, placa: 'PBA1234', tipo_movimiento: 'ingreso', estado_validacion: 'autorizado', estado_procesamiento: 'procesado',
    fecha_hora_ingreso: '2026-11-18T14:00:00Z', fecha_hora_salida: null, registro_completo: false, vehiculo: {},
  };
  const cerrado = { ...abierto, id: 2, placa: 'PBA2345', fecha_hora_salida: '2026-11-18T15:30:00Z', registro_completo: true };
  const anterior = { ...abierto, id: 3, placa: 'PBA3456', fecha_hora_ingreso: '2026-11-17T14:00:00Z' };
  get.mockImplementation(async (_ruta, { params }) => {
    const items = params.entradas_hoy === 'si' ? [abierto, cerrado] : [abierto, anterior];
    return { data: { items, total: items.length, pagina: 1, tamano: 30 } };
  });
  render(<MemoryRouter><TablaIngresosRecientes items={[]} onValidar={vi.fn()} puedeEditarCampos={false}
    seleccionada={null} onSeleccionar={vi.fn()} registrandoSalida={null} onRegistrarSalida={vi.fn()} /></MemoryRouter>);

  expect(await screen.findByText('2 registros · Ingresos de hoy, con o sin salida')).toBeInTheDocument();
  const filtro = screen.getByRole('combobox', { name: 'Filtrar accesos' });
  expect(filtro).toHaveValue('hoy');
  const parametrosHoy = get.mock.lastCall![1].params;
  expect(parametrosHoy).toMatchObject({ entradas_hoy: 'si' });
  expect(parametrosHoy).not.toHaveProperty('completos');
  expect(screen.getByText('PBA-1234')).toBeInTheDocument();
  const filaCerrada = screen.getByText('PBA-2345').closest('tr')!;
  expect(within(filaCerrada).getByText('10:30:00')).toBeInTheDocument();
  expect(screen.queryByText('PBA-3456')).toBeNull();

  const pendientes = within(filtro).getByRole<HTMLOptionElement>('option', { name: 'Todos los pendientes' });
  fireEvent.change(filtro, { target: { value: pendientes.value } });
  expect(await screen.findByText('PBA-3456')).toBeInTheDocument();
  expect(screen.getByText('2 registros · Todas las fechas')).toBeInTheDocument();
  expect(screen.queryByText('PBA-2345')).toBeNull();
  expect(get.mock.lastCall![1].params).toMatchObject({ completos: 'no', unir_salidas: 'si' });
  expect(get.mock.lastCall![1].params).not.toHaveProperty('entradas_hoy');
});

it('actualiza la fecha al cruzar la medianoche de Ecuador con la pantalla abierta', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T04:59:59.999Z'));
  const { result } = renderHook(useFechaLocal);
  expect(result.current).toBe('2026-11-18');

  act(() => { vi.advanceTimersByTime(1); });
  expect(result.current).toBe('2026-11-19');
});
