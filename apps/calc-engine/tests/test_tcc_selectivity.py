# © 2026 RuChating (iilmchat) · VoltWireCraft v0.6.0
"""Тесты расчёта время-токовых характеристик и каскадной селективности."""

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas import SelectivityTccRequest, TccDeviceInput
from app.tcc_selectivity import (
    build_curve,
    calculate_tcc_selectivity,
    selectivity_limit,
    trip_time_seconds,
)

client = TestClient(app)


def _device(**overrides: object) -> TccDeviceInput:
    """Собирает аппарат с разумными значениями по умолчанию."""
    payload: dict[str, object] = {
        "id": "shr",
        "rated_current_a": 16,
        "trip_curve": "C",
        "breaking_capacity_ka": 6,
    }
    payload.update(overrides)
    return TccDeviceInput.model_validate(payload)


def _request(**overrides: object) -> SelectivityTccRequest:
    """Собирает цепочку ВРУ → ЩР для расчёта ВТХ."""
    payload: dict[str, object] = {
        "devices": [
            {
                "id": "vru",
                "ratedCurrentA": 63,
                "tripCurve": "C",
                "breakingCapacityKa": 10,
                "shortCircuitCurrentA": 4000,
            },
            {
                "id": "shr",
                "ratedCurrentA": 32,
                "tripCurve": "B",
                "breakingCapacityKa": 6,
                "parentId": "vru",
                "shortCircuitCurrentA": 2000,
            },
        ],
        "upstreamVoltageDropPercent": 2.0,
        "groupVoltageDropPercent": 2.5,
    }
    payload.update(overrides)
    return SelectivityTccRequest.model_validate(payload)


class TestTripCurve:
    """Контрольные точки ВТХ по ГОСТ Р 50345."""

    def test_no_trip_at_113(self) -> None:
        """1,13 In — аппарат не срабатывает."""
        assert trip_time_seconds(Decimal("18.08"), _device()) is None

    def test_thermal_points(self) -> None:
        """1,45 In ≈ 36 с; 2,55 In ≈ 5,7 с."""
        device = _device()
        at_145 = trip_time_seconds(Decimal("23.2"), device)
        at_255 = trip_time_seconds(Decimal("40.8"), device)

        assert at_145 is not None and float(at_145) == pytest.approx(36, abs=0.5)
        assert at_255 is not None and float(at_255) == pytest.approx(5.71, abs=0.05)

    def test_magnetic_zone(self) -> None:
        """Верхняя граница C (10 In) — мгновенное срабатывание ≤ 0,1 с."""
        assert trip_time_seconds(Decimal("160"), _device()) == Decimal("0.1")

    def test_monotonic(self) -> None:
        """Время срабатывания монотонно убывает с током."""
        device = _device()
        times = [trip_time_seconds(Decimal(value), device) for value in (20, 30, 50, 80, 160)]
        values = [float(value) if value is not None else 3600.0 for value in times]

        assert values == sorted(values, reverse=True)

    def test_curve_points_count(self) -> None:
        """Кривая содержит 30 точек с положительным током."""
        curve = build_curve(_device())

        assert len(curve) == 30
        assert all(point.current_a > 0 and point.time_s >= 0 for point in curve)


class TestSelectivity:
    """Предел селективности и отключающая способность."""

    def test_limit_is_nonnegative_number(self) -> None:
        """Is детерминирован и не отрицателен."""
        limit = selectivity_limit(_device(rated_current_a=16), _device(id="vru", rated_current_a=63))

        assert isinstance(limit, Decimal)
        assert limit >= 0

    def test_breaking_capacity_violation(self) -> None:
        """Icn < Iкз фиксируется в предупреждении."""
        request = _request(devices=[
            {"id": "vru", "ratedCurrentA": 63, "tripCurve": "C", "breakingCapacityKa": 4.5, "shortCircuitCurrentA": 9000},
            {"id": "shr", "ratedCurrentA": 32, "tripCurve": "B", "breakingCapacityKa": 4.5, "parentId": "vru", "shortCircuitCurrentA": 8000},
        ])

        result = calculate_tcc_selectivity(request)

        assert result.breaking_capacity_ok is False
        assert any("I_cn" in warning for warning in result.warnings)

    def test_cascade_voltage_drop(self) -> None:
        """Суммарная потеря = магистраль + групповая линия."""
        result = calculate_tcc_selectivity(_request())

        assert result.total_voltage_drop_percent == pytest.approx(4.5)
        assert result.voltage_drop_ok is True

    def test_voltage_drop_violation(self) -> None:
        """Превышение 5 % помечается как нарушение."""
        result = calculate_tcc_selectivity(
            _request(upstreamVoltageDropPercent=3, groupVoltageDropPercent=3)
        )

        assert result.voltage_drop_ok is False
        assert result.status == "none"
        assert any("потеря напряжения" in warning for warning in result.warnings)

    def test_determinism(self) -> None:
        """Одинаковые входы дают одинаковый результат."""
        request = _request()

        assert calculate_tcc_selectivity(request) == calculate_tcc_selectivity(request)

    def test_http_camel_case(self) -> None:
        """FastAPI принимает camelCase-контракт."""
        response = client.post(
            "/v1/calc/selectivity-tcc",
            json={
                "devices": [
                    {"id": "vru", "ratedCurrentA": 63, "tripCurve": "C", "breakingCapacityKa": 10},
                    {"id": "shr", "ratedCurrentA": 32, "tripCurve": "B", "parentId": "vru"},
                ],
                "upstreamVoltageDropPercent": 2,
                "groupVoltageDropPercent": 2,
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] in ("full", "partial", "none")
        assert len(body["upstreamCurve"]) == 30
        assert body["breakingCapacityOk"] is True


class TestValidation:
    """Проверка входного контракта."""

    @pytest.mark.parametrize("curve", ["Z", ""])
    def test_invalid_curve(self, curve: str) -> None:
        """Недопустимая характеристика отклоняется."""
        with pytest.raises(ValidationError):
            _device(trip_curve=curve)

    def test_negative_capacity(self) -> None:
        """Отрицательная отключающая способность отклоняется."""
        with pytest.raises(ValidationError):
            _device(breaking_capacity_ka=-1)
