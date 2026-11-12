"""Confirmación del contexto de una placa con detecciones vehiculares del mismo cuadro."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence


Caja = tuple[float, float, float, float]
Vehiculo = tuple[str, float, Caja]

# Dos puntos porcentuales del área del vehículo permiten iniciar un paso aunque se mueva despacio.
FRACCION_MOVIMIENTO_VEHICULO = 0.02
# Si la región de interés es estrecha, se puede comprobar el movimiento directamente en la placa.
FRACCION_MOVIMIENTO_PLACA = 0.15


@dataclass(frozen=True)
class MarcoVehicular:
    hora: float
    forma: tuple[int, int]
    vehiculos: tuple[Vehiculo, ...]
    pistas: frozenset[int]
    movimiento: Optional[tuple[Caja, int]] = None


def vehiculo_de_placa(vehiculos: Sequence[Vehiculo], placa: Sequence[float]) -> Optional[int]:
    """Índice del vehículo más pequeño que cubre el centro y la mayor parte de la placa."""
    x1, y1, x2, y2 = placa
    centro_x, centro_y = (x1 + x2) / 2, (y1 + y2) / 2
    area_placa = (x2 - x1) * (y2 - y1)
    if x2 <= x1 or y2 <= y1:
        return None
    mejor = None
    menor_area = float("inf")
    for i, (_, _, (a, b, c, d)) in enumerate(vehiculos):
        if not (a <= centro_x <= c and b <= centro_y <= d):
            continue
        interseccion = max(0.0, min(x2, c) - max(x1, a)) * max(0.0, min(y2, d) - max(y1, b))
        area = (c - a) * (d - b)
        if interseccion >= 0.8 * area_placa and area < menor_area:
            mejor, menor_area = i, area
    return mejor


def zona_en_vehiculos(zona: Sequence[float], cajas: Sequence[Caja]) -> Optional[Caja]:
    """Delimita la visualización del movimiento a los vehículos que lo respaldan."""
    x1, y1, x2, y2 = zona
    recortes = [(max(x1, a), max(y1, b), min(x2, c), min(y2, d)) for a, b, c, d in cajas]
    validos = [(a, b, c, d) for a, b, c, d in recortes if a < c and b < d]
    if not validos:
        return None
    return (min(r[0] for r in validos), min(r[1] for r in validos), max(r[2] for r in validos), max(r[3] for r in validos))
