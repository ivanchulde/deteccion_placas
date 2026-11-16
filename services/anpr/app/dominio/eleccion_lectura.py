"""
Elección de la placa final cuando el OCR rápido y el verificador PP-OCRv6 leen algo distinto.

Antes la lectura del verificador reemplazaba siempre a la del OCR rápido. En el video de la garita
(docs/resultados/precision_garita_2026-11-09) esa regla cambió una lectura correcta (O por D), y en
104 recortes reales el OCR rápido fue más exacto que el verificador (87,5 % frente a 83,7 %,
docs/resultados/ocr_ecuatorianas_2026-11-05.md). Por eso:

  - Si solo uno de los dos leyó una placa, se usa esa lectura.
  - Si coinciden, no hay nada que decidir.
  - Si la lectura del OCR rápido no es una placa completa con la forma del recuadro (le falta un
    carácter, formato de moto en un auto), el verificador la completa.
  - Si otra lectura independiente (OCR profundo de la misma foto u OCR rápido de otro cuadro)
    respalda la del verificador, prevalece el verificador: ya hay dos lectores de acuerdo.
  - Si discrepan, el verificador solo prevalece cuando su confianza supera a la del OCR rápido en
    al menos `margen` (OCR_VERIFIER_OVERRIDE_MARGIN). En cualquier caso el desacuerdo se informa
    para que la lectura no se autorice sola y la confirme el guardia (regla R3 del backend).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EleccionLectura:
    placa: str
    confianza: float
    #: Los dos lectores leyeron placas distintas
    desacuerdo: bool
    #: La placa elegida es la del verificador
    del_verificador: bool


def _limpia(placa: str) -> str:
    return (placa or "").replace("-", "").strip().upper()


def elegir_lectura(placa: str, confianza: float, placa_verificador: str, confianza_verificador: float,
                   margen: float = 0.10, *, ocr_coherente: bool = True,
                   respaldo_verificador: bool = False) -> EleccionLectura:
    if not placa_verificador:
        return EleccionLectura(placa, confianza, False, False)
    if not placa or _limpia(placa) == _limpia(placa_verificador):
        return EleccionLectura(placa_verificador, confianza_verificador, False, True)
    if not ocr_coherente or respaldo_verificador:
        return EleccionLectura(placa_verificador, confianza_verificador, False, True)
    if confianza_verificador >= confianza + margen:
        return EleccionLectura(placa_verificador, confianza_verificador, True, True)
    return EleccionLectura(placa, confianza, True, False)


def motivo_desacuerdo(placa_ocr: str, placa_verificador: str) -> str:
    return f"lectores en desacuerdo: OCR '{placa_ocr}' / verificador '{placa_verificador}'; requiere confirmación"
