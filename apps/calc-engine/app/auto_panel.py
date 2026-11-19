# © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
"""Детерминированная автосборка щита НКУ из узлов плана.

Алгоритм: группировка розеток и света по помещениям, выделение мощных
потребителей (> 2000 Вт) на отдельные линии, жадная балансировка фаз
L1/L2/L3 и расстановка модулей на DIN-рейке с +20 % резерва места.
Математика выполняется в ``Decimal`` (RULES § 5.1).
"""

from collections import defaultdict
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP, localcontext

from .line_sizing import (
    RULES_VERSION,
    _section_value,
    calculate_line_sizing,
    select_breaker,
    select_cross_section,
)
from .schemas import (
    AutoPanelNode,
    AutoPanelRequest,
    AutoPanelResponse,
    AutoPanelRoom,
    ConsumerKind,
    LineSizingRequest,
    PanelGroup,
    PanelModule,
    PhaseLoad,
    PhaseLoads,
    RoomType,
)

_CONTEXT_PRECISION = 40
_QUANTUM = Decimal("0.001")
_PHASE_VOLTAGE = Decimal("230")
_ASSUMED_COS_PHI = Decimal("0.95")
_POWERFUL_THRESHOLD_W = Decimal("2000")
_PHASES = ("L1", "L2", "L3")
_RESERVE_FACTOR = Decimal("1.2")
_MAX_IMBALANCE_PERCENT = Decimal("15")

# Соответствие типов УГО графа видам потребителей для выбора УЗО.
_CONSUMER_KIND_BY_NODE: dict[str, ConsumerKind] = {
    "socket": "socket",
    "light_fixture": "light",
    "appliance": "appliance",
    "other": "other",
    "load": "appliance",
}

# Число 18-мм модулей, занимаемых устройством на DIN-рейке.
_MODULE_WIDTH = {
    "panel": 2,
    "circuit_breaker": 1,
    "rcd": 2,
    "rcbo": 3,
}


def _to_decimal(value: float | int | Decimal) -> Decimal:
    """Преобразует число через строку, не внося бинарный шум ``float``."""
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _round(value: Decimal) -> float:
    """Округляет значение до 3 знаков и убирает отрицательный ноль."""
    if value == 0:
        return 0.0
    return float(value.quantize(_QUANTUM, rounding=ROUND_HALF_UP))


def _room_type_by_id(rooms: list[AutoPanelRoom]) -> dict[str, RoomType]:
    """Строит поиск типа помещения по идентификатору."""
    return {room.id: room.type for room in rooms}


def _build_groups(
    request: AutoPanelRequest, room_types: dict[str, RoomType]
) -> list[dict[str, object]]:
    """Группирует потребителей по помещениям и выделяет мощные линии."""
    grouped: dict[tuple[str, str], list[AutoPanelNode]] = defaultdict(list)
    result: list[dict[str, object]] = []

    for node in request.nodes:
        kind = _CONSUMER_KIND_BY_NODE.get(node.kind)
        if kind is None or node.specs.rated_power <= 0:
            continue

        room_id = node.room_id
        if node.specs.rated_power > _POWERFUL_THRESHOLD_W:
            result.append(
                {
                    "name": node.label,
                    "room_id": room_id,
                    "kind": kind,
                    "nodes": [node],
                    "powerful": True,
                }
            )
            continue

        category = "socket" if kind == "socket" else "light"
        key = (room_id or "common", category)
        grouped[key].append(node)

    for (room_id, category), nodes in grouped.items():
        result.append(
            {
                "name": f"{'Розетки' if category == 'socket' else 'Свет'} — "
                f"{(room_id or 'общая группа')}",
                "room_id": None if room_id == "common" else room_id,
                "kind": "socket" if category == "socket" else "light",
                "nodes": nodes,
                "powerful": False,
            }
        )
    return result


def _balance_phases(groups: list[dict[str, object]]) -> tuple[dict[str, list[dict[str, object]]], float]:
    """Распределяет группы по фазам жадным методом и считает перекос."""
    loads: dict[str, Decimal] = {phase: Decimal(0) for phase in _PHASES}
    assignment: dict[str, list[dict[str, object]]] = {phase: [] for phase in _PHASES}

    for group in sorted(groups, key=lambda item: (-_to_decimal(item["total_power_w"]), str(item["name"]))):
        phase = min(_PHASES, key=lambda name: (loads[name], _PHASES.index(name)))
        assignment[phase].append(group)
        loads[phase] += _to_decimal(group["total_power_w"])

    values = list(loads.values())
    peak = max(values)
    imbalance = (peak - min(values)) / peak * Decimal(100) if peak > 0 else Decimal(0)
    return assignment, _round(imbalance)


def auto_assemble_panel(request: AutoPanelRequest) -> AutoPanelResponse:
    """Возвращает детерминированный проект щита НКУ для переданного графа."""
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION

        room_types = _room_type_by_id(request.rooms)
        groups = _build_groups(request, room_types)

        for index, group in enumerate(groups, start=1):
            nodes: list[AutoPanelNode] = group["nodes"]  # type: ignore[assignment]
            total_power = sum((_to_decimal(node.specs.rated_power) for node in nodes), Decimal(0))
            room_id = group["room_id"]
            room_type = room_types.get(room_id) if isinstance(room_id, str) else None
            consumer_kind = group["kind"]
            sizing_request = LineSizingRequest(
                power_w=float(total_power),
                voltage_v=230,
                phases=1,
                power_factor=float(_ASSUMED_COS_PHI),
                length_m=1.0,
                consumer_kind=consumer_kind,  # type: ignore[arg-type]
                room_type=room_type,
            )
            current = _to_decimal(calculate_line_sizing(sizing_request).design_current_a)
            section, _, _ = select_cross_section(sizing_request, current)
            breaker, _ = select_breaker(current, section)
            rcd_ma = calculate_line_sizing(sizing_request).rcd_current_ma
            group.update(
                {
                    "id": f"GROUP-{index:02d}",
                    "total_power_w": _round(total_power),
                    "design_current_a": _round(current),
                    "cross_section_mm2": _section_value(section),
                    "breaker_rating_a": breaker,
                    "rcd_current_ma": rcd_ma,
                    "consumer_ids": [node.id for node in nodes],
                }
            )

        assignment, imbalance = _balance_phases(groups)

        modules: list[PanelModule] = []
        next_slot = 1
        for kind, label in (
            ("panel", "Вводной щит НКУ"),
            ("rcd", "Противопожарное УЗО 100 мА"),
        ):
            modules.append(
                PanelModule(
                    kind=kind,
                    label=label,
                    din_modules=_MODULE_WIDTH[kind],
                    panel_slot=next_slot,
                    group_id=None,
                )
            )
            next_slot += 1

        for phase in _PHASES:
            for group in assignment[phase]:
                module_kind = "rcbo" if _to_decimal(group["rcd_current_ma"]) > 0 else "circuit_breaker"
                group["panel_slot"] = next_slot
                modules.append(
                    PanelModule(
                        kind=module_kind,
                        label=str(group["name"]),
                        din_modules=_MODULE_WIDTH[module_kind],
                        panel_slot=next_slot,
                        group_id=str(group["id"]),
                    )
                )
                next_slot += 1

        warnings: list[str] = []
        references: set[str] = {"PUE-RCD-FIRE-100"}
        if imbalance > _MAX_IMBALANCE_PERCENT:
            warnings.append(
                f"Перекос фаз {imbalance:g} % превышает 15 %: перераспределите потребители между L1/L2/L3."
            )
            references.add("PUE-3PHASE-IMBALANCE-15")

        used_modules = sum(module.din_modules for module in modules)
        enclosure_modules = int((Decimal(used_modules) * _RESERVE_FACTOR).to_integral_value(rounding=ROUND_CEILING))

        phase_loads = PhaseLoads(
            l1=PhaseLoad(
                power_w=_round(
                    sum((_to_decimal(g["total_power_w"]) for g in assignment["L1"]), Decimal(0))
                ),
                current_a=_round(
                    sum((_to_decimal(g["design_current_a"]) for g in assignment["L1"]), Decimal(0))
                ),
            ),
            l2=PhaseLoad(
                power_w=_round(
                    sum((_to_decimal(g["total_power_w"]) for g in assignment["L2"]), Decimal(0))
                ),
                current_a=_round(
                    sum((_to_decimal(g["design_current_a"]) for g in assignment["L2"]), Decimal(0))
                ),
            ),
            l3=PhaseLoad(
                power_w=_round(
                    sum((_to_decimal(g["total_power_w"]) for g in assignment["L3"]), Decimal(0))
                ),
                current_a=_round(
                    sum((_to_decimal(g["design_current_a"]) for g in assignment["L3"]), Decimal(0))
                ),
            ),
        )

        panel_groups = [
            PanelGroup(
                id=str(group["id"]),
                name=str(group["name"]),
                room_id=group["room_id"],  # type: ignore[arg-type]
                phase=phase,
                consumer_ids=group["consumer_ids"],  # type: ignore[arg-type]
                total_power_w=group["total_power_w"],  # type: ignore[arg-type]
                design_current_a=group["design_current_a"],  # type: ignore[arg-type]
                cross_section_mm2=group["cross_section_mm2"],  # type: ignore[arg-type]
                breaker_rating_a=group["breaker_rating_a"],  # type: ignore[arg-type]
                rcd_current_ma=group["rcd_current_ma"],  # type: ignore[arg-type]
                panel_slot=group["panel_slot"],  # type: ignore[arg-type]
            )
            for phase in _PHASES
            for group in assignment[phase]
        ]

        return AutoPanelResponse(
            groups=panel_groups,
            phase_loads=phase_loads,
            imbalance_percent=imbalance,
            modules=modules,
            used_din_modules=used_modules,
            enclosure_modules=enclosure_modules,
            warnings=warnings,
            references=sorted(references),
            rules_version=RULES_VERSION,
        )


__all__ = ["auto_assemble_panel"]
