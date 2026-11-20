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
    request: AutoPanelRequest, room_types: dict[str, RoomType], three_phase: bool = False
) -> list[dict[str, object]]:
    """Группирует потребителей по помещениям и выделяет мощные линии.

    При трёхфазном вводе мощный прибор (> 2 кВт) делится на три
    пофазные подгруппы — это позволяет добиться перекоса ≤ 15 % (KI-007).
    """
    grouped: dict[tuple[str, str], list[AutoPanelNode]] = defaultdict(list)
    result: list[dict[str, object]] = []

    for node in request.nodes:
        kind = _CONSUMER_KIND_BY_NODE.get(node.kind)
        if kind is None or node.specs.rated_power <= 0:
            continue

        room_id = node.room_id
        if node.specs.rated_power > _POWERFUL_THRESHOLD_W:
            if three_phase:
                per_phase = _to_decimal(node.specs.rated_power) / Decimal(3)
                for phase in _PHASES:
                    result.append(
                        {
                            "name": f"{node.label} — {phase}",
                            "room_id": room_id,
                            "kind": kind,
                            "nodes": [
                                node.model_copy(
                                    update={
                                        "specs": node.specs.model_copy(
                                            update={"rated_power": float(per_phase)}
                                        )
                                    }
                                )
                            ],
                            "powerful": True,
                        }
                    )
            else:
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


def _imbalance_percent(loads: dict[str, Decimal]) -> Decimal:
    """Перекос по формуле (I_max − I_min)/I_max × 100 % (ПУЭ, KI-007)."""
    values = list(loads.values())
    peak = max(values)
    return (peak - min(values)) / peak * Decimal(100) if peak > 0 else Decimal(0)


def _balance_phases(
    groups: list[dict[str, object]], phase_count: int
) -> tuple[dict[str, list[dict[str, object]]], float]:
    """Распределяет группы по фазам и минимизирует перекос.

    Для однофазного ввода все группы идут на L1. Для трёхфазного —
    детерминированный LPT-алгоритм с последующим локальным поиском
    переноса группы с наиболее загруженной фазы на наименее загруженную.
    """
    assignment: dict[str, list[dict[str, object]]] = {phase: [] for phase in _PHASES}
    if phase_count == 1:
        assignment["L1"] = sorted(groups, key=lambda item: str(item["name"]))
        return assignment, 0.0

    loads: dict[str, Decimal] = {phase: Decimal(0) for phase in _PHASES}
    for group in sorted(groups, key=lambda item: (-_to_decimal(item["total_power_w"]), str(item["name"]))):
        phase = min(_PHASES, key=lambda name: (loads[name], _PHASES.index(name)))
        assignment[phase].append(group)
        loads[phase] += _to_decimal(group["total_power_w"])

    # Локальный поиск: переносим группу с максимума на минимум, если перекос падает.
    for _ in range(100):
        current = _imbalance_percent(loads)
        heavy = max(_PHASES, key=lambda name: (loads[name], -_PHASES.index(name)))
        light = min(_PHASES, key=lambda name: (loads[name], _PHASES.index(name)))
        if heavy == light or not assignment[heavy]:
            break
        best_index: int | None = None
        best_value = current
        for index, group in enumerate(assignment[heavy]):
            power = _to_decimal(group["total_power_w"])
            trial = dict(loads)
            trial[heavy] -= power
            trial[light] += power
            value = _imbalance_percent(trial)
            if value < best_value:
                best_value = value
                best_index = index
        if best_index is None:
            break
        moved = assignment[heavy].pop(best_index)
        assignment[light].append(moved)
        loads[heavy] -= _to_decimal(moved["total_power_w"])
        loads[light] += _to_decimal(moved["total_power_w"])

    return assignment, _round(_imbalance_percent(loads))


def auto_assemble_panel(request: AutoPanelRequest) -> AutoPanelResponse:
    """Возвращает детерминированный проект щита НКУ для переданного графа."""
    with localcontext() as context:
        context.prec = _CONTEXT_PRECISION

        room_types = _room_type_by_id(request.rooms)
        supply = request.supply
        three_phase = supply.phases == 3 or supply.supply_topology == "3P_400V"
        panel_poles = supply.panel_poles or (4 if three_phase else 2)
        phase_count = 3 if three_phase else 1
        groups = _build_groups(request, room_types, three_phase)

        for index, group in enumerate(groups, start=1):
            nodes: list[AutoPanelNode] = group["nodes"]  # type: ignore[assignment]
            total_power = sum((_to_decimal(node.specs.rated_power) for node in nodes), Decimal(0))
            room_id = group["room_id"]
            room_type = room_types.get(room_id) if isinstance(room_id, str) else None
            consumer_kind = group["kind"]
            # Мощные трёхфазные потребители (электрокотёл, варочная панель)
            # рассчитываются линейным током 400 В; остальные — 230 В.
            group_phases = 3 if three_phase and total_power > _POWERFUL_THRESHOLD_W else 1
            group_voltage = 400 if group_phases == 3 else 230
            sizing_request = LineSizingRequest(
                power_w=float(total_power),
                voltage_v=group_voltage,
                phases=group_phases,
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

        assignment, imbalance = _balance_phases(groups, phase_count)

        modules: list[PanelModule] = []
        next_slot = 1
        if three_phase:
            incoming_modules = [
                ("panel", "Вводной щит НКУ", panel_poles),
                ("circuit_breaker", f"Вводной автомат {panel_poles}P", panel_poles),
                ("relay_voltage", "Реле напряжения 3-фазное", 3),
                ("rcd", "Противопожарное УЗО 4P тип S, 100 мА", 4),
            ]
        else:
            incoming_modules = [
                ("panel", "Вводной щит НКУ", 2),
                ("rcd", "Противопожарное УЗО 2P, 100 мА", 2),
            ]
        for kind, label, width in incoming_modules:
            modules.append(
                PanelModule(
                    kind=kind,
                    label=label,
                    din_modules=width,
                    panel_slot=next_slot,
                    group_id=None,
                )
            )
            next_slot += 1

        for phase in _PHASES:
            for group in assignment[phase]:
                module_kind = "rcbo" if _to_decimal(group["rcd_current_ma"]) > 0 else "circuit_breaker"
                group_width = _MODULE_WIDTH[module_kind]
                if three_phase and _to_decimal(group["total_power_w"]) > _POWERFUL_THRESHOLD_W:
                    group_width = 3
                group["panel_slot"] = next_slot
                modules.append(
                    PanelModule(
                        kind=module_kind,
                        label=str(group["name"]),
                        din_modules=group_width,
                        panel_slot=next_slot,
                        group_id=str(group["id"]),
                    )
                )
                next_slot += 1

        warnings: list[str] = []
        if request.target_panel_id is not None:
            warnings.append(f"Сборка выполнена для щита {request.target_panel_id}")
        references: set[str] = {"PUE-RCD-FIRE-100"}
        if three_phase and imbalance > _MAX_IMBALANCE_PERCENT:
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
