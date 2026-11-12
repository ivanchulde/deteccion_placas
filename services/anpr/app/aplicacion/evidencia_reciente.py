"""
Placas vistas en los últimos segundos, para la evidencia automática del registro manual.

Cuando el guardia registra un paso a mano (la cámara no leyó la placa, el vehículo sigue detenido
frente a la garita, etc.), el sistema guarda sola la foto de la placa y del vehículo: la mejor placa
que el detector vio en los últimos segundos. Cada cuadro analizado aporta su placa más grande (el
recorte es pequeño, unos kilobytes); la foto completa del vehículo sale del historial de 30 s
(historial_cuadros.py), que ya guarda el cuadro comprimido, así que esto casi no ocupa memoria.

Se registra todo lo que ve el detector, también las pistas ya resueltas: un vehículo detenido cuyo
paso ya se registró (o se eliminó) debe poder documentarse igual.
"""
from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass
from typing import Any, Iterable, Optional

import numpy as np

SEGUNDOS = 30.0
POR_SEGUNDO = 4.0
#: Margen alrededor de la placa en el recorte, en fracción de su alto (se ve el borde completo)
MARGEN = 0.15


@dataclass(frozen=True)
class PlacaVista:
    hora: float
    tracking_id: int
    recorte: np.ndarray
    confianza: float
    ancho_px: int


def puntaje(v: PlacaVista) -> float:
    """La placa más grande es la más legible (el OCR pierde caracteres en placas chicas); la
    confianza del detector desempata entre placas de tamaño parecido."""
    return v.ancho_px * (0.5 + 0.5 * v.confianza)


def recortar(frame: np.ndarray, caja: Iterable[float]) -> Optional[np.ndarray]:
    x1, y1, x2, y2 = (int(round(c)) for c in caja)
    alto, ancho = frame.shape[:2]
    m = int((y2 - y1) * MARGEN)
    x1, y1, x2, y2 = max(0, x1 - m), max(0, y1 - m), min(ancho, x2 + m), min(alto, y2 + m)
    if x2 - x1 < 8 or y2 - y1 < 4:
        return None
    return frame[y1:y2, x1:x2].copy()


class PlacasRecientes:
    def __init__(self, segundos: float = SEGUNDOS, por_segundo: float = POR_SEGUNDO) -> None:
        self._segundos = segundos
        self._intervalo = 1.0 / por_segundo
        self._vistas: deque[PlacaVista] = deque()
        self._candado = threading.Lock()
        self._ultimo = 0.0

    def ofrecer(self, hora: float, frame: np.ndarray, rois: Iterable[Any]) -> None:
        """Placa más grande de un cuadro analizado (rois con plate_bbox, confidence y tracking_id)."""
        if hora - self._ultimo < self._intervalo:
            return
        mejor = None
        for roi in rois:
            x1, _, x2, _ = roi.plate_bbox
            if mejor is None or (x2 - x1) * (0.5 + 0.5 * roi.confidence) > (mejor.plate_bbox[2] - mejor.plate_bbox[0]) * (0.5 + 0.5 * mejor.confidence):
                mejor = roi
        if mejor is None:
            return
        recorte = recortar(frame, mejor.plate_bbox)
        if recorte is None:
            return
        self._ultimo = hora
        vista = PlacaVista(hora, int(mejor.tracking_id), recorte, float(mejor.confidence),
                           int(mejor.plate_bbox[2] - mejor.plate_bbox[0]))
        with self._candado:
            self._vistas.append(vista)
            while self._vistas and hora - self._vistas[0].hora > self._segundos:
                self._vistas.popleft()

    def mejor(self, desde: float) -> Optional[PlacaVista]:
        """La placa más legible vista desde `desde` (hora), o None si no se vio ninguna."""
        with self._candado:
            candidatas = [v for v in self._vistas if v.hora >= desde]
        return max(candidatas, key=puntaje, default=None)

    def reiniciar(self) -> None:
        """Olvida lo visto (al cambiar de cámara)."""
        with self._candado:
            self._vistas.clear()
        self._ultimo = 0.0
