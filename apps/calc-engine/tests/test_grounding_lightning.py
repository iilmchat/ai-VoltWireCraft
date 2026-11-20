# © 2026 RuChating (iilmchat) · VoltWireCraft v0.9.0
"""Тесты расчёта заземления и стержневой молниезащиты."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.grounding_lightning import calculate_grounding_lightning
from app.main import app
from app.schemas import GroundingLightningRequest

client = TestClient(app)


def _request(**overrides: object) -> GroundingLightningRequest:
    """Собирает запрос: влажный песок, 3 стержня по 3 м на глубине 1 м."""
    payload: dict[str, object] = {
        "soil_type": "sand",
        "soil_moisture": "wet",
        "burial_depth_m": 1.0,
        "vertical_electrodes_count": 3,
        "vertical_electrode_length_m": 3,
        "vertical_electrode_diameter_m": 0.016,
        "horizontal_strip_length_m": 0,
        "required_resistance_ohm": 25,
        "building_height_m": 10,
        "lightning_rod_height_m": 5,
        "protection_height_m": 0,
    }
    payload.update(overrides)
    return GroundingLightningRequest.model_validate(payload)


class TestGroundingLightning:
    """Сопротивление ЗУ и зона молниезащиты."""

    def test_soil_and_season(self) -> None:
        """ρ_расч = 100 × 1,3 = 130 Ом·м."""
        result = calculate_grounding_lightning(_request())

        assert result.design_resistivity_ohm_m == pytest.approx(130)
        assert result.seasonal_factor == pytest.approx(1.3)
        assert "GR-SOIL-SAND" in result.references
        assert "GR-SEASON-10" in result.references

    def test_rod_and_group_resistance(self) -> None:
        """R_стержня ≈ 45 Ом, R_ЗУ ≈ 20 Ом при трёх стержнях."""
        result = calculate_grounding_lightning(_request())

        assert result.vertical_electrode_resistance_ohm == pytest.approx(45.7, rel=0.05)
        assert result.grounding_resistance_ohm == pytest.approx(20.3, rel=0.05)
        assert result.utilization_factor == pytest.approx(0.75)
        assert result.grounding_compliant is True

    def test_default_norm_not_met(self) -> None:
        """Для нормы 4 Ом контур из трёх стержней недостаточен."""
        result = calculate_grounding_lightning(_request(required_resistance_ohm=4))

        assert result.grounding_compliant is False
        assert any("R_ЗУ" in warning for warning in result.warnings)
        assert "PUE-GR-4" in result.references

    def test_horizontal_strip_reduces_resistance(self) -> None:
        """Добавление полосы снижает итоговое сопротивление."""
        without = calculate_grounding_lightning(_request())
        with_strip = calculate_grounding_lightning(_request(horizontal_strip_length_m=20))

        assert with_strip.horizontal_strip_resistance_ohm > 0
        assert with_strip.grounding_resistance_ohm < without.grounding_resistance_ohm

    def test_lightning_protection_zone(self) -> None:
        """Высота 15 м, точка 0 м → радиус 22,5 м, зона A."""
        result = calculate_grounding_lightning(_request())

        assert result.protection_radius_m == pytest.approx(22.5)
        assert result.protection_zone_type == "A"
        assert result.lightning_compliant is True
        assert "SO-LIGHT-10" in result.references

    def test_zone_b_for_tall_building(self) -> None:
        """Высота > 30 м — зона B."""
        result = calculate_grounding_lightning(_request(building_height_m=40))

        assert result.protection_zone_type == "B"

    def test_missing_soil_type_warning(self) -> None:
        """Без типа грунта используется песок и добавляется предупреждение."""
        result = calculate_grounding_lightning(_request(soil_type=None))

        assert result.design_resistivity_ohm_m == pytest.approx(130)
        assert any("грунта" in warning.lower() for warning in result.warnings)

    def test_determinism(self) -> None:
        """Одинаковые входы дают одинаковый результат."""
        assert calculate_grounding_lightning(_request()) == calculate_grounding_lightning(_request())

    def test_http_camel_case(self) -> None:
        """FastAPI принимает camelCase и возвращает camelCase."""
        response = client.post(
            "/v1/calc/grounding-lightning",
            json={
                "soilType": "clay",
                "burialDepthM": 0.7,
                "verticalElectrodesCount": 2,
                "verticalElectrodeLengthM": 3,
                "verticalElectrodeDiameterM": 0.016,
                "horizontalStripLengthM": 0,
                "buildingHeightM": 9,
                "lightningRodHeightM": 3,
                "protectionHeightM": 0,
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["groundingResistanceOhm"] > 0
        assert body["protectionRadiusM"] == pytest.approx(18)


class TestValidation:
    """Проверка контракта."""

    def test_negative_count(self) -> None:
        """Отрицательное число электродов отклоняется."""
        with pytest.raises(ValidationError):
            _request(vertical_electrodes_count=0)

    def test_explicit_resistivity(self) -> None:
        """Явное ρ имеет приоритет над типом грунта."""
        result = calculate_grounding_lightning(
            _request(soil_resistivity_ohm_m=50, soil_type="sand")
        )

        assert result.design_resistivity_ohm_m == pytest.approx(65)
