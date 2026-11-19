# © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
"""Тесты изолированного разбора DXF-планов в стены (RULES § 5.5)."""

from io import StringIO

import ezdxf
import pytest
from fastapi.testclient import TestClient

from app.cad_parser import MAX_CAD_FILE_BYTES, parse_dxf_bytes
from app.main import app

client = TestClient(app)


def _make_dxf(insunits: int = 4) -> bytes:
    """Создаёт тестовый DXF: стена, перегородка и слой мебели."""
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = insunits
    model = document.modelspace()

    model.add_line((0, 0), (3000, 0), dxfattribs={"layer": "WALLS"})
    model.add_lwpolyline(
        [(0, 0), (0, 2000), (2000, 2000)],
        dxfattribs={"layer": "PARTITIONS"},
    )
    model.add_line((0, 0), (100, 100), dxfattribs={"layer": "FURNITURE"})

    stream = StringIO()
    document.write(stream)
    return stream.getvalue().encode("utf-8")


class TestCadParser:
    """Нормализация единиц и фильтрация слоёв."""

    def test_parses_walls_in_millimeters(self) -> None:
        """$INSUNITS=4: миллиметры переводятся в метры, лишние слои игнорируются."""
        result = parse_dxf_bytes(_make_dxf(4))

        assert result.units == "mm"
        assert len(result.walls) == 2
        assert result.entities_processed == 3
        assert result.walls[0].kind == "wall"
        assert result.walls[0].path[0].x == pytest.approx(0)
        assert result.walls[0].path[1].x == pytest.approx(3)
        assert result.walls[0].thickness == pytest.approx(0.1)
        assert result.walls[1].kind == "partition"
        assert result.walls[1].path[-1].y == pytest.approx(2)

    def test_centimeter_units(self) -> None:
        """$INSUNITS=5: сантиметры переводятся в метры."""
        result = parse_dxf_bytes(_make_dxf(5))

        assert result.units == "cm"
        assert result.walls[0].path[1].x == pytest.approx(30)

    def test_units_override(self) -> None:
        """Явное указание единиц имеет приоритет над заголовком чертежа."""
        result = parse_dxf_bytes(_make_dxf(4), "m")

        assert result.units == "m"
        assert result.walls[0].path[1].x == pytest.approx(3000)

    def test_rejects_oversized_file(self) -> None:
        """Файл больше 50 МБ не попадает в парсер."""
        with pytest.raises(ValueError, match="лимит"):
            parse_dxf_bytes(b"x" * (MAX_CAD_FILE_BYTES + 1))

    def test_rejects_broken_file(self) -> None:
        """Битый файл не роняет процесс."""
        with pytest.raises(Exception):
            parse_dxf_bytes(b"NOT A DXF FILE")

    def test_endpoint(self) -> None:
        """FastAPI принимает multipart-файл и возвращает стены в метрах."""
        response = client.post(
            "/v1/cad/parse-dxf",
            files={"file": ("plan.dxf", _make_dxf(4), "application/dxf")},
        )

        assert response.status_code == 200
        body = response.json()
        assert len(body["walls"]) == 2
        assert body["units"] == "mm"
        assert body["walls"][0]["path"][1]["x"] == pytest.approx(3)
