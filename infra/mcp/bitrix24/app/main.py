# © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
"""Минимальный MCP-сервер Битрикс24: вызовы Inbound Webhook с HITL для записи.

Реализует инструменты `bitrix24_get_deal` и `bitrix24_add_bom_to_deal`.
Токен из webhook-URL никогда не попадает в логи (RULES § 6.3).
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from . import __version__
from .config import load_settings

settings = load_settings()
app = FastAPI(title="VoltWireCraft Bitrix24 MCP", version=__version__)


class ToolEnvelope(BaseModel):
    """Единый ответ MCP-инструмента."""

    success: bool
    tool: str
    data: dict[str, Any] = Field(default_factory=dict)
    message: str


class GetDealInput(BaseModel):
    """Аргументы `bitrix24_get_deal`."""

    model_config = ConfigDict(extra="forbid")

    dealId: int = Field(gt=0)


class AddBomInput(BaseModel):
    """Аргументы `bitrix24_add_bom_to_deal` (запись требует HITL-подтверждения)."""

    model_config = ConfigDict(extra="forbid")

    dealId: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=255)
    totalRub: float = Field(ge=0)
    itemsSummary: str = Field(min_length=1)
    confirmationToken: str | None = None


TOOLS = [
    {
        "name": "bitrix24_get_deal",
        "description": "Возвращает сделку Битрикс24 по идентификатору.",
        "write": False,
    },
    {
        "name": "bitrix24_add_bom_to_deal",
        "description": "Добавляет комментарий со спецификацией НКУ в сделку (требует подтверждения).",
        "write": True,
    },
]


def _require_webhook() -> str:
    """Возвращает webhook URL или выбрасывает понятную ошибку."""
    if settings.webhook_url is None:
        raise HTTPException(
            status_code=503,
            detail="Битрикс24 не подключён: задайте BITRIX24_WEBHOOK_URL в окружении MCP-сервера",
        )
    return settings.webhook_url


async def _call_bitrix(method: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Вызывает метод REST API Битрикс24 через Inbound Webhook."""
    base = _require_webhook().rstrip("/")
    url = f"{base}/{method}"
    async with httpx.AsyncClient(timeout=settings.timeout_sec) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        body = response.json()
    if not isinstance(body, dict):
        raise ValueError("Битрикс24 вернул неожиданный формат ответа")
    return body


@app.get("/health")
async def health() -> dict[str, Any]:
    """Возвращает статус сервера и признак настроенного подключения."""
    return {
        "status": "ok",
        "service": "bitrix24-mcp",
        "version": __version__,
        "configured": settings.configured,
        "webhookFingerprint": settings.webhook_fingerprint,
    }


@app.get("/tools")
async def tools() -> list[dict[str, Any]]:
    """Возвращает реестр инструментов MCP-сервера."""
    return TOOLS


@app.post("/mcp/tools/{tool_name}", response_model=ToolEnvelope)
async def call_tool(tool_name: str, payload: dict[str, Any]) -> ToolEnvelope:
    """Вызывает инструмент по имени с валидацией аргументов через Pydantic."""
    if tool_name == "bitrix24_get_deal":
        arguments = GetDealInput.model_validate(payload)
        result = await _call_bitrix("crm.deal.get.json", {"id": arguments.dealId})
        return ToolEnvelope(
            success=True,
            tool=tool_name,
            data={"deal": result.get("result")},
            message="Сделка получена",
        )

    if tool_name == "bitrix24_add_bom_to_deal":
        arguments = AddBomInput.model_validate(payload)
        if arguments.confirmationToken is None or not arguments.confirmationToken.strip():
            return ToolEnvelope(
                success=False,
                tool=tool_name,
                message="Операция записи требует HITL-подтверждения (confirmationToken)",
            )
        comment = (
            f"Спецификация НКУ: {arguments.title}\n"
            f"Стоимость: {arguments.totalRub:.2f} ₽\n"
            f"Состав: {arguments.itemsSummary}"
        )
        result = await _call_bitrix(
            "crm.deal.comment.add",
            {"fields": {"ENTITY_ID": arguments.dealId, "COMMENT": comment}},
        )
        return ToolEnvelope(
            success=True,
            tool=tool_name,
            data={"comment": result.get("result")},
            message="Спецификация добавлена в сделку",
        )

    raise HTTPException(status_code=404, detail=f"Неизвестный инструмент: {tool_name}")
