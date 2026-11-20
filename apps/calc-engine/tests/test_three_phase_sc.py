# © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
"""Тесты расчёта трёхфазного КЗ и ударного тока."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas import ThreePhaseShortCircuitRequest
from app.short_circuit import calculate_three_phase_short_circuit

client = TestClient(app)


def _request(**overrides: object) -> ThreePhaseShortCircuitRequest:
    """Собирает запрос: 400 В, R=0,05 Ом, X=0,1 Ом."""
    payload: dict[str, object] = {
        "voltage_v": 400,
        "resistance_ohm": 0.05,
        "reactance_ohm": 0.1,
        "time_constant_s": 0.01,
        "breaking_capacity_ka": 4.5,
    }
    payload.update(overrides)
    return ThreePhaseShortCircuitRequest.model_validate(payload)


class TestThreePhaseShortCircuit:
    """Симметричный и ударный токи КЗ."""

    def test_typical_values(self) -> None:
        """Iкз ≈ 2065 А, kуд ≈ 1,368, ударный ток > Iкз."""
        result = calculate_three_phase_short_circuit(_request())

        assert result.short_circuit_current_a == pytest.approx(2065, rel=0.01)
        assert result.impact_factor == pytest.approx(1.368, abs=0.001)
        assert result.peak_short_circuit_a > result.short_circuit_current_a
        assert result.loop_impedance_ohm == pytest.approx(0.112, abs=0.001)
        assert result.breaking_capacity_ok is True
        assert "PUE-SC-BREAKING-CAPACITY" in result.references

    def test_impact_factor_large_time_constant(self) -> None:
        """При T_a = 1 с kуд = 1 + exp(−0,01) ≈ 1,99 (не более 2)."""
        result = calculate_three_phase_short_circuit(_request(time_constant_s=1))

        assert result.impact_factor == pytest.approx(1.99, abs=0.001)

    def test_insufficient_breaking_capacity(self) -> None:
        """Если I_cn < Iкз — предупреждение и false."""
        result = calculate_three_phase_short_circuit(_request(breaking_capacity_ka=1))

        assert result.breaking_capacity_ok is False
        assert any("I_cn" in warning for warning in result.warnings)

    def test_determinism(self) -> None:
        """Одинаковые входы дают одинаковый результат."""
        assert calculate_three_phase_short_circuit(_request()) == calculate_three_phase_short_circuit(
            _request()
        )

    def test_http_camel_case(self) -> None:
        """FastAPI принимает camelCase и возвращает camelCase."""
        response = client.post(
            "/v1/calc/three-phase-sc",
            json={
                "voltageV": 400,
                "resistanceOhm": 0.05,
                "reactanceOhm": 0.1,
                "breakingCapacityKa": 4.5,
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["shortCircuitCurrentA"] > 0
        assert body["peakShortCircuitA"] > body["shortCircuitCurrentA"]


class TestValidation:
    """Проверка контракта."""

    def test_negative_impedance(self) -> None:
        """Отрицательное сопротивление отклоняется."""
        with pytest.raises(ValidationError):
            _request(resistance_ohm=-1)

    def test_zero_impedance(self) -> None:
        """Нулевое полное сопротивление отклоняется ядром."""
        with pytest.raises(ValueError, match="положительным"):
            calculate_three_phase_short_circuit(
                _request(resistance_ohm=0, reactance_ohm=0)
            )
