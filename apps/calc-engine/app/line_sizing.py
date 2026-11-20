# © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
"""Детерминированный расчёт потребительской линии по ПУЭ-7.

Все физические величины — в СИ; вычисления выполняются в ``Decimal``
с 40 разрядами, результат округляется до 3 знаков. Таблицы допустимых
токов заданы константами из ``docs/domain/PUE_RULES_V02.md``; ядро не
использует данные от языковой модели (RULES § 5.1).
"""

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP, localcontext

from .schemas import LineSizingRequest, LineSizingResponse

# Точность промежуточных вычислений и вывода.
_CONTEXT_PRECISION = 40
_QUANTUM = Decimal("0.001")

# Стандартный ряд сечений медных жил, мм².
CROSS_SECTIONS: tuple[Decimal, ...] = tuple(
    Decimal(value) for value in ("1.5", "2.5", "4", "6", "10", "16")
)

# ПУЭ-7 таблица 1.3.4, медные жилы, +25 °C (A).
AMPACITY_CONDUIT: dict[Decimal, int] = {
    CROSS_SECTIONS[0]: 17,
    CROSS_SECTIONS[1]: 23,
    CROSS_SECTIONS[2]: 30,
    CROSS_SECTIONS[3]: 37,
    CROSS_SECTIONS[4]: 50,
    CROSS_SECTIONS[5]: 66,  # экстраполяция ряда, требует сверки с нормативом
}
AMPACITY_AIR: dict[Decimal, int] = {
    CROSS_SECTIONS[0]: 19,
    CROSS_SECTIONS[1]: 25,
    CROSS_SECTIONS[2]: 32,
    CROSS_SECTIONS[3]: 40,
    CROSS_SECTIONS[4]: 56,
    CROSS_SECTIONS[5]: 80,  # экстраполяция ряда, требует сверки с нормативом
}

# Активное сопротивление медной жилы, Ом/км (справочник кабелей ВВГнг(А)-LS).
RESISTANCE_OHM_PER_KM: dict[Decimal, Decimal] = {
    CROSS_SECTIONS[0]: Decimal("12.1"),
    CROSS_SECTIONS[1]: Decimal("7.41"),
    CROSS_SECTIONS[2]: Decimal("4.61"),
    CROSS_SECTIONS[3]: Decimal("3.08"),
    CROSS_SECTIONS[4]: Decimal("1.83"),
    CROSS_SECTIONS[5]: Decimal("1.15"),
}

# Удельное индуктивное сопротивление кабеля 0,4 кВ, Ом/км.
REACTANCE_OHM_PER_KM = Decimal("0.08")

# Предел номинала автомата по таблице ПУЭ «сечение → максимальный АВ», A.
BREAKER_MAX_BY_SECTION: dict[Decimal, int] = {
    CROSS_SECTIONS[0]: 10,
    CROSS_SECTIONS[1]: 16,
    CROSS_SECTIONS[2]: 25,
    CROSS_SECTIONS[3]: 32,
    CROSS_SECTIONS[4]: 50,
    CROSS_SECTIONS[5]: 66,
}

# Стандартный ряд номиналов автоматических выключателей, A.
BREAKER_RATINGS: tuple[int, ...] = (6, 10, 16, 20, 25, 32, 40, 50, 63)

# Версия справочника из docs/domain/PUE_RULES_V02.md.
RULES_VERSION = "0.1"


def _to_decimal(value: float | int | Decimal) -> Decimal:
    """Преобразует число через строку, не внося бинарный шум ``float``."""
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _round(value: Decimal) -> float:
    """Округляет значение до 3 знаков и убирает отрицательный ноль."""
    if value == 0:
        return 0.0
    return float(value.quantize(_QUANTUM, rounding=ROUND_HALF_UP))


def _section_id(section: Decimal) -> str:
    """Формирует идентификатор строки справочника для сечения."""
    return format(section, "f").rstrip("0").rstrip(".")


def _section_value(section: Decimal) -> float | int:
    """Приводит сечение к типу, ожидаемому Pydantic-литералом (целые — int)."""
    if section == section.to_integral_value():
        return int(section)
    return float(section)


def ampacity(section: Decimal, installation_method: str) -> int:
    """Возвращает допустимый длительный ток для сечения и способа прокладки."""
    table = AMPACITY_AIR if installation_method == "air" else AMPACITY_CONDUIT
    return table[section]


def design_current_a(request: LineSizingRequest) -> Decimal:
    """Расчётный ток линии: однофазный — P/(U cosφ), трёхфазный — P/(√3 U cosφ)."""
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION
        power = _to_decimal(request.power_w)
        voltage = _to_decimal(request.voltage_v)
        cos_phi = _to_decimal(request.power_factor)
        denominator = voltage * cos_phi
        if request.phases == 3:
            denominator *= Decimal(3).sqrt()
        return power / denominator


def voltage_drop_percent(
    request: LineSizingRequest, section: Decimal, current: Decimal
) -> Decimal:
    """Потеря напряжения, %: √3 I L (r cosφ + x sinφ)/U для 3 фаз, 2 I … для 1."""
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION
        cos_phi = _to_decimal(request.power_factor)
        sin_phi = (Decimal(1) - cos_phi * cos_phi).sqrt()
        resistance = RESISTANCE_OHM_PER_KM[section]
        impedance = resistance * cos_phi + REACTANCE_OHM_PER_KM * sin_phi
        length_km = _to_decimal(request.length_m) / Decimal(1000)
        factor = Decimal(3).sqrt() if request.phases == 3 else Decimal(2)
        voltage = _to_decimal(request.voltage_v)
        return factor * current * length_km * impedance / voltage * Decimal(100)


def select_cross_section(
    request: LineSizingRequest, current: Decimal
) -> tuple[Decimal, Decimal, bool]:
    """Выбирает минимальное сечение по допустимому току и потере напряжения.

    :returns: сечение, потеря напряжения и признак успешного подбора.
    """
    limit = _to_decimal(request.max_voltage_drop_percent)
    selected = CROSS_SECTIONS[-1]
    last_drop = Decimal(0)
    for section in CROSS_SECTIONS:
        last_drop = voltage_drop_percent(request, section, current) + _to_decimal(
            request.upstream_voltage_drop_percent
        )
        if (
            ampacity(section, request.installation_method) >= current
            and last_drop <= limit
            and _breaker_candidates(current, section)
        ):
            return section, last_drop, True
        selected = section
    return selected, last_drop, False


def _breaker_candidates(current: Decimal, section: Decimal) -> list[int]:
    """Номиналы АВ, удовлетворяющие I_p ≤ I_n ≤ I_доп для заданного сечения."""
    limit = min(
        ampacity(section, "conduit"),  # консервативный предел по базовой прокладке
        BREAKER_MAX_BY_SECTION[section],
    )
    return [rating for rating in BREAKER_RATINGS if rating >= current and rating <= limit]


def select_breaker(current: Decimal, section: Decimal) -> tuple[int, bool]:
    """Подбирает номинал АВ: I_p ≤ I_n ≤ I_доп с учётом таблицы ПУЭ."""
    limit = min(
        ampacity(section, "conduit"),  # консервативный предел по базовой прокладке
        BREAKER_MAX_BY_SECTION[section],
    )
    suitable = _breaker_candidates(current, section)
    if suitable:
        return min(suitable), True
    # Если подходящего номинала нет, возвращаем ближайший меньший и предупреждаем.
    below = [rating for rating in BREAKER_RATINGS if rating <= limit]
    return (max(below) if below else limit), False


def rcd_recommendation(request: LineSizingRequest) -> tuple[int, bool, list[str]]:
    """Возвращает уставку УЗО, признак обязательности и ссылки на ПУЭ."""
    wet = request.room_type in ("wet", "kitchen", "outdoor")
    socket = request.consumer_kind == "socket"
    if request.room_type == "wet" and request.consumer_kind == "appliance":
        return 10, True, ["PUE-RCD-WET-10"]
    if wet:
        return 30, True, ["PUE-RCD-WET-30"]
    if socket:
        return 30, True, ["PUE-RCD-SOCKET-30"]
    return 0, False, []


def calculate_line_sizing(request: LineSizingRequest) -> LineSizingResponse:
    """Рассчитывает ток, сечение, потерю напряжения и аппараты защиты линии."""
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION

        current = design_current_a(request)
        section, drop, section_ok = select_cross_section(request, current)
        permissible = ampacity(section, request.installation_method)
        breaker, breaker_ok = select_breaker(current, section)
        rcd_ma, rcd_required, rcd_refs = rcd_recommendation(request)

        recommendations: list[str] = []
        references = [
            f"PUE-1.3.4-T1-S{_section_id(section)}",
            f"PUE-BREAKER-S{_section_id(section)}",
            "PUE-VDROP-5",
            *rcd_refs,
        ]

        if not section_ok:
            recommendations.append(
                "Ни одно стандартное сечение не обеспечивает допустимый ток и потерю напряжения ≤ 5 %; "
                "принято наибольшее сечение — требуется пересмотр длины или мощности линии."
            )
        total_drop = drop + _to_decimal(request.upstream_voltage_drop_percent)
        if total_drop > _to_decimal(request.max_voltage_drop_percent):
            recommendations.append(
                "Суммарная потеря напряжения (магистраль + линия) превышает предел 5 %: "
                "уменьшите длину или увеличьте сечение."
            )
        if not breaker_ok:
            recommendations.append(
                "Нет номинала автомата, одновременно удовлетворяющего I_p ≤ I_n ≤ I_доп; проверьте сечение кабеля."
            )
        if rcd_required:
            recommendations.append(
                f"Установите УЗО/АВДТ с уставкой {rcd_ma} мА без задержки срабатывания."
            )
        recommendations.append(
            "На вводе здания предусмотрите противопожарное УЗО 100/300 мА с выдержкой времени "
            "(селективность по времени выше, чем у групповых УЗО)."
        )

        return LineSizingResponse(
            design_current_a=_round(current),
            selected_cross_section_mm2=_section_value(section),  # type: ignore[arg-type]
            permissible_current_a=float(permissible),
            voltage_drop_percent=_round(drop),
            voltage_drop_limit_percent=_round(_to_decimal(request.max_voltage_drop_percent)),
            total_voltage_drop_percent=_round(total_drop),
            breaker_rating_a=breaker,
            rcd_current_ma=rcd_ma,
            rcd_required=rcd_required,
            cable_type="ВВГнг(А)-LS",
            recommendations=recommendations,
            references=references,
            rules_version=RULES_VERSION,
        )


__all__ = [
    "RULES_VERSION",
    "CROSS_SECTIONS",
    "calculate_line_sizing",
    "design_current_a",
    "select_breaker",
    "select_cross_section",
    "voltage_drop_percent",
]
