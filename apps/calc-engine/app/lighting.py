# © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
"""Детерминированный светотехнический расчёт по СП 52.13330 (RULES § 5.1).

Метод коэффициента использования светового потока:
    Φ = E_н · S · K_з / η
    N = ceil(Φ / Φ_св)

Все вычисления выполняются в ``Decimal``; LLM не участвует в расчёте.
"""

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP, localcontext

from .schemas import LightingCalcRequest, LightingCalcResponse

_CONTEXT_PRECISION = 40
_QUANTUM = Decimal("0.001")

# Нормативная освещённость, лк (значения из задания релиза v0.8.0).
_REQUIRED_LUX: dict[str, Decimal] = {
    "living": Decimal("150"),
    "kitchen": Decimal("200"),
    "wet": Decimal("75"),
    "utility": Decimal("100"),
    "outdoor": Decimal("50"),
}
# Идентификаторы строк справочника LIGHTING_SP52_V08.md.
_LUX_REFERENCE: dict[str, str] = {
    "living": "LIGHT-EN-LIVING",
    "kitchen": "LIGHT-EN-KITCHEN",
    "wet": "LIGHT-EN-WET",
    "utility": "LIGHT-EN-UTILITY",
    "outdoor": "LIGHT-EN-OUTDOOR",
}
# Таблица η по индексу помещения (SP 52, reflector 0.7/0.5/0.2).
_UTILIZATION_TABLE: tuple[tuple[Decimal, Decimal], ...] = (
    (Decimal("0.5"), Decimal("0.34")),
    (Decimal("0.8"), Decimal("0.42")),
    (Decimal("1.0"), Decimal("0.47")),
    (Decimal("1.25"), Decimal("0.52")),
    (Decimal("1.5"), Decimal("0.56")),
    (Decimal("2.0"), Decimal("0.62")),
    (Decimal("2.5"), Decimal("0.66")),
    (Decimal("3.0"), Decimal("0.69")),
    (Decimal("4.0"), Decimal("0.73")),
    (Decimal("5.0"), Decimal("0.76")),
)
_RULES_VERSION = "0.1"


def _to_decimal(value: float | int | Decimal) -> Decimal:
    """Преобразует число через строку, не внося бинарный шум ``float``."""
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _round(value: Decimal) -> float:
    """Округляет значение до 3 знаков и убирает отрицательный ноль."""
    if value == 0:
        return 0.0
    return float(value.quantize(_QUANTUM, rounding=ROUND_HALF_UP))


def polygon_area_m2(points: list[object]) -> Decimal:
    """Площадь многоугольника по формуле шнурования (Гаусса), m2.

    :param points — вершины с атрибутами `x` и `y` в метрах.
    :returns: неотрицательная площадь.
    """
    if len(points) < 3:
        raise ValueError("Полигон комнаты должен содержать минимум 3 вершины")
    doubled = Decimal(0)
    for index, point in enumerate(points):
        current = points[(index + 1) % len(points)]
        doubled += _to_decimal(getattr(point, "x")) * _to_decimal(getattr(current, "y"))
        doubled -= _to_decimal(getattr(current, "x")) * _to_decimal(getattr(point, "y"))
    return abs(doubled) / Decimal(2)


def utilization_factor(room_index: Decimal) -> tuple[Decimal, bool]:
    """Возвращает η с линейной интерполяцией; флаг — выход за диапазон."""
    if room_index <= _UTILIZATION_TABLE[0][0]:
        return _UTILIZATION_TABLE[0][1], True
    if room_index >= _UTILIZATION_TABLE[-1][0]:
        return _UTILIZATION_TABLE[-1][1], True
    for (left_index, left_eta), (right_index, right_eta) in zip(
        _UTILIZATION_TABLE, _UTILIZATION_TABLE[1:]
    ):
        if left_index <= room_index <= right_index:
            ratio = (room_index - left_index) / (right_index - left_index)
            return left_eta + (right_eta - left_eta) * ratio, False
    return _UTILIZATION_TABLE[-1][1], True


def calculate_lighting(request: LightingCalcRequest) -> LightingCalcResponse:
    """Рассчитывает площадь, индекс помещения, η и число светильников."""
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION

        warnings: list[str] = []
        zone = request.zone_type or "utility"
        if request.zone_type is None:
            warnings.append("Тип зоны не задан: использовано консервативное значение utility")
        required_lux = _REQUIRED_LUX[zone]

        if request.polygon_m is not None:
            area = polygon_area_m2(request.polygon_m)
            xs = [_to_decimal(getattr(point, "x")) for point in request.polygon_m]
            ys = [_to_decimal(getattr(point, "y")) for point in request.polygon_m]
            length = max(xs) - min(xs)
            width = max(ys) - min(ys)
        elif request.area_m2 is not None:
            area = _to_decimal(request.area_m2)
            side = area.sqrt()
            length = width = side
        else:
            raise ValueError("Укажите polygonM или areaM2")

        if area <= 0:
            raise ValueError("Площадь помещения должна быть положительной")
        if length <= 0 or width <= 0:
            raise ValueError("Габариты помещения должны быть положительными")

        height = _to_decimal(request.ceiling_height_m)
        room_index = area / (height * (length + width))
        eta, out_of_range = utilization_factor(room_index)
        if out_of_range:
            warnings.append("Индекс помещения вне табличного диапазона: η принято граничным")

        flux = _to_decimal(request.luminaire_flux_lm)
        safety = _to_decimal(request.safety_factor)
        required_lumens = required_lux * area * safety / eta
        count = int((required_lumens / flux).to_integral_value(rounding=ROUND_CEILING))
        if count < 1:
            count = 1

        actual_lux = Decimal(count) * flux * eta / (area * safety)
        total_power = Decimal(count) * _to_decimal(request.luminaire_power_w)
        references = [_LUX_REFERENCE[zone], "LIGHT-UTILIZATION", "LIGHT-METHOD"]

        return LightingCalcResponse(
            area_m2=_round(area),
            required_lux=_round(required_lux),
            room_index=_round(room_index),
            utilization_factor=_round(eta),
            recommended_luminaires_count=count,
            total_power_w=_round(total_power),
            actual_lux=_round(actual_lux),
            warnings=warnings,
            references=references,
            rules_version=_RULES_VERSION,
        )


__all__ = ["calculate_lighting", "polygon_area_m2", "utilization_factor"]
