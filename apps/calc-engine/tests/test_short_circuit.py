# © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
"""Тесты расчёта однофазного тока КЗ и селективности."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas import ShortCircuitRequest
from app.short_circuit import calculate_short_circuit

client = TestClient(app)


def _request(**overrides: object) -> ShortCircuitRequest:
    """Собирает корректный запрос с возможностью переопределить поля."""
    payload: dict[str, object] = {
        "transformer_power_kva": 100,
        "transformer_uk_percent": 4.5,
        "voltage_v": 230,
        "cable_length_m": 20,
        "cross_section_mm2": 2.5,
        "breaker_rating_a": 16,
        "trip_curve": "C",
    }
    payload.update(overrides)
    return ShortCircuitRequest.model_validate(payload)


class TestShortCircuit:
    """Петля «фаза-ноль» и кратность срабатывания."""

    def test_typical_line_disconnects(self) -> None:
        """Короткая линия: ток КЗ больше 10·In для кривой C."""
        result = calculate_short_circuit(_request())

        assert result.phase_resistance_ohm == pytest.approx(0.14, abs=0.001)
        assert result.loop_impedance_ohm > result.transformer_impedance_ohm
        assert result.short_circuit_current_a > 10 * 16
        assert result.required_multiplicity == 10
        assert result.minimum_multiplicity == 5
        assert result.disconnect_complies is True
        assert result.trip_time_s == pytest.approx(0.1)
        assert "PUE-SC-TRIP-C" in result.references

    def test_long_thin_cable_does_not_disconnect(self) -> None:
        """Длинная линия 80 м, 1.5 мм²: мгновенное отключение не гарантировано."""
        result = calculate_short_circuit(
            _request(cable_length_m=80, cross_section_mm2=1.5, trip_curve="C")
        )

        assert result.short_circuit_current_a < 10 * 16
        assert result.disconnect_complies is False
        assert result.trip_time_s > 0.4
        assert any("мгновенное отключение" in item for item in result.warnings)

    def test_trip_curve_multipliers(self) -> None:
        """B=5, C=10, D=20 для гарантированного отключения."""
        for curve, expected in (("B", 5), ("C", 10), ("D", 20)):
            result = calculate_short_circuit(_request(trip_curve=curve))

            assert result.required_multiplicity == expected

    def test_selectivity_ok(self) -> None:
        """Вводный автомат 63 А против группового 16 А — селективно."""
        result = calculate_short_circuit(_request(upstream_breaker_rating_a=63))

        assert result.selectivity_ok is True
        assert result.upstream_to_downstream_ratio == pytest.approx(3.94, abs=0.01)

    def test_selectivity_violation(self) -> None:
        """Вводный 20 А против группового 16 А — не селективно."""
        result = calculate_short_circuit(_request(upstream_breaker_rating_a=20))

        assert result.selectivity_ok is False
        assert any("селективность" in item for item in result.warnings)

    def test_transformer_impedance_override(self) -> None:
        """Явно заданное сопротивление трансформатора используется в петле."""
        result = calculate_short_circuit(_request(transformer_impedance_ohm=0.5))

        assert result.transformer_impedance_ohm == pytest.approx(0.5)

    def test_determinism(self) -> None:
        """Одинаковые входы дают одинаковый результат."""
        request = _request(cable_length_m=35)

        assert calculate_short_circuit(request) == calculate_short_circuit(request)

    def test_http_camel_case(self) -> None:
        """Endpoint принимает camelCase и возвращает camelCase."""
        response = client.post(
            "/v1/calc/short-circuit",
            json={
                "transformerPowerKva": 100,
                "cableLengthM": 20,
                "crossSectionMm2": 2.5,
                "breakerRatingA": 16,
                "tripCurve": "C",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["shortCircuitCurrentA"] > 0
        assert body["requiredMultiplicity"] == 10
        assert body["disconnectComplies"] is True


class TestShortCircuitValidation:
    """Проверка контракта."""

    @pytest.mark.parametrize(
        "overrides",
        [
            {"transformer_power_kva": 0},
            {"cable_length_m": -1},
            {"cross_section_mm2": 35},
            {"breaker_rating_a": 0},
            {"trip_curve": "Z"},
            {"voltage_v": 110},
        ],
    )
    def test_invalid_values(self, overrides: dict[str, object]) -> None:
        """Некорректные значения отклоняются."""
        with pytest.raises(ValidationError):
            _request(**overrides)
