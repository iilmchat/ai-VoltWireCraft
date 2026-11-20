# © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
"""Генератор воспроизводимого «Золотого датасета» VoltWireCraft.

Скрипт создаёт три эталонных кейса: DXF-план (ezdxf), граф `.vwc` версии 2
и JSON-снимок ожидаемых расчётов `calc-engine`. Все идентификаторы
детерминированы (UUID v5), случайных значений нет.
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path
from typing import Any

import ezdxf

ROOT = Path(__file__).resolve().parents[1]
CALC_ENGINE = ROOT / "apps" / "calc-engine"
FIXTURES = ROOT / "fixtures" / "golden-dataset"
sys.path.insert(0, str(CALC_ENGINE))

from app.cad_parser import parse_dxf_bytes  # noqa: E402
from app.line_sizing import calculate_line_sizing  # noqa: E402
from app.schemas import LineSizingRequest, ShortCircuitRequest  # noqa: E402
from app.short_circuit import calculate_short_circuit  # noqa: E402

SAVED_AT = "2026-11-20T00:00:00.000Z"
NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
MM_PER_M = 1000


def uid(case: str, name: str) -> str:
    """Детерминированный UUID v5 для элемента эталонного проекта."""
    return str(uuid.uuid5(NAMESPACE, f"vwc:{case}:{name}"))


def make_plan_dxf(walls: list[tuple[str, tuple[float, float], tuple[float, float]]]) -> bytes:
    """Создаёт DXF со слоями стен/перегородок; координаты в миллиметрах."""
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 4  # миллиметры
    model = document.modelspace()
    for layer, start, end in walls:
        model.add_line(
            (start[0] * MM_PER_M, start[1] * MM_PER_M),
            (end[0] * MM_PER_M, end[1] * MM_PER_M),
            dxfattribs={"layer": layer},
        )
    from io import StringIO

    stream = StringIO()
    document.write(stream)
    return stream.getvalue().encode("utf-8")


def line_request(case: dict[str, Any], group: dict[str, Any], cross_section: float, breaker: int) -> Any:
    """Собирает запрос расчёта линии для эталонной группы."""
    return LineSizingRequest.model_validate(
        {
            "power_w": group["powerW"],
            "voltage_v": case["voltageV"],
            "phases": case["phases"],
            "power_factor": 0.95,
            "length_m": group["lengthM"],
            "installation_method": group.get("installation", "conduit"),
            "consumer_kind": group["consumerKind"],
            "room_type": group.get("roomType"),
        }
    )


def short_request(case: dict[str, Any], group: dict[str, Any], sizing: Any) -> Any:
    """Собирает запрос расчёта КЗ по результату подбора линии."""
    return ShortCircuitRequest.model_validate(
        {
            "transformer_power_kva": case["transformerKva"],
            "transformer_uk_percent": 4.5,
            "voltage_v": 230,
            "cable_length_m": group["lengthM"],
            "cross_section_mm2": sizing.selected_cross_section_mm2,
            "breaker_rating_a": sizing.breaker_rating_a,
            "trip_curve": group.get("tripCurve", "C"),
        }
    )


def build_graph(case: dict[str, Any], walls: list[dict[str, Any]]) -> dict[str, Any]:
    """Собирает граф проекта версии 2 с узлами и кабельными линиями."""
    case_id = case["id"]
    nodes: list[dict[str, Any]] = [
        {
            "id": uid(case_id, "panel"),
            "kind": "panel",
            "label": "Щит НКУ",
            "planPosition": {"x": 0, "y": 0},
            "panelSlot": 1,
            "specs": {"ratedPower": 0, "ratedCurrent": case["incomingA"], "crossSection": 16, "mountingHeight": 1.5},
            "catalogDeviceId": None,
        }
    ]
    if case.get("masterSwitch"):
        nodes.extend(
            [
                {
                    "id": uid(case_id, "master"),
                    "kind": "switch",
                    "label": "Мастер-выключатель",
                    "planPosition": None,
                    "panelSlot": 2,
                    "specs": {"ratedPower": 0, "ratedCurrent": case["incomingA"], "crossSection": 10, "mountingHeight": 0},
                    "catalogDeviceId": None,
                },
                {
                    "id": uid(case_id, "contactor"),
                    "kind": "contactor",
                    "label": "Контактор (неотключаемые линии)",
                    "planPosition": None,
                    "panelSlot": 3,
                    "specs": {"ratedPower": 0, "ratedCurrent": 25, "crossSection": 6, "mountingHeight": 0},
                    "catalogDeviceId": None,
                },
            ]
        )

    edges: list[dict[str, Any]] = []
    for index, group in enumerate(case["groups"], start=1):
        node_id = uid(case_id, f"node-{index}")
        nodes.append(
            {
                "id": node_id,
                "kind": group["nodeKind"],
                "label": group["label"],
                "planPosition": {"x": float(index), "y": float(index % 3)},
                "panelSlot": None,
                "roomId": uid(case_id, f"room-{index}") if group.get("roomType") else None,
                "specs": {
                    "ratedPower": group["powerW"],
                    "ratedCurrent": 16,
                    "crossSection": 2.5,
                    "mountingHeight": 0.3,
                },
                "catalogDeviceId": None,
            }
        )
        edges.append(
            {
                "id": uid(case_id, f"edge-{index}"),
                "from": uid(case_id, "panel"),
                "to": node_id,
                "cableSpecs": {
                    "crossSection": 2.5,
                    "conductorCount": 3,
                    "material": "cu",
                    "length": group["lengthM"],
                },
                "waypointsM": [
                    {"x": 0, "y": 0},
                    {"x": float(index), "y": float(index % 3)},
                ],
                "edgeType": "cable_line",
                "cableBrand": "ВВГнг(А)-LS",
            }
        )

    rooms = [
        {
            "id": uid(case_id, f"room-{index}"),
            "name": group["label"],
            "type": group["roomType"],
            "polygon": [
                {"x": 0, "y": 0},
                {"x": 2, "y": 0},
                {"x": 2, "y": 2},
            ],
        }
        for index, group in enumerate(case["groups"], start=1)
        if group.get("roomType")
    ]

    return {
        "schemaVersion": 2,
        "id": uid(case_id, "project"),
        "name": case["title"],
        "floorPlan": {"background": None, "scaleMetersPerPx": 0.01, "ceilingHeightM": 2.7},
        "rooms": rooms,
        "walls": walls,
        "nodes": nodes,
        "edges": edges,
        "stampMeta": {
            "projectCode": case_id,
            "organizationName": "VoltWireCraft",
            "stage": "РД",
        },
    }


def build_expected(case: dict[str, Any], dxf: bytes) -> dict[str, Any]:
    """Прогоняет все группы через calc-engine и фиксирует эталонные результаты."""
    parsed = parse_dxf_bytes(dxf)
    lines: dict[str, Any] = {}
    for index, group in enumerate(case["groups"], start=1):
        sizing = calculate_line_sizing(line_request(case, group, 2.5, 16))
        fault = calculate_short_circuit(short_request(case, group, sizing))
        lines[f"group-{index:02d}"] = {
            "label": group["label"],
            "powerW": group["powerW"],
            "lengthM": group["lengthM"],
            "request": {
                "voltageV": case["voltageV"],
                "phases": case["phases"],
                "powerFactor": 0.95,
                "consumerKind": group["consumerKind"],
                "roomType": group.get("roomType"),
                "installation": group.get("installation", "conduit"),
                "tripCurve": group.get("tripCurve", "C"),
                "transformerKva": case["transformerKva"],
            },
            "lineSizing": sizing.model_dump(by_alias=True, mode="json"),
            "shortCircuit": fault.model_dump(by_alias=True, mode="json"),
        }

    return {
        "case": case["id"],
        "schemaVersion": 2,
        "supply": {
            "voltageV": case["voltageV"],
            "phases": case["phases"],
            "transformerKva": case["transformerKva"],
            "incomingA": case["incomingA"],
        },
        "dxf": {"walls": len(parsed.walls), "units": parsed.units},
        "lines": lines,
        "totals": {
            "groups": len(case["groups"]),
            "powerW": sum(group["powerW"] for group in case["groups"]),
        },
    }


CASES: list[dict[str, Any]] = [
    {
        "id": "01_studio_230v",
        "dir": "01_studio_230v",
        "title": "Студия 1-комнатная, 230 В",
        "voltageV": 230,
        "phases": 1,
        "transformerKva": 63,
        "incomingA": 40,
        "masterSwitch": False,
        "walls": [
            ("WALLS", (0, 0), (6, 0)),
            ("WALLS", (6, 0), (6, 4)),
            ("WALLS", (6, 4), (0, 4)),
            ("WALLS", (0, 4), (0, 0)),
            ("PARTITIONS", (3, 0), (3, 4)),
        ],
        "groups": [
            {"label": "Свет", "nodeKind": "light_fixture", "powerW": 200, "lengthM": 10, "consumerKind": "light", "roomType": "living"},
            {"label": "Розетки", "nodeKind": "socket", "powerW": 1000, "lengthM": 12, "consumerKind": "socket", "roomType": "living"},
            {"label": "Кухня", "nodeKind": "socket", "powerW": 2000, "lengthM": 12, "consumerKind": "socket", "roomType": "kitchen"},
            {"label": "Санузел УЗО 30 мА", "nodeKind": "socket", "powerW": 1500, "lengthM": 10, "consumerKind": "socket", "roomType": "wet"},
            {"label": "Стиральная машина", "nodeKind": "appliance", "powerW": 2200, "lengthM": 12, "consumerKind": "appliance", "roomType": "wet"},
        ],
    },
    {
        "id": "02_apartment_3room_400v",
        "dir": "02_apartment_3room_400v",
        "title": "Квартира 3-комнатная, 400 В",
        "voltageV": 400,
        "phases": 3,
        "transformerKva": 100,
        "incomingA": 63,
        "masterSwitch": True,
        "walls": [
            ("WALLS", (0, 0), (9, 0)),
            ("WALLS", (9, 0), (9, 6)),
            ("WALLS", (9, 6), (0, 6)),
            ("WALLS", (0, 6), (0, 0)),
            ("PARTITIONS", (3, 0), (3, 6)),
            ("PARTITIONS", (6, 0), (6, 6)),
        ],
        "groups": [
            {"label": "Варочная панель", "nodeKind": "appliance", "powerW": 7200, "lengthM": 15, "consumerKind": "appliance", "roomType": "kitchen"},
            {"label": "Духовой шкаф", "nodeKind": "appliance", "powerW": 3500, "lengthM": 12, "consumerKind": "appliance", "roomType": "kitchen"},
            {"label": "Кондиционер 1", "nodeKind": "appliance", "powerW": 2000, "lengthM": 10, "consumerKind": "other", "roomType": "living"},
            {"label": "Кондиционер 2", "nodeKind": "appliance", "powerW": 2000, "lengthM": 10, "consumerKind": "other", "roomType": "living"},
            {"label": "Освещение", "nodeKind": "light_fixture", "powerW": 400, "lengthM": 12, "consumerKind": "light", "roomType": "living"},
            {"label": "Розетки", "nodeKind": "socket", "powerW": 1500, "lengthM": 12, "consumerKind": "socket", "roomType": "living"},
            {"label": "Холодильник и роутер", "nodeKind": "socket", "powerW": 300, "lengthM": 8, "consumerKind": "socket", "roomType": "kitchen"},
        ],
    },
    {
        "id": "03_house_bath_long_line",
        "dir": "03_house_bath_long_line",
        "title": "Дом ИЖС с баней, линия 80 м",
        "voltageV": 400,
        "phases": 3,
        "transformerKva": 100,
        "incomingA": 63,
        "masterSwitch": False,
        "walls": [
            ("WALLS", (0, 0), (10, 0)),
            ("WALLS", (10, 0), (10, 7)),
            ("WALLS", (10, 7), (0, 7)),
            ("WALLS", (0, 7), (0, 0)),
            ("PARTITIONS", (7, 0), (7, 7)),
        ],
        "groups": [
            {"label": "Освещение", "nodeKind": "light_fixture", "powerW": 300, "lengthM": 10, "consumerKind": "light", "roomType": "living"},
            {"label": "Розетки дома", "nodeKind": "socket", "powerW": 1000, "lengthM": 12, "consumerKind": "socket", "roomType": "living"},
            {"label": "Линия бани 80 м", "nodeKind": "appliance", "powerW": 6000, "lengthM": 80, "consumerKind": "appliance", "roomType": "wet", "tripCurve": "B", "installation": "air"},
            {"label": "Линия бани (кривая C)", "nodeKind": "appliance", "powerW": 6000, "lengthM": 80, "consumerKind": "appliance", "roomType": "wet", "tripCurve": "C", "installation": "air"},
        ],
    },
]


def main() -> None:
    """Генерирует все эталонные комплекты в `fixtures/golden-dataset`."""
    FIXTURES.mkdir(parents=True, exist_ok=True)
    for case in CASES:
        directory = FIXTURES / case["dir"]
        directory.mkdir(parents=True, exist_ok=True)
        dxf = make_plan_dxf(case["walls"])
        (directory / "plan.dxf").write_bytes(dxf)

        expected = build_expected(case, dxf)
        walls = parse_dxf_bytes(dxf).walls
        wall_records = [
            {
                "id": uid(case["id"], f"wall-{index}"),
                "kind": wall.kind,
                "path": [{"x": point.x, "y": point.y} for point in wall.path],
                "thickness": wall.thickness,
            }
            for index, wall in enumerate(walls, start=1)
        ]
        graph = build_graph(case, wall_records)
        (directory / "project.vwc").write_text(
            json.dumps(
                {
                    "format": "vwc-project",
                    "schemaVersion": 2,
                    "graph": graph,
                    "savedAt": SAVED_AT,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        (directory / "expected_calc.json").write_text(
            json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Сгенерирован кейс {case['id']}: {len(wall_records)} стен, {len(expected['lines'])} линий")


if __name__ == "__main__":
    main()
