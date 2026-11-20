# © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
"""Тесты конфигурации безопасности CAD-парсера."""

import pytest

from app.config import (
    DEFAULT_CAD_MAX_FILE_SIZE_MB,
    DEFAULT_CAD_PARSE_TIMEOUT_SEC,
    load_cad_security_config,
    validate_cad_file_size,
)


def test_default_limits() -> None:
    config = load_cad_security_config({})

    assert config.max_file_size_mb == DEFAULT_CAD_MAX_FILE_SIZE_MB == 50
    assert config.parse_timeout_sec == DEFAULT_CAD_PARSE_TIMEOUT_SEC == 30
    assert config.max_file_size_bytes == 50 * 1024 * 1024


def test_limits_can_be_overridden_by_environment() -> None:
    config = load_cad_security_config(
        {"CAD_MAX_FILE_SIZE_MB": "10", "CAD_PARSE_TIMEOUT_SEC": "5"}
    )

    assert config.max_file_size_mb == 10
    assert config.parse_timeout_sec == 5


@pytest.mark.parametrize("raw", ["0", "-1", "abc"])
def test_invalid_limits_are_rejected(raw: str) -> None:
    with pytest.raises(ValueError):
        load_cad_security_config({"CAD_MAX_FILE_SIZE_MB": raw})


def test_dwg_converter_settings() -> None:
    config = load_cad_security_config({})
    assert config.dwg_converter_type == "auto"
    assert config.oda_converter_path is None

    configured = load_cad_security_config(
        {"DWG_CONVERTER_TYPE": "oda", "ODA_CONVERTER_PATH": "/opt/oda/ODAFileConverter"}
    )
    assert configured.dwg_converter_type == "oda"
    assert configured.oda_converter_path == "/opt/oda/ODAFileConverter"


@pytest.mark.parametrize("environ", [
    {"DWG_CONVERTER_TYPE": "unknown"},
    {"DWG_CONVERTER_TYPE": "oda"},
])
def test_invalid_dwg_converter_settings(environ: dict[str, str]) -> None:
    with pytest.raises(ValueError):
        load_cad_security_config(environ)


def test_file_size_validation() -> None:
    config = load_cad_security_config({"CAD_MAX_FILE_SIZE_MB": "1"})

    validate_cad_file_size(1024, config)
    with pytest.raises(ValueError, match="лимит"):
        validate_cad_file_size(1024 * 1024 + 1, config)
    with pytest.raises(ValueError, match="пустым"):
        validate_cad_file_size(0, config)
