# © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
"""Детерминированный расчёт длины кабельной линии.

Формула (RULES § 5.1, 5.3):

    L = (L_гор + L_верт) × K_запаса

``L_гор`` — сумма длин отрезков трассы: пиксельные координаты умножаются на
``scale_meters_per_px``. ``L_верт`` — подъёмы к потолку и спуски к ЭУИ:
``|H_пот − H_источ| + |H_пот − H_приём|``.

Вычисления выполняются в ``Decimal``, результат округляется до 1 мкм
(``ROUND_HALF_UP``). Одинаковые входные данные всегда дают одинаковый результат.
"""

from decimal import Decimal, ROUND_HALF_UP, localcontext

from .schemas import CalculateCableLengthRequest, CalculateCableLengthResponse

# Точность результата — 1 микрометр.
_QUANTUM = Decimal("0.000001")
# Запас разрядов для промежуточных вычислений, включая извлечение корня.
_CONTEXT_PRECISION = 40


def _to_decimal(value: float) -> Decimal:
    """Преобразует число через строку, не внося бинарный шум ``float``."""
    return Decimal(str(value))


def _round_meters(value: Decimal) -> float:
    """Округляет метры до 1 мкм и убирает отрицательный ноль."""
    if value == 0:
        return 0.0
    return float(value.quantize(_QUANTUM, rounding=ROUND_HALF_UP))


def _horizontal_length_m(request: CalculateCableLengthRequest) -> Decimal:
    """Считает длину ломаной; менее двух точек — нулевая трасса."""
    waypoints = request.waypoints_px
    if len(waypoints) < 2:
        return Decimal(0)

    scale = _to_decimal(request.scale_meters_per_px)
    total_px = Decimal(0)
    for start, end in zip(waypoints, waypoints[1:]):
        dx = _to_decimal(end.x) - _to_decimal(start.x)
        dy = _to_decimal(end.y) - _to_decimal(start.y)
        total_px += (dx * dx + dy * dy).sqrt()
    return total_px * scale


def _vertical_length_m(request: CalculateCableLengthRequest) -> Decimal:
    """Считает подъём от источника к потолку и спуск к приёмнику."""
    ceiling = _to_decimal(request.ceiling_height_m)
    source = _to_decimal(request.source_mount_height_m)
    target = _to_decimal(request.target_mount_height_m)
    return abs(ceiling - source) + abs(ceiling - target)


def calculate_cable_length(
    request: CalculateCableLengthRequest,
) -> CalculateCableLengthResponse:
    """Возвращает точную длину кабельной линии в метрах.

    :param request: провалидированный запрос расчёта.
    :returns: горизонтальная и вертикальная составляющие, итоговая длина
        с коэффициентом запаса и число точек трассы.
    """
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION

        horizontal = _round_meters(_horizontal_length_m(request))
        vertical = _round_meters(_vertical_length_m(request))
        reserve = _to_decimal(request.reserve_factor)
        total = _round_meters(
            (_to_decimal(horizontal) + _to_decimal(vertical)) * reserve
        )

        return CalculateCableLengthResponse(
            length_m=total,
            horizontal_length_m=horizontal,
            vertical_length_m=vertical,
            reserve_factor=request.reserve_factor,
            waypoints_count=len(request.waypoints_px),
        )
