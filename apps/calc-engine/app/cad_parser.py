# © 2026 RuChating (iilmchat) · VoltWireCraft v0.3.0
"""Изолированный разбор DXF-планов в нормализованные стены (RULES § 5.5).

Поддерживаются примитивы `LINE` и `LWPOLYLINE` со слоёв стен/перегородок.
Координаты переводятся в метры СИ по `$INSUNITS` (мм/см/м/дюйм).
Внешние ссылки (XREF), скрипты и макросы не исполняются: `ezdxf` читает
только геометрию модели. Размер файла и число сущностей ограничены.
"""

import os
import tempfile
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from pathlib import Path

import ezdxf

from .config import CAD_SECURITY_CONFIG, validate_cad_file_size
from .schemas import CadParseResponse, CadPoint, ParsedWall

# Лимиты берутся из конфигурации (по умолчанию 50 МБ / 30 с, DESIGN_V030 § 3.2).
MAX_CAD_FILE_BYTES = CAD_SECURITY_CONFIG.max_file_size_bytes
PARSE_TIMEOUT_S = CAD_SECURITY_CONFIG.parse_timeout_sec
# Защита от «бомб»: предел числа сущностей.
MAX_ENTITIES = 200_000
# Предел памяти для POSIX-процесса разбора, байт (512 МБ).
POSIX_MEMORY_LIMIT_BYTES = 512 * 1024 * 1024

# Коэффициент перевода единиц чертежа в метры ($INSUNITS).
_UNIT_SCALE: dict[int, tuple[str, float]] = {
    0: ("mm", 0.001),  # без единиц — консервативно считаем миллиметры
    1: ("in", 0.0254),
    4: ("mm", 0.001),
    5: ("cm", 0.01),
    6: ("m", 1.0),
}
_OVERRIDE_SCALE: dict[str, tuple[str, float]] = {
    "mm": ("mm", 0.001),
    "cm": ("cm", 0.01),
    "m": ("m", 1.0),
    "in": ("in", 0.0254),
}

# Ключевые слова в имени слоя, определяющие вид стены.
_LAYER_KINDS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("window", "окн"), "window"),
    (("door", "двер", "проём"), "doorway"),
    (("partition", "перегородк"), "partition"),
    (("wall", "стен"), "wall"),
)


def _classify_layer(layer: str) -> str | None:
    """Определяет вид стены по имени слоя; `None` — слой не геометрии стен."""
    lowered = layer.lower()
    for keywords, kind in _LAYER_KINDS:
        if any(keyword in lowered for keyword in keywords):
            return kind
    return None


def _to_meters(value: float, scale: float) -> float:
    """Переводит координату в метры и округляет до 1 мкм."""
    return round(value * scale, 6)


def apply_posix_limits() -> None:
    """Ограничивает память процесса разбора на POSIX; на Windows — no-op.

    Вызывается в отдельном процессе/воркере до чтения чертежа (RULES § 5.5).
    """
    if os.name != "posix":
        return
    import resource  # доступен только на POSIX

    resource.setrlimit(resource.RLIMIT_AS, (POSIX_MEMORY_LIMIT_BYTES, POSIX_MEMORY_LIMIT_BYTES))
    resource.setrlimit(resource.RLIMIT_CPU, (PARSE_TIMEOUT_S + 1, PARSE_TIMEOUT_S + 1))


def parse_dxf_file(path: str | Path, units_override: str | None = None) -> CadParseResponse:
    """Разбирает DXF-файл в список стен с координатами в метрах.

    :param path — путь к DXF-файлу.
    :param units_override — принудительные единицы (`mm`, `cm`, `m`, `in`).
    :returns: нормализованные стены и метаданные разбора.
    :raises ValueError: если файл слишком велик, повреждён или содержит слишком много сущностей.
    """
    validate_cad_file_size(Path(path).stat().st_size)
    if units_override is not None and units_override not in _OVERRIDE_SCALE:
        raise ValueError("Неподдерживаемые единицы чертежа")

    document = ezdxf.readfile(str(path))
    if units_override is not None:
        unit_name, scale = _OVERRIDE_SCALE[units_override]
    else:
        insunits = int(document.header.get("$INSUNITS", 0))
        unit_name, scale = _UNIT_SCALE.get(insunits, _UNIT_SCALE[0])

    walls: list[ParsedWall] = []
    entities_processed = 0
    for entity in document.modelspace():
        entities_processed += 1
        if entities_processed > MAX_ENTITIES:
            raise ValueError("Превышено допустимое число сущностей чертежа")

        kind = _classify_layer(entity.dxf.layer)
        if kind is None or entity.dxftype() not in ("LINE", "LWPOLYLINE"):
            continue

        if entity.dxftype() == "LINE":
            points = [entity.dxf.start, entity.dxf.end]
        else:
            points = [tuple(point) for point in entity.get_points("xy")]

        if len(points) < 2:
            continue

        width = (
            float(entity.dxf.get("const_width", 0.0) or 0.0)
            if entity.dxf.hasattr("const_width")
            else 0.0
        )
        thickness = _to_meters(width, scale) if width > 0 else 0.1
        walls.append(
            ParsedWall(
                kind=kind,
                path=[CadPoint(x=_to_meters(p[0], scale), y=_to_meters(p[1], scale)) for p in points],
                thickness=thickness,
            )
        )

    warnings: list[str] = []
    if not walls:
        warnings.append("На совпадающих со слоями стен не найдено примитивов LINE/LWPOLYLINE")
    return CadParseResponse(
        walls=walls,
        units=unit_name,
        entities_processed=entities_processed,
        warnings=warnings,
        rules_version="0.1",
    )


def parse_dxf_bytes(data: bytes, units_override: str | None = None) -> CadParseResponse:
    """Разбирает содержимое DXF из памяти с таймаутом 30 с.

    :param data — байты файла DXF.
    :param units_override — принудительные единицы.
    :returns: стены в метрах СИ.
    :raises ValueError: при некорректном или слишком большом файле.
    :raises TimeoutError: если разбор занял больше 30 с.
    """
    validate_cad_file_size(len(data))

    with tempfile.TemporaryDirectory(prefix="vwc-cad-") as directory:
        path = Path(directory) / "plan.dxf"
        path.write_bytes(data)
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(parse_dxf_file, str(path), units_override)
            try:
                return future.result(timeout=PARSE_TIMEOUT_S)
            except FutureTimeout as error:
                future.cancel()
                raise TimeoutError("Превышен таймаут разбора DXF (30 с)") from error


__all__ = [
    "MAX_CAD_FILE_BYTES",
    "PARSE_TIMEOUT_S",
    "apply_posix_limits",
    "parse_dxf_bytes",
    "parse_dxf_file",
]
