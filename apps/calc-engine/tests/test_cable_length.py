# © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
"""Тесты детерминированного расчёта длины кабельной линии."""

import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.calculator import calculate_cable_length
from app.main import app
from app.schemas import CalculateCableLengthRequest, PointPx

client = TestClient(app)


def _request(
    waypoints: list[tuple[float, float]],
    scale: float = 0.01,
    ceiling: float = 2.5,
    source: float = 0.3,
    target: float = 0.3,
    reserve: float | None = None,
) -> CalculateCableLengthRequest:
    """Собирает запрос с явным заданием коэффициента запаса."""
    payload: dict[str, object] = {
        "waypoints_px": [PointPx(x=x, y=y) for x, y in waypoints],
        "scale_meters_per_px": scale,
        "ceiling_height_m": ceiling,
        "source_mount_height_m": source,
        "target_mount_height_m": target,
    }
    if reserve is not None:
        payload["reserve_factor"] = reserve
    return CalculateCableLengthRequest.model_validate(payload)


class TestCableLength:
    """Детерминированные расчёты длины трассы."""

    def test_straight_route_with_reserve(self) -> None:
        """Прямая трасса 100 px при масштабе 0.01 м/px: 1 м + подъёмы."""
        result = calculate_cable_length(_request([(0, 0), (100, 0)]))

        assert result.horizontal_length_m == 1.0
        assert result.vertical_length_m == 4.4  # (2.5-0.3) × 2
        assert result.length_m == 6.21  # (1.0 + 4.4) × 1.15
        assert result.reserve_factor == 1.15
        assert result.waypoints_count == 2

    def test_zero_route_empty_waypoints(self) -> None:
        """Пустая трасса при нулевых высотах даёт нулевую длину."""
        result = calculate_cable_length(_request([], ceiling=0, source=0, target=0))

        assert result.horizontal_length_m == 0.0
        assert result.vertical_length_m == 0.0
        assert result.length_m == 0.0
        assert result.waypoints_count == 0

    def test_zero_route_single_waypoint(self) -> None:
        """Одна точка — нулевая горизонтальная трасса."""
        result = calculate_cable_length(
            _request([(12, 34)], ceiling=0, source=0, target=0)
        )

        assert result.horizontal_length_m == 0.0
        assert result.length_m == 0.0
        assert result.waypoints_count == 1

    def test_zero_route_with_different_mount_heights(self) -> None:
        """Нулевая трасса между розеткой (0.3 м) и выключателем (1.5 м)."""
        result = calculate_cable_length(
            _request([(10, 10)], ceiling=2.7, source=0.3, target=1.5)
        )

        assert result.horizontal_length_m == 0.0
        assert result.vertical_length_m == 3.6  # 2.4 + 1.2
        assert result.length_m == 4.14  # 3.6 × 1.15

    def test_coincident_waypoints(self) -> None:
        """Совпадающие точки не дают длину, но высоты учитываются."""
        result = calculate_cable_length(
            _request([(5, 5), (5, 5), (5, 5)], ceiling=2.5, source=1.0, target=2.0)
        )

        assert result.horizontal_length_m == 0.0
        assert result.vertical_length_m == 2.0  # (2.5-1.0) + (2.5-2.0)
        assert result.length_m == pytest.approx(2.3)

    def test_manhattan_route(self) -> None:
        """Ломаная трасса: сумма длин ортогональных отрезков."""
        result = calculate_cable_length(
            _request([(0, 0), (100, 0), (100, 50)], scale=0.02, target=1.5)
        )

        assert result.horizontal_length_m == 3.0  # 2.0 + 1.0
        assert result.vertical_length_m == 3.2  # 2.2 + 1.0
        assert result.length_m == pytest.approx(7.13)

    def test_diagonal_route_pythagoras(self) -> None:
        """Диагональ 3-4-5: 500 px × 0.01 м/px = 5 м."""
        result = calculate_cable_length(
            _request([(0, 0), (300, 400)], ceiling=0, source=0, target=0)
        )

        assert result.horizontal_length_m == 5.0
        assert result.vertical_length_m == 0.0
        assert result.length_m == 5.75

    def test_custom_reserve_factor(self) -> None:
        """Пользовательский коэффициент запаса применяется к сумме."""
        result = calculate_cable_length(
            _request([(0, 0), (100, 0)], ceiling=0, source=0, target=0, reserve=1.2)
        )

        assert result.reserve_factor == 1.2
        assert result.length_m == pytest.approx(1.2)

    def test_reserve_factor_one(self) -> None:
        """Запас 1.0 оставляет длину без увеличения."""
        result = calculate_cable_length(
            _request([(0, 0), (200, 0)], ceiling=0, source=0, target=0, reserve=1.0)
        )

        assert result.length_m == 2.0

    def test_decimal_exactness(self) -> None:
        """0.1 × 1.15 = 0.115 без бинарного шума float."""
        result = calculate_cable_length(
            _request([(0, 0), (1, 0)], scale=0.1, ceiling=0, source=0, target=0)
        )

        assert result.horizontal_length_m == 0.1
        assert result.length_m == 0.115

    def test_determinism(self) -> None:
        """Одинаковые входные данные дают одинаковый результат."""
        request = _request([(0, 0), (33, 44), (100, 44)])

        assert calculate_cable_length(request) == calculate_cable_length(request)

    def test_negative_coordinates_are_supported(self) -> None:
        """Отрицательные координаты допустимы, длина неотрицательна."""
        result = calculate_cable_length(
            _request([(-10, -20), (-10, 30)], ceiling=0, source=0, target=0)
        )

        assert result.horizontal_length_m == 0.5
        assert result.length_m >= 0


class TestValidation:
    """Проверка входных контрактов через Pydantic."""

    @pytest.mark.parametrize(
        "overrides",
        [
            {"scale_meters_per_px": 0},
            {"scale_meters_per_px": -1},
            {"ceiling_height_m": -0.1},
            {"source_mount_height_m": -1},
            {"target_mount_height_m": -1},
            {"reserve_factor": 0.99},
            {"reserve_factor": 0},
        ],
    )
    def test_invalid_physical_values(self, overrides: dict[str, object]) -> None:
        """Физически некорректные значения отклоняются."""
        payload: dict[str, object] = {
            "waypoints_px": [{"x": 0, "y": 0}],
            "scale_meters_per_px": 0.01,
            "ceiling_height_m": 2.5,
            "source_mount_height_m": 0.3,
            "target_mount_height_m": 0.3,
        }
        payload.update(overrides)

        with pytest.raises(ValidationError):
            CalculateCableLengthRequest.model_validate(payload)

    def test_nan_coordinates_rejected(self) -> None:
        """NaN и бесконечности не попадают в расчёт."""
        payload = {
            "waypoints_px": [{"x": math.nan, "y": 0}],
            "scale_meters_per_px": 0.01,
            "ceiling_height_m": 2.5,
            "source_mount_height_m": 0.3,
            "target_mount_height_m": 0.3,
        }

        with pytest.raises(ValidationError):
            CalculateCableLengthRequest.model_validate(payload)

    def test_unknown_fields_rejected(self) -> None:
        """Лишние поля не допускаются строгим контрактом."""
        payload = {
            "waypointsPx": [{"x": 0, "y": 0}],
            "scaleMetersPerPx": 0.01,
            "ceilingHeightM": 2.5,
            "sourceMountHeightM": 0.3,
            "targetMountHeightM": 0.3,
            "unexpected": 1,
        }

        with pytest.raises(ValidationError):
            CalculateCableLengthRequest.model_validate(payload)

    def test_camel_case_contract(self) -> None:
        """JSON-контракт использует camelCase, как и TypeScript-схемы."""
        request = CalculateCableLengthRequest.model_validate(
            {
                "waypointsPx": [{"x": 0, "y": 0}, {"x": 10, "y": 0}],
                "scaleMetersPerPx": 0.1,
                "ceilingHeightM": 0,
                "sourceMountHeightM": 0,
                "targetMountHeightM": 0,
            }
        )

        dumped = calculate_cable_length(request).model_dump(by_alias=True)

        assert request.reserve_factor == 1.15
        assert dumped["lengthM"] == 1.15
        assert dumped["horizontalLengthM"] == 1.0
        assert dumped["waypointsCount"] == 2


class TestHttpEndpoint:
    """Проверка HTTP-контракта расчётного ядра."""

    def test_camel_case_request_and_response(self) -> None:
        """Endpoint принимает camelCase и возвращает camelCase."""
        response = client.post(
            "/v1/calc/cable-length",
            json={
                "waypointsPx": [{"x": 0, "y": 0}, {"x": 100, "y": 0}],
                "scaleMetersPerPx": 0.01,
                "ceilingHeightM": 2.5,
                "sourceMountHeightM": 0.3,
                "targetMountHeightM": 1.5,
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["horizontalLengthM"] == 1.0
        assert body["verticalLengthM"] == 3.2  # 2.2 + 1.0
        assert body["lengthM"] == pytest.approx(4.83)  # 4.2 × 1.15
        assert body["reserveFactor"] == 1.15

    def test_invalid_scale_rejected(self) -> None:
        """Некорректный масштаб отклоняется с кодом 422."""
        response = client.post(
            "/v1/calc/cable-length",
            json={
                "waypointsPx": [{"x": 0, "y": 0}],
                "scaleMetersPerPx": 0,
                "ceilingHeightM": 0,
                "sourceMountHeightM": 0,
                "targetMountHeightM": 0,
            },
        )

        assert response.status_code == 422
