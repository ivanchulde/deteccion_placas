// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Inicio from '../src/interfaz/paginas/Inicio';
import { RegistroManualModal } from '../src/interfaz/componentes/deteccion';

const { get, post, sesion } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), sesion: { user: { nombre: 'Guardia de prueba', rol: 'Guardia' }, puede: () => true },
}));
vi.mock('../src/infraestructura/api', () => ({ default: { get, post }, mensajeError: String, urlMedia: String }));
vi.mock('../src/aplicacion/AuthContext', () => ({ useAuth: () => sesion }));
vi.mock('../src/aplicacion/tiempoReal', () => ({ useEvento: () => undefined, useReconexion: () => undefined }));
vi.mock('../src/interfaz/componentes/Notificaciones', () => ({ useNotificar: () => vi.fn() }));

beforeEach(() => {
  sesion.user.rol = 'Guardia';
  get.mockReset().mockImplementation(async (ruta: string) => {
    if (ruta === '/camaras') return { data: [] };
    return { data: {} };
  });
  post.mockReset().mockResolvedValue({ data: { movimiento: 'entrada', deteccion: { placa: 'AB123C', estado_validacion: 'autorizado' } } });
});
afterEach(cleanup);

it('el tablero rechaza cédulas y registra la placa normalizada con Enter', async () => {
  render(<MemoryRouter><Inicio /></MemoryRouter>);
  const placa = screen.getByLabelText('Placa del vehículo');
  fireEvent.change(placa, { target: { value: '0102030405' } });
  fireEvent.keyDown(placa, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled();
  expect(post).not.toHaveBeenCalled();
  fireEvent.change(placa, { target: { value: 'ab-123c' } });
  fireEvent.blur(placa);
  fireEvent.keyDown(placa, { key: 'Enter' });
  await waitFor(() => expect(post).toHaveBeenCalledWith('/detecciones/movimiento-placa', { placa: 'AB123C' }));
  await waitFor(() => expect(placa).toHaveValue(''));
  expect(placa).not.toHaveAttribute('aria-invalid', 'true');
  expect(screen.queryByText(/registra entrada o salida|el sistema identifica si corresponde/i)).toBeNull();
});

it('el guardia registra un ingreso nuevo con solo la placa', async () => {
  render(<MemoryRouter><RegistroManualModal onCerrar={vi.fn()} /></MemoryRouter>);
  const placa = screen.getByLabelText('Placa del vehículo');
  const registrar = screen.getByRole('button', { name: 'Registrar ingreso' });
  expect(placa).toHaveFocus();
  expect(registrar).toBeDisabled();
  expect(screen.queryByLabelText(/cédula/i)).toBeNull();
  fireEvent.change(placa, { target: { value: '0102030405' } });
  expect(registrar).toBeDisabled();
  fireEvent.change(placa, { target: { value: 'pba-1234' } });
  await waitFor(() => expect(get).toHaveBeenCalledWith('/detecciones/buscar-placa/PBA1234'));
  fireEvent.click(registrar);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/detecciones/registro-manual', { placa: 'PBA1234', motivo: 'Ingreso manual por placa' }));
  expect(get.mock.calls.some(([ruta]) => String(ruta).includes('cedula'))).toBe(false);
});

it('el administrador conserva la ficha para documentar ingresos sin matrícula legible', () => {
  sesion.user.rol = 'Admin';
  render(<MemoryRouter><RegistroManualModal onCerrar={vi.fn()} /></MemoryRouter>);
  expect(screen.getByLabelText('Placa (opcional)')).toBeInTheDocument();
  expect(screen.getByLabelText('Cédula')).toBeInTheDocument();
  expect(screen.getByLabelText('Motivo del registro manual*')).toBeInTheDocument();
});
