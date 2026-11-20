# © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
"""Минимальный MCP-сервер МойСклад: JSON API 1.2 с HITL для операций записи.

Инструменты: `moysklad_check_stock`, `moysklad_create_customer_order`.
Токен не логируется — в ответе health публикуется только его хэш (RULES § 6.3).
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from . import __version__
from .config import load_settings

settings = load_settings()
app = FastAPI(title="VoltWireCraft MoySklad MCP", version=__version__)


class ToolEnvelope(BaseModel):
    """Единый ответ MCP-инструмента."""

    success: bool
    tool: str
    data: dict[str, Any] = Field(default_factory=dict)
    message: str


class CheckStockInput(BaseModel):
    """Аргументы `moysklad_check_stock`."""

    model_config = ConfigDict(extra="forbid")

    skus: list[str] = Field(min_length=1, max_length=100)


class CreateOrderInput(BaseModel):
    """Аргументы `moysklad_create_customer_order` (запись требует подтверждения)."""

    model_config = ConfigDict(extra="forbid")

    projectTitle: str = Field(min_length=1, max_length=255)
    items: list[dict[str, Any]] = Field(min_length=1, max_length=200)
    confirmationToken: str | None = None


TOOLS = [
    {
        "name": "moysklad_check_stock",
        "description": "Возвращает остатки по артикулам (SKU).",
        "write": False,
    },
    {
        "name": "moysklad_create_customer_order",
        "description": "Создаёт заказ покупателя по спецификации проекта (требует подтверждения).",
        "write": True,
    },
]


def _headers() -> dict[str, str]:
    """Формирует заголовки авторизации, если токен настроен."""
    if settings.token is None:
        raise HTTPException(
            status_code=503,
            detail="МойСклад не подключён: задайте MOYSKLAD_TOKEN в окружении MCP-сервера",
        )
    return {
        "Authorization": f"Bearer {settings.token}",
        "Accept": "application/json;charset=utf-8",
        "Content-Type": "application/json",
    }


async def _get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    """Выполняет GET-запрос к JSON API."""
    async with httpx.AsyncClient(timeout=settings.timeout_sec) as client:
        response = await client.get(f"{settings.base_url}{path}", headers=_headers(), params=params)
        response.raise_for_status()
        body = response.json()
    if not isinstance(body, dict):
        raise ValueError("МойСклад вернул неожиданный формат ответа")
    return body


async def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Выполняет POST-запрос к JSON API."""
    async with httpx.AsyncClient(timeout=settings.timeout_sec) as client:
        response = await client.post(f"{settings.base_url}{path}", headers=_headers(), json=payload)
        response.raise_for_status()
        body = response.json()
    if not isinstance(body, dict):
        raise ValueError("МойСклад вернул неожиданный формат ответа")
    return body


@app.get("/health")
async def health() -> dict[str, Any]:
    """Возвращает статус сервера и признак настроенного токена."""
    return {
        "status": "ok",
        "service": "moysklad-mcp",
        "version": __version__,
        "configured": settings.configured,
        "tokenFingerprint": settings.token_fingerprint,
    }


@app.get("/tools")
async def tools() -> list[dict[str, Any]]:
    """Возвращает реестр инструментов MCP-сервера."""
    return TOOLS


@app.post("/mcp/tools/{tool_name}", response_model=ToolEnvelope)
async def call_tool(tool_name: str, payload: dict[str, Any]) -> ToolEnvelope:
    """Вызывает инструмент по имени с валидацией аргументов через Pydantic."""
    if tool_name == "moysklad_check_stock":
        arguments = CheckStockInput.model_validate(payload)
        rows: list[dict[str, Any]] = []
        for sku in arguments.skus:
            result = await _get("/assortment", {"filter": f"article={sku}", "limit": 1})
            found = result.get("rows") or []
            row = found[0] if found else {}
            rows.append({"sku": sku, "stock": row.get("stock"), "name": row.get("name")})
        return ToolEnvelope(
            success=True,
            tool=tool_name,
            data={"items": rows},
            message="Остатки получены",
        )

    if tool_name == "moysklad_create_customer_order":
        arguments = CreateOrderInput.model_validate(payload)
        if arguments.confirmationToken is None or not arguments.confirmationToken.strip():
            return ToolEnvelope(
                success=False,
                tool=tool_name,
                message="Операция записи требует HITL-подтверждения (confirmationToken)",
            )
        description_lines = [
            f"{item.get('sku', '—')}: {item.get('quantity', 1)} шт." for item in arguments.items
        ]
        result = await _post(
            "/entity/customerorder",
            {
                "name": arguments.projectTitle,
                "description": "Спецификация НКУ. " + "; ".join(description_lines),
            },
        )
        return ToolEnvelope(
            success=True,
            tool=tool_name,
            data={"order": result},
            message="Заказ покупателя создан",
        )

    raise HTTPException(status_code=404, detail=f"Неизвестный инструмент: {tool_name}")
