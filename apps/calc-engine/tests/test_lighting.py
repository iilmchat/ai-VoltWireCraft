# © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
"""Тесты детерминированного светотехнического расчёта (СП 52.13330)."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.lighting import calculate_lighting, polygon_area_m2, utilization_factor
from app.main import app
from app.schemas import LightingCalcRequest
from decimal import Decimal

client = TestClient(app)


def _point(x: float, y: float) -> dict[str, float]:
    """Точка полигона."""
    return {"x": x, "y": y}


def _request(**overrides: object) -> LightingCalcRequest:
    """Собирает запрос для прямоугольной комнаты 4×5 м, высота 2,7 м."""
    payload: dict[str, object] = {
        "polygon_m": [_point(0, 0), _point(4, 0), _point(4, 5), _point(0, 5)],
        "ceiling_height_m": 2.7,
        "zone_type": "living",
        "luminaire_flux_lm": 1200,
        "luminaire_power_w": 14,
    }
    payload.update(overrides)
    return LightingCalcRequest.model_validate(payload)


class TestLighting:
    """Расчёт площади, индекса помещения и числа светильников."""

    def test_polygon_area_shoelace(self) -> None:
        """Площадь по формуле шнурования: 20 м²."""
        points = _request().polygon_m or []
        assert polygon_area_m2(points) == Decimal("20")

    def test_living_room_result(self) -> None:
        """Жилая комната: Eн=150 лк, N ≥ 1, фактическая освещённость ≥ нормы."""
        result = calculate_lighting(_request())

        assert result.area_m2 == pytest.approx(20)
        assert result.required_lux == 150
        assert result.room_index > 0
        assert 0 < result.utilization_factor <= 1
        assert result.recommended_luminaires_count >= 1
        assert result.actual_lux >= 150
        assert result.total_power_w == 14 * result.recommended_luminaires_count
        assert "LIGHT-EN-LIVING" in result.references

    def test_norm_values_by_zone(self) -> None:
        """Нормы освещённости по типам зон из задания v0.8.0."""
        expected = {"living": 150, "kitchen": 200, "wet": 75, "utility": 100, "outdoor": 50}
        for zone, lux in expected.items():
            result = calculate_lighting(_request(zone_type=zone))
            assert result.required_lux == lux

    def test_area_m2_alternative(self) -> None:
        """Площадь можно задать напрямую."""
        result = calculate_lighting(
            _request(polygon_m=None, area_m2=18, zone_type="kitchen")
        )

        assert result.area_m2 == pytest.approx(18)
        assert result.required_lux == 200

    def test_safety_factor_increases_count(self) -> None:
        """Больший коэффициент запаса не уменьшает число светильников."""
        base = calculate_lighting(_request())
        with_reserve = calculate_lighting(_request(safety_factor=1.3))

        assert with_reserve.recommended_luminaires_count >= base.recommended_luminaires_count

    def test_utilization_interpolation_and_clamp(self) -> None:
        """η интерполируется; вне диапазона возвращается граничное значение."""
        assert utilization_factor(Decimal("0.75"))[0] > Decimal("0.34")
        eta, clamped = utilization_factor(Decimal("100"))
        assert clamped is True
        assert eta == Decimal("0.76")

    def test_missing_zone_warning(self) -> None:
        """Без типа зоны используется консервативный utility и предупреждение."""
        result = calculate_lighting(_request(zone_type=None))

        assert result.required_lux == 100
        assert any("тип зоны" in warning.lower() for warning in result.warnings)

    def test_determinism(self) -> None:
        """Одинаковые входы дают одинаковый результат."""
        assert calculate_lighting(_request()) == calculate_lighting(_request())

    def test_http_camel_case(self) -> None:
        """FastAPI принимает camelCase и возвращает camelCase."""
        response = client.post(
            "/v1/calc/lighting",
            json={
                "polygonM": [_point(0, 0), _point(4, 0), _point(4, 5), _point(0, 5)],
                "ceilingHeightM": 2.7,
                "zoneType": "living",
                "luminaireFluxLm": 1200,
                "luminairePowerW": 14,
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["areaM2"] == pytest.approx(20)
        assert body["requiredLux"] == 150
        assert body["recommendedLuminairesCount"] >= 1


class TestValidation:
    """Проверка контракта."""

    @pytest.mark.parametrize(
        "overrides",
        [
            {"ceiling_height_m": 0},
            {"luminaire_flux_lm": -1},
            {"luminaire_power_w": 0},
            {"zone_type": "unknown"},
        ],
    )
    def test_invalid_values(self, overrides: dict[str, object]) -> None:
        """Некорректные значения отклоняются."""
        with pytest.raises(ValidationError):
            _request(**overrides)
