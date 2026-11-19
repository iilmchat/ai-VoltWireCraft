# © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
"""Pydantic-контракты расчётного ядра (зеркало ``@voltwirecraft/shared``).

Поля в Python имеют имена ``snake_case``, в JSON и TypeScript — ``camelCase``.
Оба представления принимаются на входе (``populate_by_name``).
"""

from pydantic import AliasGenerator, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _ContractModel(BaseModel):
    """Основа строгого контракта: camelCase-псевдонимы и запрет лишних полей."""

    model_config = ConfigDict(
        alias_generator=AliasGenerator(
            validation_alias=to_camel,
            serialization_alias=to_camel,
        ),
        populate_by_name=True,
        extra="forbid",
        allow_inf_nan=False,
    )


class PointPx(_ContractModel):
    """Точка трассы в координатах подложки (пикселях)."""

    x: float
    y: float


class CalculateCableLengthRequest(_ContractModel):
    """Входные данные расчёта длины кабельной линии.

   Физические длины заданы в базовых единицах СИ (RULES § 5.3),
    координаты — в пикселях с масштабом ``scale_meters_per_px``.
    """

    waypoints_px: list[PointPx] = Field(default_factory=list)
    scale_meters_per_px: float = Field(gt=0)
    ceiling_height_m: float = Field(ge=0)
    source_mount_height_m: float = Field(ge=0)
    target_mount_height_m: float = Field(ge=0)
    reserve_factor: float = Field(default=1.15, ge=1)


class CalculateCableLengthResponse(_ContractModel):
    """Детерминированный результат расчёта длины кабельной линии."""

    length_m: float = Field(ge=0)
    horizontal_length_m: float = Field(ge=0)
    vertical_length_m: float = Field(ge=0)
    reserve_factor: float = Field(ge=1)
    waypoints_count: int = Field(ge=0)


class HealthResponse(BaseModel):
    """Ответ проверки готовности расчётного ядра."""

    status: str
    version: str
    service: str
