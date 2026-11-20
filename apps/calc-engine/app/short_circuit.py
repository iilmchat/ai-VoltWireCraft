# © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
"""Детерминированный расчёт однофазного КЗ «фаза-ноль» и селективности.

Петля «фаза-ноль» (U_φ = 230 В):

    R_φ = R_N = ρ · L / S
    Z_т = (u_k% / 100) · U_φ² / (S_т · 1000 / 3)
    Z_петли = √((Z_т + R_φ + R_N)² + (X_φ + X_N)²)
    I_кз^(1) = U_φ / Z_петли

Математика выполняется в ``Decimal`` (RULES § 5.1); LLM не участвует.
"""

from decimal import Decimal, ROUND_HALF_UP, localcontext

from .schemas import (
    ShortCircuitRequest,
    ShortCircuitResponse,
    ThreePhaseShortCircuitRequest,
    ThreePhaseShortCircuitResponse,
)

_CONTEXT_PRECISION = 40
_QUANTUM = Decimal("0.001")

# Кратность гарантированного мгновенного отключения (верхняя граница кривой).
_TRIP_MULTIPLIER: dict[str, Decimal] = {
    "B": Decimal("5"),
    "C": Decimal("10"),
    "D": Decimal("20"),
}
# Нижняя граница той же зоны — для информационной части протокола.
_MIN_MULTIPLIER: dict[str, Decimal] = {
    "B": Decimal("3"),
    "C": Decimal("5"),
    "D": Decimal("10"),
}
# Порядок кривой по «медленности»; ввод должен быть не быстрее группового.
_CURVE_ORDER: dict[str, int] = {"B": 0, "C": 1, "D": 2}
# Минимальное отношение номиналов для токовой селективности (DESIGN_V030 § 3.3).
_SELECTIVITY_RATIO = Decimal("1.6")
_RULES_VERSION = "0.1"


def _to_decimal(value: float | int | Decimal) -> Decimal:
    """Преобразует число через строку, не внося бинарный шум ``float``."""
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _round(value: Decimal) -> float:
    """Округляет значение до 3 знаков и убирает отрицательный ноль."""
    if value == 0:
        return 0.0
    return float(value.quantize(_QUANTUM, rounding=ROUND_HALF_UP))


def calculate_short_circuit(request: ShortCircuitRequest) -> ShortCircuitResponse:
    """Рассчитывает ток КЗ в конце линии и проверяет отключение/селективность."""
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION

        voltage = _to_decimal(request.voltage_v)
        length = _to_decimal(request.cable_length_m)
        section = _to_decimal(request.cross_section_mm2)
        rho = _to_decimal(request.resistance_ohm_mm2_per_m)
        conductor_x = _to_decimal(request.reactance_ohm_per_km) * length / Decimal(1000)

        if request.transformer_impedance_ohm is not None:
            transformer_z = _to_decimal(request.transformer_impedance_ohm)
        else:
            transformer_z = (
                _to_decimal(request.transformer_uk_percent)
                / Decimal(100)
                * voltage
                * voltage
                / (_to_decimal(request.transformer_power_kva) * Decimal(1000) / Decimal(3))
            )

        conductor_r = rho * length / section
        loop_reactance = Decimal(2) * conductor_x
        # Каскад ВРУ → магистраль → ЩР: сопротивление вышестоящей петли
        # добавляется к сопротивлению трансформатора.
        real_part = transformer_z + Decimal(2) * conductor_r + _to_decimal(
            request.upstream_impedance_ohm
        )
        loop_impedance = (real_part * real_part + loop_reactance * loop_reactance).sqrt()
        current = voltage / loop_impedance

        breaker = _to_decimal(request.breaker_rating_a)
        required = _TRIP_MULTIPLIER[request.trip_curve]
        minimum = _MIN_MULTIPLIER[request.trip_curve]
        actual = current / breaker
        complies = actual >= required

        upstream = request.upstream_breaker_rating_a
        ratio = Decimal(0) if upstream is None else _to_decimal(upstream) / breaker
        upstream_curve = request.upstream_trip_curve or "C"
        selective = (
            upstream is not None
            and ratio >= _SELECTIVITY_RATIO
            and _CURVE_ORDER[upstream_curve] >= _CURVE_ORDER[request.trip_curve]
        )

        warnings: list[str] = []
        if not complies:
            warnings.append(
                f"Ток КЗ {_round(current)} А меньше {required}×I_n = {_round(required * breaker)} А; "
                "мгновенное отключение не гарантировано — уменьшите номинал автомата или длину линии."
            )
        if upstream is not None and not selective:
            warnings.append(
                "Не соблюдена токовая селективность: вводный автомат должен быть "
                "не менее 1,6× группового и не более быстрой кривой."
            )

        trip_time = Decimal("0.1") if complies else Decimal("1.0")

        return ShortCircuitResponse(
            transformer_impedance_ohm=_round(transformer_z),
            phase_resistance_ohm=_round(conductor_r),
            neutral_resistance_ohm=_round(conductor_r),
            loop_reactance_ohm=_round(loop_reactance),
            loop_impedance_ohm=_round(loop_impedance),
            short_circuit_current_a=_round(current),
            required_multiplicity=_round(required),
            minimum_multiplicity=_round(minimum),
            actual_multiplicity=_round(actual),
            instantaneous_trip_a=_round(required * breaker),
            disconnect_complies=complies,
            selectivity_ok=selective,
            upstream_to_downstream_ratio=_round(ratio),
            trip_time_s=_round(trip_time),
            warnings=warnings,
            references=[
                "PUE-SC-1.7-VOLTAGE",
                "PUE-SC-1.7-LOOP-R",
                "PUE-SC-1.7-TIME-04",
                f"PUE-SC-TRIP-{request.trip_curve}",
                "PUE-SC-SELECT-TIME",
            ],
            rules_version=_RULES_VERSION,
        )


def calculate_three_phase_short_circuit(
    request: ThreePhaseShortCircuitRequest,
) -> ThreePhaseShortCircuitResponse:
    """Рассчитывает симметричный и ударный ток трёхфазного КЗ.

    Iкз^(3) = Uл / (√3 · √(R²+X²))
    iуд = kуд · √2 · Iкз^(3), kуд = 1 + exp(−0,01 / T_a) ≤ 2

    :param request — напряжение, сопротивления петли и I_cn вводного автомата.
    :returns: детерминированный протокол расчёта.
    """
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION

        resistance = _to_decimal(request.resistance_ohm)
        reactance = _to_decimal(request.reactance_ohm)
        impedance = (resistance * resistance + reactance * reactance).sqrt()
        if impedance <= 0:
            raise ValueError("Сопротивление петли КЗ должно быть положительным")

        voltage = _to_decimal(request.voltage_v)
        current = voltage / (Decimal(3).sqrt() * impedance)
        time_constant = _to_decimal(request.time_constant_s)
        impact = Decimal(1) + (-(Decimal("0.01") / time_constant)).exp()
        if impact > Decimal(2):
            impact = Decimal(2)
        peak = impact * Decimal(2).sqrt() * current

        capacity = _to_decimal(request.breaking_capacity_ka) * Decimal(1000)
        capacity_ok = capacity >= current
        warnings: list[str] = []
        if not capacity_ok:
            warnings.append(
                f"I_cn {_round(capacity)} А меньше Iкз^(3) {_round(current)} А — "
                "вводной аппарат не обеспечивает отключающую способность"
            )

        return ThreePhaseShortCircuitResponse(
            short_circuit_current_a=_round(current),
            peak_short_circuit_a=_round(peak),
            impact_factor=_round(impact),
            loop_impedance_ohm=_round(impedance),
            breaking_capacity_ok=capacity_ok,
            warnings=warnings,
            references=[
                "PUE-SC-3P-U",
                "PUE-SC-IMPACT-K",
                "PUE-SC-BREAKING-CAPACITY",
            ],
            rules_version=_RULES_VERSION,
        )


__all__ = ["calculate_short_circuit", "calculate_three_phase_short_circuit"]
