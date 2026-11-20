# © 2026 RuChating (iilmchat) · VoltWireCraft v0.8.0
"""Конфигурация MCP-обёртки МойСклад (RULES § 6: секреты только в окружении)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from hashlib import sha256

DEFAULT_BASE_URL = "https://api.moysklad.ru/api/remap/1.2"


@dataclass(frozen=True)
class MoyskladSettings:
    """Настройки подключения к JSON API 1.2."""

    token: str | None
    base_url: str
    timeout_sec: float

    @property
    def configured(self) -> bool:
        """Признак наличия токена доступа."""
        return self.token is not None

    @property
    def token_fingerprint(self) -> str:
        """Короткий хэш токена для логов — сам токен не логируется."""
        if self.token is None:
            return "none"
        return sha256(self.token.encode("utf-8")).hexdigest()[:8]


def load_settings() -> MoyskladSettings:
    """Читает и валидирует переменные окружения при старте."""
    token = os.environ.get("MOYSKLAD_TOKEN", "").strip() or None
    base_url = os.environ.get("MOYSKLAD_BASE_URL", DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL
    if not base_url.startswith("https://"):
        raise ValueError("MOYSKLAD_BASE_URL должен быть HTTPS URL")
    timeout_raw = os.environ.get("MCP_HTTP_TIMEOUT_SEC", "10")
    try:
        timeout = float(timeout_raw)
    except ValueError as error:
        raise ValueError("MCP_HTTP_TIMEOUT_SEC должно быть числом") from error
    if timeout <= 0:
        raise ValueError("MCP_HTTP_TIMEOUT_SEC должно быть положительным")
    return MoyskladSettings(token=token, base_url=base_url.rstrip("/"), timeout_sec=timeout)
