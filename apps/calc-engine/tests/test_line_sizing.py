# © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
"""Тесты расчёта потребительской линии по ПУЭ-7."""

import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.line_sizing import calculate_line_sizing, design_current_a
from app.main import app
from app.schemas import LineSizingRequest

client = TestClient(app)


def _request(**overrides: object) -> LineSizingRequest:
    """Собирает корректный запрос с возможностью переопределить поля."""
    payload: dict[str, object] = {
        "power_w": 2000,
        "voltage_v": 230,
        "phases": 1,
        "power_factor": 0.95,
        "length_m": 12,
    }
    payload.update(overrides)
    return LineSizingRequest.model_validate(payload)


class TestDesignCurrent:
    """Расчётный ток для одно- и трёхфазной сети."""

    def test_single_phase(self) -> None:
        """I_p = P / (U cosφ)."""
        current = design_current_a(_request())

        assert float(current) == pytest.approx(2000 / (230 * 0.95), rel=1e-6)

    def test_three_phase(self) -> None:
        """I_p = P / (√3 U cosφ)."""
        current = design_current_a(_request(power_w=6000, voltage_v=400, phases=3))

        assert float(current) == pytest.approx(6000 / (math.sqrt(3) * 400 * 0.95), rel=1e-6)


class TestLineSizing:
    """Подбор сечения, автомата и УЗО."""

    def test_typical_socket_line(self) -> None:
        """Розеточная линия 2 кВт, 12 м — 1.5 мм² и автомат 10 А с УЗО 30 мА."""
        result = calculate_line_sizing(_request(consumer_kind="socket", room_type="living"))

        assert result.design_current_a == pytest.approx(9.15, abs=0.01)
        assert result.selected_cross_section_mm2 == 1.5
        assert result.permissible_current_a == 17
        assert result.voltage_drop_percent <= 5
        assert 9.15 <= result.breaker_rating_a <= 17
        assert result.rcd_required is True
        assert result.rcd_current_ma == 30
        assert "PUE-RCD-SOCKET-30" in result.references
        assert result.cable_type == "ВВГнг(А)-LS"
        assert result.rules_version == "0.1"

    def test_long_wet_line_80m(self) -> None:
        """Баня: 80 м, 2 кВт — сечение 1.5 мм² не проходит по ΔU, выбирается 2.5 мм²."""
        result = calculate_line_sizing(
            _request(
                power_w=2000,
                length_m=80,
                room_type="wet",
                consumer_kind="appliance",
            )
        )

        assert result.selected_cross_section_mm2 == 2.5
        assert result.voltage_drop_percent <= 5
        assert result.rcd_current_ma == 10
        assert "PUE-RCD-WET-10" in result.references

    def test_long_line_requires_larger_section(self) -> None:
        """3 кВт на 80 м: 2.5 мм² даёт > 5 %, выбирается 4 мм²."""
        result = calculate_line_sizing(
            _request(power_w=3000, length_m=80, room_type="wet", consumer_kind="appliance")
        )

        assert result.selected_cross_section_mm2 == 4
        assert result.voltage_drop_percent <= 5
        assert result.breaker_rating_a >= result.design_current_a

    def test_kitchen_requires_30ma_rcd(self) -> None:
        """Кухня — УЗО 30 мА."""
        result = calculate_line_sizing(_request(room_type="kitchen"))

        assert result.rcd_required is True
        assert result.rcd_current_ma == 30
        assert "PUE-RCD-WET-30" in result.references

    def test_light_line_without_rcd(self) -> None:
        """Освещение в жилой зоне не требует УЗО по справочнику."""
        result = calculate_line_sizing(_request(consumer_kind="light", room_type="living"))

        assert result.rcd_required is False
        assert result.rcd_current_ma == 0

    def test_air_installation_allows_smaller_section(self) -> None:
        """Прокладка на воздухе даёт больший допустимый ток."""
        result = calculate_line_sizing(_request(installation_method="air"))

        assert result.permissible_current_a == 19

    def test_three_phase_current_and_breaker(self) -> None:
        """Трёхфазная линия: ток меньше, чем у однофазной той же мощности."""
        result = calculate_line_sizing(
            _request(power_w=12000, voltage_v=400, phases=3, length_m=20)
        )

        assert result.design_current_a == pytest.approx(18.24, abs=0.01)
        assert result.breaker_rating_a >= result.design_current_a
        assert result.voltage_drop_percent <= 5

    def test_no_section_satisfies_limits(self) -> None:
        """Крайний случай: рекомендация и предупреждение вместо «подгонки» результата."""
        result = calculate_line_sizing(
            _request(power_w=12000, voltage_v=230, phases=1, length_m=300)
        )

        assert result.selected_cross_section_mm2 == 16
        assert result.voltage_drop_percent > 5
        assert any("потеря напряжения" in item.lower() for item in result.recommendations)

    def test_determinism(self) -> None:
        """Одинаковые входы дают одинаковый результат."""
        request = _request(length_m=41)

        assert calculate_line_sizing(request) == calculate_line_sizing(request)

    def test_camel_case_contract(self) -> None:
        """JSON-контракт использует camelCase."""
        response = client.post(
            "/v1/calc/line-sizing",
            json={
                "powerW": 2000,
                "voltageV": 230,
                "phases": 1,
                "powerFactor": 0.95,
                "lengthM": 12,
                "consumerKind": "socket",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["designCurrentA"] > 0
        assert body["selectedCrossSectionMm2"] in (1.5, 2.5, 4, 6, 10, 16)
        assert body["rcdCurrentMa"] == 30


class TestLineSizingValidation:
    """Проверка входного контракта."""

    @pytest.mark.parametrize(
        "overrides",
        [
            {"power_w": 0},
            {"voltage_v": 120},
            {"phases": 2},
            {"power_factor": 0},
            {"power_factor": 1.2},
            {"length_m": -1},
            {"max_voltage_drop_percent": 101},
        ],
    )
    def test_invalid_values(self, overrides: dict[str, object]) -> None:
        """Некорректные физические величины отклоняются."""
        with pytest.raises(ValidationError):
            _request(**overrides)

    def test_unknown_room_type(self) -> None:
        """Неизвестный тип помещения отклоняется."""
        with pytest.raises(ValidationError):
            _request(room_type="sauna")

    def test_extra_fields_rejected(self) -> None:
        """Лишние поля запрещены строгим контрактом."""
        with pytest.raises(ValidationError):
            LineSizingRequest.model_validate(
                {
                    "powerW": 1000,
                    "voltageV": 230,
                    "phases": 1,
                    "powerFactor": 0.95,
                    "lengthM": 10,
                    "unexpected": True,
                }
            )
