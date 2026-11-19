# © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
"""Pydantic-контракты расчётного ядра (зеркало ``@voltwirecraft/shared``).

Поля в Python имеют имена ``snake_case``, в JSON и TypeScript — ``camelCase``.
Оба представления принимаются на входе (``populate_by_name``).
"""

from typing import Literal

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


# --- Контракты релиза v0.2.0 (зеркало Zod-схем @voltwirecraft/shared) ---

VoltageV = Literal[220, 230, 400]
Phases = Literal[1, 3]
InstallationMethod = Literal["conduit", "air"]
ConsumerKind = Literal["socket", "light", "appliance", "other"]
RoomType = Literal["living", "wet", "kitchen", "outdoor", "utility"]
CrossSectionMm2 = Literal[1.5, 2.5, 4, 6, 10, 16]
Brand = Literal["IEK", "EKF", "КЭАЗ"]


class LineSizingRequest(_ContractModel):
    """Запрос расчёта потребительской линии (RULES § 5.1, 5.3)."""

    power_w: float = Field(gt=0, description="Расчётная мощность, Вт")
    voltage_v: VoltageV
    phases: Phases
    power_factor: float = Field(gt=0, le=1, description="cos φ")
    length_m: float = Field(gt=0, description="Длина линии, м")
    installation_method: InstallationMethod = "conduit"
    consumer_kind: ConsumerKind = "other"
    room_type: RoomType | None = None
    max_voltage_drop_percent: float = Field(default=5, gt=0, le=100)


class LineSizingResponse(_ContractModel):
    """Детерминированный результат подбора линии и аппаратов защиты."""

    design_current_a: float = Field(gt=0)
    selected_cross_section_mm2: CrossSectionMm2
    permissible_current_a: float = Field(gt=0)
    voltage_drop_percent: float = Field(ge=0)
    voltage_drop_limit_percent: float = Field(gt=0)
    breaker_rating_a: int = Field(gt=0)
    rcd_current_ma: int = Field(ge=0)
    rcd_required: bool
    cable_type: str
    recommendations: list[str]
    references: list[str]
    rules_version: str


class NodeSpecsInput(_ContractModel):
    """Спецификация узла графа, пришедшая из ProjectGraph."""

    rated_power: float = Field(ge=0)
    rated_current: float = Field(gt=0)
    cross_section: float = Field(gt=0)
    mounting_height: float = Field(ge=0)


class AutoPanelNode(_ContractModel):
    """Узел графа для автосборки щита."""

    id: str = Field(min_length=1)
    kind: str
    label: str = Field(min_length=1)
    plan_position: PointPx | None = None
    panel_slot: int | None = None
    specs: NodeSpecsInput
    room_id: str | None = None


class AutoPanelRoom(_ContractModel):
    """Зона помещения для автосборки щита."""

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    type: RoomType
    polygon: list[PointPx] = Field(default_factory=list)


class AutoPanelSupply(_ContractModel):
    """Параметры ввода щита."""

    voltage_v: VoltageV = 230
    phases: Phases = 1


class AutoPanelRequest(_ContractModel):
    """Запрос детерминированной автосборки НКУ."""

    nodes: list[AutoPanelNode] = Field(default_factory=list)
    rooms: list[AutoPanelRoom] = Field(default_factory=list)
    supply: AutoPanelSupply = Field(default_factory=AutoPanelSupply)
    preferred_brand: Brand | None = None


class PanelGroup(_ContractModel):
    """Группа потребителей, выделенная на отдельную линию."""

    id: str
    name: str
    room_id: str | None
    phase: Literal["L1", "L2", "L3"]
    consumer_ids: list[str]
    total_power_w: float = Field(ge=0)
    design_current_a: float = Field(ge=0)
    cross_section_mm2: CrossSectionMm2
    breaker_rating_a: int = Field(gt=0)
    rcd_current_ma: int = Field(ge=0)
    panel_slot: int | None


class PhaseLoad(_ContractModel):
    """Нагрузка одной фазы ввода."""

    power_w: float = Field(ge=0)
    current_a: float = Field(ge=0)


class PhaseLoads(_ContractModel):
    """Нагрузки трёх фаз ввода."""

    l1: PhaseLoad
    l2: PhaseLoad
    l3: PhaseLoad


class PanelModule(_ContractModel):
    """Модуль на DIN-рейке."""

    kind: str
    label: str
    din_modules: int = Field(gt=0)
    panel_slot: int = Field(gt=0)
    group_id: str | None


class AutoPanelResponse(_ContractModel):
    """Ответ автосборки щита."""

    groups: list[PanelGroup]
    phase_loads: PhaseLoads
    imbalance_percent: float = Field(ge=0)
    modules: list[PanelModule]
    used_din_modules: int = Field(ge=0)
    enclosure_modules: int = Field(ge=0)
    warnings: list[str]
    references: list[str]
    rules_version: str
