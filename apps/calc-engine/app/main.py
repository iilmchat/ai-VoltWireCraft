# © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
"""HTTP-обвязка расчётного ядра над детерминированными функциями.

API только валидирует контракт и вызывает ``calculate_cable_length``;
само оно физические величины не вычисляет (RULES § 5.1).
"""

import os

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .auto_panel import auto_assemble_panel
from .cad_parser import parse_dwg_bytes, parse_dxf_bytes
from .calculator import calculate_cable_length
from .line_sizing import calculate_line_sizing
from .schemas import (
    AutoPanelRequest,
    AutoPanelResponse,
    CalculateCableLengthRequest,
    CalculateCableLengthResponse,
    CadParseResponse,
    HealthResponse,
    LineSizingRequest,
    LineSizingResponse,
    ShortCircuitRequest,
    ShortCircuitResponse,
)
from .short_circuit import calculate_short_circuit

app = FastAPI(
    title="VoltWireCraft Calc Engine",
    description="Детерминированные расчёты электрических сетей 0,4 кВ",
    version=__version__,
)

_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Возвращает признак готовности расчётного ядра."""
    return HealthResponse(status="ok", version=__version__, service="calc-engine")


@app.post("/v1/calc/cable-length", response_model=CalculateCableLengthResponse)
def calculate_cable_length_endpoint(
    request: CalculateCableLengthRequest,
) -> CalculateCableLengthResponse:
    """Рассчитывает длину кабельной линии по точкам трассы и высотам."""
    return calculate_cable_length(request)


@app.post("/v1/calc/line-sizing", response_model=LineSizingResponse)
def calculate_line_sizing_endpoint(request: LineSizingRequest) -> LineSizingResponse:
    """Подбирает сечение кабеля, автомат и УЗО по мощности и длине линии."""
    return calculate_line_sizing(request)


@app.post("/v1/calc/auto-panel", response_model=AutoPanelResponse)
def auto_assemble_panel_endpoint(request: AutoPanelRequest) -> AutoPanelResponse:
    """Собирает щит НКУ: группы, фазы и расстановку модулей на DIN-рейке."""
    return auto_assemble_panel(request)


@app.post("/v1/calc/short-circuit", response_model=ShortCircuitResponse)
def calculate_short_circuit_endpoint(request: ShortCircuitRequest) -> ShortCircuitResponse:
    """Рассчитывает петлю «фаза-ноль», кратность срабатывания и селективность."""
    return calculate_short_circuit(request)


@app.post("/v1/cad/parse-dxf", response_model=CadParseResponse)
async def parse_dxf_endpoint(
    file: UploadFile = File(...),
    units: str | None = Form(default=None),
) -> CadParseResponse:
    """Разбирает DXF- или DWG-план в стены с координатами в метрах СИ."""
    data = await file.read()
    is_dwg = (file.filename or "").lower().endswith(".dwg") or data[:2] == b"AC"
    try:
        return parse_dwg_bytes(data, units) if is_dwg else parse_dxf_bytes(data, units)
    except FileNotFoundError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except TimeoutError as error:
        raise HTTPException(status_code=504, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=422, detail="Не удалось разобрать CAD-файл") from error


# Обратная совместимость с ранним каркасом: прежний путь остаётся рабочим.
app.add_api_route(
    "/calculate/cable-length",
    calculate_cable_length_endpoint,
    methods=["POST"],
    response_model=CalculateCableLengthResponse,
)
