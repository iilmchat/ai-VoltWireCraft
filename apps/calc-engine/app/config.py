# © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
"""Конфигурация безопасности разбора CAD-файлов (RULES § 5.5).

Ограничения читаются из окружения при старте процесса; некорректные значения
приводят к ошибке импорта (fail-fast).
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

# Максимальный размер пользовательского CAD-файла, МБ.
DEFAULT_CAD_MAX_FILE_SIZE_MB = 50
# Максимальное время разбора одного файла, с.
DEFAULT_CAD_PARSE_TIMEOUT_SEC = 30
# Допустимые стратегии конвертации DWG → DXF.
DWG_CONVERTER_TYPES = ("auto", "oda", "libredwg", "none")
# Стратегия по умолчанию: ODA, если задан путь, иначе встроенный dwg2dxf.
DEFAULT_DWG_CONVERTER_TYPE = "auto"


@dataclass(frozen=True)
class CadSecurityConfig:
    """Ограничения по размеру файла и времени разбора."""

    max_file_size_mb: int
    parse_timeout_sec: int
    dwg_converter_type: str = DEFAULT_DWG_CONVERTER_TYPE
    oda_converter_path: str | None = None

    @property
    def max_file_size_bytes(self) -> int:
        """Максимальный размер файла в байтах."""
        return self.max_file_size_mb * 1024 * 1024


def _read_positive_int(source: Mapping[str, str], name: str, default: int) -> int:
    """Читает положительное целое число из окружения."""
    raw = source.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} должно быть целым числом") from error
    if value <= 0:
        raise ValueError(f"{name} должно быть положительным")
    return value


def load_cad_security_config(
    environ: Mapping[str, str] | None = None,
) -> CadSecurityConfig:
    """Собирает конфигурацию CAD-парсера из переменных окружения.

    Параметры:
        environ: отображение окружения; по умолчанию используется ``os.environ``.

    Возвращает:
        Валидированная конфигурация.

    Исключения:
        ValueError: если лимит не положителен, тип конвертера неизвестен или
            для `oda` не задан путь к конвертеру.
    """
    source = os.environ if environ is None else environ
    converter_type = source.get("DWG_CONVERTER_TYPE", DEFAULT_DWG_CONVERTER_TYPE).strip().lower()
    if converter_type not in DWG_CONVERTER_TYPES:
        raise ValueError(
            f"DWG_CONVERTER_TYPE должно быть одним из: {', '.join(DWG_CONVERTER_TYPES)}"
        )
    oda_path = source.get("ODA_CONVERTER_PATH", "").strip()
    if converter_type == "oda" and not oda_path:
        raise ValueError("При DWG_CONVERTER_TYPE=oda необходимо задать ODA_CONVERTER_PATH")
    return CadSecurityConfig(
        max_file_size_mb=_read_positive_int(
            source, "CAD_MAX_FILE_SIZE_MB", DEFAULT_CAD_MAX_FILE_SIZE_MB
        ),
        parse_timeout_sec=_read_positive_int(
            source, "CAD_PARSE_TIMEOUT_SEC", DEFAULT_CAD_PARSE_TIMEOUT_SEC
        ),
        dwg_converter_type=converter_type,
        oda_converter_path=oda_path if oda_path else None,
    )


def validate_cad_file_size(
    size_bytes: int,
    config: CadSecurityConfig | None = None,
) -> None:
    """Проверяет размер файла перед передачей в изолированный парсер.

    Параметры:
        size_bytes: размер загруженного файла в байтах.
        config: конфигурация; по умолчанию берётся глобальная.

    Исключения:
        ValueError: если файл пуст или превышает лимит.
    """
    limits = CAD_SECURITY_CONFIG if config is None else config
    if size_bytes <= 0:
        raise ValueError("CAD-файл не может быть пустым")
    if size_bytes > limits.max_file_size_bytes:
        raise ValueError(
            f"CAD-файл превышает лимит {limits.max_file_size_mb} МБ"
        )


# Глобальная конфигурация, загруженная при импорте модуля.
CAD_SECURITY_CONFIG = load_cad_security_config()
