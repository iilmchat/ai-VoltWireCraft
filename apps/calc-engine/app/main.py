# © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
"""HTTP-обвязка расчётного ядра над детерминированными функциями.

API только валидирует контракт и вызывает ``calculate_cable_length``;
само оно физические величины не вычисляет (RULES § 5.1).
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .calculator import calculate_cable_length
from .schemas import (
    CalculateCableLengthRequest,
    CalculateCableLengthResponse,
    HealthResponse,
)

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


# Обратная совместимость с ранним каркасом: прежний путь остаётся рабочим.
app.add_api_route(
    "/calculate/cable-length",
    calculate_cable_length_endpoint,
    methods=["POST"],
    response_model=CalculateCableLengthResponse,
)
