# © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
"""Регрессионные тесты по эталонным кейсам «Золотого датасета»."""

import json
from pathlib import Path

import pytest

from app.cad_parser import parse_dxf_bytes
from app.line_sizing import calculate_line_sizing
from app.schemas import LineSizingRequest, ShortCircuitRequest
from app.short_circuit import calculate_short_circuit

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "golden-dataset"
CASES = sorted(
    path for path in FIXTURES.iterdir()
    if path.is_dir() and (path / "project.vwc").is_file()
)


@pytest.mark.parametrize("case_dir", CASES, ids=lambda path: path.name)
def test_golden_case(case_dir: Path) -> None:
    """DXF-стены, граф v2 и все расчёты совпадают с эталонным снимком."""
    expected = json.loads((case_dir / "expected_calc.json").read_text(encoding="utf-8"))

    parsed = parse_dxf_bytes((case_dir / "plan.dxf").read_bytes())
    assert parsed.units == expected["dxf"]["units"]
    assert len(parsed.walls) == expected["dxf"]["walls"]

    envelope = json.loads((case_dir / "project.vwc").read_text(encoding="utf-8"))
    assert envelope["format"] == "vwc-project"
    assert envelope["schemaVersion"] == 2
    graph = envelope["graph"]
    assert graph["schemaVersion"] == 2
    assert len(graph["walls"]) == expected["dxf"]["walls"]
    group_edges = [edge for edge in graph["edges"] if edge.get("edgeType") != "feeder_line"]
    assert len(group_edges) == expected["totals"]["groups"]
    assert len(graph["edges"]) - len(group_edges) == expected["totals"]["feederLines"]
    assert graph["stampMeta"]["projectCode"] == expected["case"]

    for record in expected["lines"].values():
        request = record["request"]
        sizing = calculate_line_sizing(
            LineSizingRequest.model_validate(
                {
                    "power_w": record["powerW"],
                    "voltage_v": request["voltageV"],
                    "phases": request["phases"],
                    "power_factor": request["powerFactor"],
                    "length_m": record["lengthM"],
                    "installation_method": request["installation"],
                    "consumer_kind": request["consumerKind"],
                    "room_type": request["roomType"],
                    "upstream_voltage_drop_percent": request.get("upstreamVoltageDropPercent", 0),
                }
            )
        )
        assert sizing.model_dump(by_alias=True, mode="json") == record["lineSizing"]

        fault = calculate_short_circuit(
            ShortCircuitRequest.model_validate(
                {
                    "transformer_power_kva": request["transformerKva"],
                    "voltage_v": 230,
                    "cable_length_m": record["lengthM"],
                    "cross_section_mm2": sizing.selected_cross_section_mm2,
                    "breaker_rating_a": sizing.breaker_rating_a,
                    "trip_curve": request["tripCurve"],
                }
            )
        )
        assert fault.model_dump(by_alias=True, mode="json") == record["shortCircuit"]


def test_golden_dataset_has_seven_cases() -> None:
    """Датасет содержит ровно семь эталонных комплектов."""
    assert len(CASES) == 7
    for case_dir in CASES:
        assert (case_dir / "plan.dxf").is_file()
        assert (case_dir / "project.vwc").is_file()
        assert (case_dir / "expected_calc.json").is_file()


def test_multipanel_case_has_cascade_and_tcc() -> None:
    """Кейс 07 фиксирует каскадное ΔU и результат расчёта ВТХ."""
    expected = json.loads(
        (FIXTURES / "07_twostory_house_vru_shr" / "expected_calc.json").read_text(encoding="utf-8")
    )
    graph = json.loads(
        (FIXTURES / "07_twostory_house_vru_shr" / "project.vwc").read_text(encoding="utf-8")
    )["graph"]

    assert any(edge.get("edgeType") == "feeder_line" for edge in graph["edges"])
    assert any(node.get("panelRole") == "main_vru" for node in graph["nodes"])
    assert any(node.get("panelRole") == "sub_shr" for node in graph["nodes"])
    assert expected["cascade"]["totalVoltageDropPercent"] <= 5
    assert expected["selectivityTcc"]["status"] in ("full", "partial", "none")
