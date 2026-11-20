# © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
"""Детерминированный расчёт контура заземления и стержневой молниезащиты.

Формулы и константы: ``docs/domain/GROUNDING_AND_3PHASE_SC_V09.md``
(ПУЭ-7 гл. 1.7, СО 153-34.21.122-2003). Все вычисления в ``Decimal``,
LLM не участвует (RULES § 5.1).
"""

from decimal import Decimal, ROUND_HALF_UP, localcontext

from .schemas import GroundingLightningRequest, GroundingLightningResponse

_CONTEXT_PRECISION = 40
_QUANTUM = Decimal("0.001")
_PI = Decimal("3.14159265358979323846264338327950288419716939937510")

# Удельное сопротивление грунта ρ, Ом·м: (влажный, сухой).
_SOIL_RESISTIVITY: dict[str, tuple[Decimal, Decimal]] = {
    "clay": (Decimal("10"), Decimal("20")),
    "loam": (Decimal("20"), Decimal("50")),
    "chernozem": (Decimal("20"), Decimal("50")),
    "sand": (Decimal("100"), Decimal("300")),
    "gravel": (Decimal("100"), Decimal("300")),
    "rock": (Decimal("500"), Decimal("1000")),
}
_SOIL_REFERENCE: dict[str, str] = {
    "clay": "GR-SOIL-CLAY",
    "loam": "GR-SOIL-LOAM",
    "chernozem": "GR-SOIL-CHERNOZEM",
    "sand": "GR-SOIL-SAND",
    "gravel": "GR-SOIL-GRAVEL",
    "rock": "GR-SOIL-ROCK",
}
# Сезонные коэффициенты по глубине заложения.
_SEASONAL: tuple[tuple[Decimal, Decimal, str], ...] = (
    (Decimal("0.5"), Decimal("2.0"), "GR-SEASON-05"),
    (Decimal("0.7"), Decimal("1.5"), "GR-SEASON-07"),
    (Decimal("1.0"), Decimal("1.3"), "GR-SEASON-10"),
    (Decimal("1.5"), Decimal("1.1"), "GR-SEASON-15"),
    (Decimal("2.0"), Decimal("1.0"), "GR-SEASON-20"),
)
_RULES_VERSION = "0.1"


def _to_decimal(value: float | int | Decimal) -> Decimal:
    """Преобразует число через строку, не внося бинарный шум ``float``."""
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _round(value: Decimal) -> float:
    """Округляет значение до 3 знаков."""
    if value == 0:
        return 0.0
    return float(value.quantize(_QUANTUM, rounding=ROUND_HALF_UP))


def _seasonal_factor(depth: Decimal) -> tuple[Decimal, str]:
    """Возвращает сезонный коэффициент для глубины (ближайшая строка таблицы)."""
    for limit, factor, reference in _SEASONAL:
        if depth <= limit:
            return factor, reference
    return _SEASONAL[-1][1], _SEASONAL[-1][2]


def calculate_grounding_lightning(
    request: GroundingLightningRequest,
) -> GroundingLightningResponse:
    """Рассчитывает сопротивление ЗУ и зону стержневой молниезащиты."""
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION

        warnings: list[str] = []
        references: list[str] = []
        soil = request.soil_type or "sand"
        if request.soil_resistivity_ohm_m is not None:
            rho = _to_decimal(request.soil_resistivity_ohm_m)
            references.append("GR-SOIL-EXPLICIT")
        else:
            if request.soil_type is None:
                warnings.append("Тип грунта не задан: использован консервативный влажный песок")
            wet, dry = _SOIL_RESISTIVITY[soil]
            rho = wet if request.soil_moisture == "wet" else dry
            references.append(_SOIL_REFERENCE[soil])

        depth = _to_decimal(request.burial_depth_m)
        seasonal, season_ref = _seasonal_factor(depth)
        references.append(season_ref)
        rho_design = rho * seasonal

        rod_length = _to_decimal(request.vertical_electrode_length_m)
        rod_diameter = _to_decimal(request.vertical_electrode_diameter_m)
        if rod_diameter >= Decimal("4") * rod_length:
            raise ValueError("Диаметр электрода слишком велик относительно длины")
        resistance_vertical = rho_design / (Decimal(2) * _PI * rod_length) * (
            (Decimal(4) * rod_length / rod_diameter).ln()
        )

        strip_length = _to_decimal(request.horizontal_strip_length_m)
        if strip_length > 0:
            strip_width = _to_decimal(request.horizontal_strip_width_m)
            resistance_horizontal = rho_design / (_PI * strip_length) * (
                (Decimal(2) * strip_length / (strip_width * depth)).ln()
            )
            references.append("GR-HORIZONTAL-STRIP")
        else:
            resistance_horizontal = Decimal(0)

        count = request.vertical_electrodes_count
        # Коэффициент использования группы: 0,75 по умолчанию; 0,9 для одиночного.
        utilization = Decimal("0.9") if count == 1 else Decimal("0.75")
        references.append("GR-UTILIZATION")

        vertical_conductance = Decimal(count) * utilization / resistance_vertical
        horizontal_conductance = (
            utilization / resistance_horizontal if resistance_horizontal > 0 else Decimal(0)
        )
        conductance = vertical_conductance + horizontal_conductance
        if conductance <= 0:
            raise ValueError("Контур заземления не имеет проводимости")
        resistance_grounding = Decimal(1) / conductance

        required = _to_decimal(request.required_resistance_ohm)
        grounding_ok = resistance_grounding <= required
        references.append("PUE-GR-4" if required <= Decimal("4") else "PUE-GR-10")
        if not grounding_ok:
            warnings.append(
                f"R_ЗУ {_round(resistance_grounding)} Ом превышает {_round(required)} Ом: "
                "увеличьте число или длину заземлителей"
            )

        height = _to_decimal(request.building_height_m) + _to_decimal(request.lightning_rod_height_m)
        protection_height = _to_decimal(request.protection_height_m)
        if protection_height > height:
            warnings.append("Расчётная высота точки больше высоты молниеотвода: радиус принят нулевым")
            radius = Decimal(0)
        else:
            radius = Decimal("1.5") * (height - protection_height)
        zone_type = "A" if height <= Decimal("30") else "B"
        lightning_ok = request.lightning_rod_height_m > 0 and radius > 0
        references.append("SO-LIGHT-10")
        if not lightning_ok:
            warnings.append("Молниеотвод не обеспечивает положительный радиус зоны защиты")

        return GroundingLightningResponse(
            design_resistivity_ohm_m=_round(rho_design),
            seasonal_factor=_round(seasonal),
            vertical_electrode_resistance_ohm=_round(resistance_vertical),
            horizontal_strip_resistance_ohm=_round(resistance_horizontal),
            utilization_factor=_round(utilization),
            grounding_resistance_ohm=_round(resistance_grounding),
            required_resistance_ohm=_round(required),
            grounding_compliant=grounding_ok,
            protection_radius_m=_round(radius),
            protection_zone_type=zone_type,
            lightning_compliant=lightning_ok,
            warnings=warnings,
            references=sorted(set(references)),
            rules_version=_RULES_VERSION,
        )


__all__ = ["calculate_grounding_lightning"]
