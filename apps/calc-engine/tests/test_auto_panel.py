# © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
"""Тесты детерминированной автосборки щита НКУ."""

import json
import math

import pytest
from fastapi.testclient import TestClient

from app.auto_panel import auto_assemble_panel
from app.main import app
from app.schemas import AutoPanelRequest

client = TestClient(app)

KITCHEN = "11111111-1111-4111-8111-111111111111"
LIVING = "22222222-2222-4222-8222-222222222222"
BATH = "33333333-3333-4333-8333-333333333333"


def _node(
    node_id: str,
    kind: str,
    label: str,
    power_w: float,
    room_id: str | None = None,
) -> dict[str, object]:
    """Собирает узел графа с номинальными параметрами."""
    return {
        "id": node_id,
        "kind": kind,
        "label": label,
        "planPosition": {"x": 1, "y": 2},
        "panelSlot": None,
        "roomId": room_id,
        "specs": {
            "ratedPower": power_w,
            "ratedCurrent": 16,
            "crossSection": 2.5,
            "mountingHeight": 0.3,
        },
    }


def _request() -> AutoPanelRequest:
    """Граф: кухонные розетки, свет в гостиной, мощный прибор в ванной."""
    return AutoPanelRequest.model_validate(
        {
            "nodes": [
                _node("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "socket", "Розетка К1", 500, KITCHEN),
                _node("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", "socket", "Розетка К2", 500, KITCHEN),
                _node("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", "light_fixture", "Свет Л1", 100, LIVING),
                _node("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", "light_fixture", "Свет Л2", 100, LIVING),
                _node("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", "appliance", "Бойлер", 3000, BATH),
                _node("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6", "panel", "Щит НКУ", 0, None),
            ],
            "rooms": [
                {"id": KITCHEN, "name": "Кухня", "type": "kitchen", "polygon": []},
                {"id": LIVING, "name": "Гостиная", "type": "living", "polygon": []},
                {"id": BATH, "name": "Ванная", "type": "wet", "polygon": []},
            ],
            "supply": {"voltageV": 400, "phases": 3},
            "preferredBrand": "IEK",
        }
    )


class TestAutoPanel:
    """Группировка, балансировка и компоновка щита."""

    def test_grouping_by_room_and_powerful_separate(self) -> None:
        """Розетки и свет группируются по помещениям, мощный прибор — отдельно."""
        result = auto_assemble_panel(_request())

        # Мощный прибор разбит на три пофазные линии (3P 400 В).
        assert len(result.groups) == 5
        powerful = [group for group in result.groups if group.name.startswith("Бойлер")]
        assert len(powerful) == 3
        assert all(group.total_power_w == 1000 for group in powerful)
        assert all(group.rcd_current_ma == 10 for group in powerful)

        kitchen = next(group for group in result.groups if group.name.startswith("Розетки"))
        assert len(kitchen.consumer_ids) == 2
        assert kitchen.total_power_w == 1000
        assert kitchen.rcd_current_ma == 30

        lights = next(group for group in result.groups if group.name.startswith("Свет"))
        assert lights.total_power_w == 200
        assert lights.rcd_current_ma == 0

    def test_phase_balancing(self) -> None:
        """Группы распределены по трём фазам; перекос считается детерминированно."""
        result = auto_assemble_panel(_request())

        assert {group.phase for group in result.groups} == {"L1", "L2", "L3"}
        assert result.imbalance_percent == pytest.approx(50.0, abs=0.01)
        assert any("Перекос фаз" in warning for warning in result.warnings)
        assert "PUE-3PHASE-IMBALANCE-15" in result.references

    def test_din_modules_and_reserve(self) -> None:
        """Модули расставлены по panelSlot, корпус имеет +20 % резерва."""
        result = auto_assemble_panel(_request())

        assert [module.panel_slot for module in result.modules] == list(
            range(1, len(result.modules) + 1)
        )
        assert result.used_din_modules == 28
        assert result.enclosure_modules == math.ceil(28 * 1.2) == 34
        assert all(group.panel_slot is not None for group in result.groups)

    def test_empty_graph_produces_incoming_modules(self) -> None:
        """Пустой граф: только ввод и противопожарное УЗО."""
        result = auto_assemble_panel(AutoPanelRequest.model_validate({"nodes": [], "rooms": []}))

        assert result.groups == []
        assert result.used_din_modules == 4
        assert result.enclosure_modules == 5
        assert result.imbalance_percent == 0

    def test_determinism(self) -> None:
        """Одинаковый граф даёт одинаковый результат."""
        request = _request()

        assert auto_assemble_panel(request) == auto_assemble_panel(request)

    def test_http_endpoint_camel_case(self) -> None:
        """FastAPI принимает camelCase-контракт unified.shared."""
        payload = _request().model_dump(by_alias=True, mode="json")
        response = client.post("/v1/calc/auto-panel", json=payload)

        assert response.status_code == 200
        body = response.json()
        assert len(body["groups"]) == 5
        assert body["enclosureModules"] >= body["usedDinModules"]
        assert body["rulesVersion"] == "0.1"


def test_three_phase_golden_case_imbalance_below_limit() -> None:
    """Кейс 02: перекос фаз после автосборки строго ≤ 15 % (KI-007)."""
    from pathlib import Path

    fixture = Path(__file__).resolve().parents[3] / "fixtures" / "golden-dataset"
    graph = json.loads(
        (fixture / "02_apartment_3room_400v" / "project.vwc").read_text(encoding="utf-8")
    )["graph"]

    result = auto_assemble_panel(
        AutoPanelRequest.model_validate(
            {
                "nodes": graph["nodes"],
                "rooms": graph["rooms"],
                "supply": {"voltageV": 400, "phases": 3, "supplyTopology": "3P_400V"},
            }
        )
    )

    assert result.imbalance_percent <= 15
    assert any(module.kind == "relay_voltage" for module in result.modules)
    assert any("4P" in module.label for module in result.modules)
