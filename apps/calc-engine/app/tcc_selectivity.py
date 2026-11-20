# © 2026 RuChating (iilmchat) · VoltWireCraft v0.6.0
"""Детерминированный расчёт время-токовых характеристик и селективности.

Модель по ГОСТ Р 50345-2010 (IEC 60898-1) и справочнику
``docs/domain/TCC_SELECTIVITY_V06.md``. Все вычисления выполняются в
``Decimal``; LLM не участвует в расчёте (RULES § 5.1).
"""

from decimal import Decimal, ROUND_HALF_UP, localcontext

from .schemas import (
    SelectivityTccRequest,
    SelectivityTccResponse,
    TccDeviceInput,
    TccPairResult,
    TccPoint,
)

_CONTEXT_PRECISION = 40
_QUANTUM = Decimal("0.001")
# Постоянная тепловой модели из справочника.
_HEAT_K = Decimal("30")
# Порог не срабатывания / срабатывания за 1 ч.
_NO_TRIP = Decimal("1.13")
_THERMAL_END = Decimal("2.55")
# Дополнительная выдержка для селективности.
_DELTA_T = Decimal("0.1")
# Верхние и нижние границы электромагнитной зоны.
_TRIP_BANDS: dict[str, tuple[Decimal, Decimal]] = {
    "B": (Decimal("3"), Decimal("5")),
    "C": (Decimal("5"), Decimal("10")),
    "D": (Decimal("10"), Decimal("20")),
}
_GRID_POINTS = 200
_RULES_VERSION = "0.1"


def _to_decimal(value: float | int | Decimal) -> Decimal:
    """Преобразует число через строку, не внося бинарный шум ``float``."""
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _round(value: Decimal) -> float:
    """Округляет значение до 3 знаков и убирает отрицательный ноль."""
    if value == 0:
        return 0.0
    return float(value.quantize(_QUANTUM, rounding=ROUND_HALF_UP))


def trip_time_seconds(current: Decimal, device: TccDeviceInput) -> Decimal | None:
    """Возвращает время срабатывания, `None` — зона «не сработает».

    Кусочно-аналитическая модель непрерывна и монотонна на стыках зон.
    """
    rated = _to_decimal(device.rated_current_a)
    x = current / rated
    if x <= _NO_TRIP:
        return None

    thermal_end = _HEAT_K / (_THERMAL_END * _THERMAL_END - _NO_TRIP * _NO_TRIP)
    if x <= _THERMAL_END:
        return _HEAT_K / (x * x - _NO_TRIP * _NO_TRIP)

    low, high = _TRIP_BANDS[device.trip_curve]
    if x < low:
        return thermal_end
    if x < high:
        ratio = (x - low) / (high - low)
        return thermal_end + (Decimal("0.1") - thermal_end) * ratio
    return Decimal("0.1")


def build_curve(device: TccDeviceInput, points: int = 30) -> list[TccPoint]:
    """Строит логарифмическую сетку точек ВТХ от In до 20·In."""
    rated = _to_decimal(device.rated_current_a)
    result: list[TccPoint] = []
    for index in range(points):
        current = rated * (Decimal(20) ** (Decimal(index) / Decimal(points - 1)))
        time_value = trip_time_seconds(current, device)
        result.append(TccPoint(current_a=_round(current), time_s=_round(time_value or Decimal("3600"))))
    return result


def selectivity_limit(downstream: TccDeviceInput, upstream: TccDeviceInput) -> Decimal:
    """Находит предел селективности Is для пары аппаратов.

   Условие: t_down(I) + 0,1 ≤ t_up(I) на всей сетке до Is.
    """
    lower = _to_decimal(downstream.rated_current_a)
    upper = min(
        _to_decimal(downstream.breaking_capacity_ka or 10) * Decimal(1000),
        _to_decimal(upstream.breaking_capacity_ka or 10) * Decimal(1000),
    )
    if upper <= lower:
        return Decimal(0)

    valid_limit = Decimal(0)
    for index in range(_GRID_POINTS + 1):
        current = lower * (upper / lower) ** (Decimal(index) / Decimal(_GRID_POINTS))
        down_time = trip_time_seconds(current, downstream)
        up_time = trip_time_seconds(current, upstream)
        if down_time is None:
            valid_limit = current
            continue
        if up_time is None or down_time + _DELTA_T <= up_time:
            valid_limit = current
        else:
            break
    return valid_limit


def calculate_tcc_selectivity(request: SelectivityTccRequest) -> SelectivityTccResponse:
    """Рассчитывает ВТХ цепочки, предел селективности и каскадное ΔU."""
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION

        devices = {device.id: device for device in request.devices}
        pairs: list[TccPairResult] = []
        warnings: list[str] = []
        references = ["TCC-113", "TCC-145", "TCC-255-32", "TCC-ICN-45"]
        breaking_capacity_ok = True
        selective_count = 0

        for device in request.devices:
            if device.short_circuit_current_a is not None and device.breaking_capacity_ka is not None:
                capacity_a = _to_decimal(device.breaking_capacity_ka) * Decimal(1000)
                if capacity_a < _to_decimal(device.short_circuit_current_a):
                    breaking_capacity_ok = False
                    warnings.append(
                        f"Аппарат {device.id}: I_cn {_round(capacity_a)} А меньше I_кз "
                        f"{_round(_to_decimal(device.short_circuit_current_a))} А"
                    )

        for device in request.devices:
            if device.parent_id is None or device.parent_id not in devices:
                continue
            upstream = devices[device.parent_id]
            limit = selectivity_limit(device, upstream)
            fault = device.short_circuit_current_a
            fc = devices[device.parent_id].short_circuit_current_a
            fault_limit = min(
                _to_decimal(fault) if fault is not None else limit,
                _to_decimal(fc) if fc is not None else limit,
            )
            selective = fault_limit <= limit if limit > 0 else False
            pairs.append(
                TccPairResult(
                    downstream_id=device.id,
                    upstream_id=upstream.id,
                    selectivity_limit_a=_round(limit),
                    selective=selective,
                )
            )
            if selective:
                selective_count += 1
            references.append(f"TCC-{upstream.trip_curve}-HIGH")

        total_drop = (
            _to_decimal(request.upstream_voltage_drop_percent)
            + _to_decimal(request.group_voltage_drop_percent)
        )
        voltage_ok = total_drop <= _to_decimal(request.voltage_drop_limit_percent)
        if not voltage_ok:
            warnings.append(
                f"Каскадная потеря напряжения {_round(total_drop)} % exceeds "
                f"{_round(_to_decimal(request.voltage_drop_limit_percent))} %"
            )

        all_selective = bool(pairs) and selective_count == len(pairs)
        status = "full" if all_selective and breaking_capacity_ok and voltage_ok else (
            "partial" if selective_count > 0 else "none"
        )

        downstream = request.devices[0]
        upstream = devices.get(downstream.parent_id or "") or request.devices[-1]
        limits = [pair.selectivity_limit_a for pair in pairs] or [0.0]

        return SelectivityTccResponse(
            status=status,
            selectivity_limit_a=min(limits),
            breaking_capacity_ok=breaking_capacity_ok,
            total_voltage_drop_percent=_round(total_drop),
            voltage_drop_ok=voltage_ok,
            pairs=pairs,
            upstream_curve=build_curve(upstream),
            downstream_curve=build_curve(downstream),
            warnings=warnings,
            references=sorted(set(references)),
            rules_version=_RULES_VERSION,
        )


__all__ = [
    "build_curve",
    "calculate_tcc_selectivity",
    "selectivity_limit",
    "trip_time_seconds",
]
