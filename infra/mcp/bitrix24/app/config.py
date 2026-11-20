# © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
"""Конфигурация MCP-обёртки Битрикс24 (RULES § 6: секреты только в окружении)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from hashlib import sha256


@dataclass(frozen=True)
class BitrixSettings:
    """Настройки подключения к Inbound Webhook."""

    webhook_url: str | None
    timeout_sec: float

    @property
    def configured(self) -> bool:
        """Признак наличия настроенного webhook-а."""
        return self.webhook_url is not None

    @property
    def webhook_fingerprint(self) -> str:
        """Короткий хэш секрета для логов — сам URL никогда не логируется."""
        if self.webhook_url is None:
            return "none"
        return sha256(self.webhook_url.encode("utf-8")).hexdigest()[:8]


def load_settings() -> BitrixSettings:
    """Читает и валидирует переменные окружения при старте."""
    raw = os.environ.get("BITRIX24_WEBHOOK_URL", "").strip()
    if raw and not raw.startswith("https://"):
        raise ValueError("BITRIX24_WEBHOOK_URL должен быть HTTPS URL")
    timeout_raw = os.environ.get("MCP_HTTP_TIMEOUT_SEC", "10")
    try:
        timeout = float(timeout_raw)
    except ValueError as error:
        raise ValueError("MCP_HTTP_TIMEOUT_SEC должно быть числом") from error
    if timeout <= 0:
        raise ValueError("MCP_HTTP_TIMEOUT_SEC должно быть положительным")
    return BitrixSettings(webhook_url=raw or None, timeout_sec=timeout)
