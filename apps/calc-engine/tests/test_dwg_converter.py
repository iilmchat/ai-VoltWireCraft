# © 2026 RuChating (iilmchat) · VoltWireCraft v0.5.0
"""Мок-тесты конвейера DWG → DXF → ezdxf (RULES § 5.5)."""

import subprocess
from io import StringIO
from pathlib import Path

import ezdxf
import pytest

import app.cad_parser as cad_parser
from app.cad_parser import find_dwg_converter, parse_dwg_bytes


def _dxf_bytes() -> bytes:
    """Минимальный DXF с одной стеной на слое WALLS."""
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 4
    document.modelspace().add_line((0, 0), (3000, 0), dxfattribs={"layer": "WALLS"})
    stream = StringIO()
    document.write(stream)
    return stream.getvalue().encode("utf-8")


def _fake_run(calls: list[dict[str, object]]):
    """Возвращает подставную функцию subprocess.run, пишущую DXF на выход."""

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append({"args": arguments, "kwargs": kwargs})
        output = Path(arguments[2]) / "plan.dxf"
        output.write_bytes(_dxf_bytes())
        return subprocess.CompletedProcess(arguments, 0, b"", b"")

    return run


@pytest.fixture
def oda_converter(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Фикстура: создаёт фиктивный ODAFileConverter и задаёт env."""
    executable = tmp_path / "ODAFileConverter"
    executable.write_text("#!/bin/sh\n", encoding="utf-8")
    monkeypatch.setenv("ODA_CONVERTER_PATH", str(executable))
    monkeypatch.setattr(cad_parser.shutil, "which", lambda _name: None)
    return executable


class TestDwgConverter:
    """Конвертация и безопасный субпроцесс."""

    def test_successful_conversion(
        self, oda_converter: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Успешная конвертация: DWG → DXF → стены в метрах."""
        calls: list[dict[str, object]] = []
        monkeypatch.setattr(cad_parser.subprocess, "run", _fake_run(calls))

        result = parse_dwg_bytes(b"AC1015 fake dwg payload")

        assert len(result.walls) == 1
        assert result.walls[0].path[1].x == pytest.approx(3)
        assert calls[0]["args"][0] == str(oda_converter)
        assert calls[0]["kwargs"]["shell"] is False
        assert "timeout" in calls[0]["kwargs"]

    def test_converter_timeout(
        self, oda_converter: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Таймаут субпроцесса превращается в TimeoutError."""

        def raise_timeout(*_args: object, **_kwargs: object) -> None:
            raise subprocess.TimeoutExpired(cmd="ODAFileConverter", timeout=30)

        monkeypatch.setattr(cad_parser.subprocess, "run", raise_timeout)

        with pytest.raises(TimeoutError, match="таймаут"):
            parse_dwg_bytes(b"AC1015 fake")

    def test_missing_converter(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Без ODA и dwg2dxf возвращается явная ошибка."""
        monkeypatch.delenv("ODA_CONVERTER_PATH", raising=False)
        monkeypatch.setattr(cad_parser.shutil, "which", lambda _name: None)

        assert find_dwg_converter() is None
        with pytest.raises(FileNotFoundError, match="ODA_CONVERTER_PATH"):
            parse_dwg_bytes(b"AC1015 fake")

    def test_endpoint_accepts_dwg(
        self, oda_converter: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """FastAPI-эндпоинт принимает .dwg и возвращает стены."""
        calls: list[dict[str, object]] = []
        monkeypatch.setattr(cad_parser.subprocess, "run", _fake_run(calls))
        from app.main import app
        from fastapi.testclient import TestClient

        response = TestClient(app).post(
            "/v1/cad/parse-dxf",
            files={"file": ("plan.dwg", b"AC1015 fake", "application/octet-stream")},
        )

        assert response.status_code == 200
        assert len(response.json()["walls"]) == 1
