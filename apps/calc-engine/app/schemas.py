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
    # Каскад ВРУ → ЩР: потеря на питающей магистрали, %.
    upstream_voltage_drop_percent: float = Field(default=0, ge=0)


class LineSizingResponse(_ContractModel):
    """Детерминированный результат подбора линии и аппаратов защиты."""

    design_current_a: float = Field(gt=0)
    selected_cross_section_mm2: CrossSectionMm2
    permissible_current_a: float = Field(gt=0)
    voltage_drop_percent: float = Field(ge=0)
    voltage_drop_limit_percent: float = Field(gt=0)
    # Суммарная потеря: магистраль + групповая линия, %.
    total_voltage_drop_percent: float = Field(ge=0)
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
    phase: Literal["1P", "3P"] | None = None
    voltage_v: VoltageV | None = None
    breaking_capacity_ka: float | None = Field(default=None, gt=0)


class AutoPanelNode(_ContractModel):
    """Узел графа для автосборки щита."""

    id: str = Field(min_length=1)
    kind: str
    label: str = Field(min_length=1)
    plan_position: PointPx | None = None
    panel_slot: int | None = None
    specs: NodeSpecsInput
    room_id: str | None = None
    # Ссылка на позицию каталога из ProjectGraphSchema v2.
    catalog_device_id: str | None = None
    # Многощитовая иерархия ВРУ → ЩР (ProjectGraphSchema v0.6).
    panel_role: str | None = None
    parent_panel_id: str | None = None


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
    supply_topology: Literal["1P_230V", "3P_400V"] | None = None
    panel_poles: Literal[2, 3, 4] | None = None


class AutoPanelRequest(_ContractModel):
    """Запрос детерминированной автосборки НКУ."""

    nodes: list[AutoPanelNode] = Field(default_factory=list)
    rooms: list[AutoPanelRoom] = Field(default_factory=list)
    supply: AutoPanelSupply = Field(default_factory=AutoPanelSupply)
    target_panel_id: str | None = None
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

    # Контракт shared использует заглавные имена фаз L1/L2/L3.
    l1: PhaseLoad = Field(validation_alias="L1", serialization_alias="L1")
    l2: PhaseLoad = Field(validation_alias="L2", serialization_alias="L2")
    l3: PhaseLoad = Field(validation_alias="L3", serialization_alias="L3")


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


# --- Контракты релиза v0.3.0 (КЗ «фаза-ноль» и CAD) ---

TripCurve = Literal["B", "C", "D"]


class ShortCircuitRequest(_ContractModel):
    """Запрос расчёта однофазного тока КЗ в конце линии."""

    transformer_power_kva: float = Field(gt=0, description="Мощность трансформатора, кВА")
    transformer_uk_percent: float = Field(default=4.5, gt=0, le=100)
    voltage_v: VoltageV = 230
    cable_length_m: float = Field(gt=0)
    cross_section_mm2: CrossSectionMm2
    breaker_rating_a: float = Field(gt=0)
    trip_curve: TripCurve = "C"
    upstream_breaker_rating_a: float | None = None
    upstream_trip_curve: TripCurve | None = None
    resistance_ohm_mm2_per_m: float = Field(default=0.0175, gt=0)
    reactance_ohm_per_km: float = Field(default=0.08, ge=0)
    transformer_impedance_ohm: float | None = Field(default=None, ge=0)
    # Суммарное сопротивление петли вышестоящей магистрали, Ом.
    upstream_impedance_ohm: float = Field(default=0, ge=0)


class ShortCircuitResponse(_ContractModel):
    """Детерминированный результат расчёта петли «фаза-ноль» и селективности."""

    transformer_impedance_ohm: float = Field(gt=0)
    phase_resistance_ohm: float = Field(gt=0)
    neutral_resistance_ohm: float = Field(gt=0)
    loop_reactance_ohm: float = Field(ge=0)
    loop_impedance_ohm: float = Field(gt=0)
    short_circuit_current_a: float = Field(gt=0)
    required_multiplicity: float = Field(gt=0)
    minimum_multiplicity: float = Field(gt=0)
    actual_multiplicity: float = Field(ge=0)
    instantaneous_trip_a: float = Field(gt=0)
    disconnect_complies: bool
    selectivity_ok: bool
    upstream_to_downstream_ratio: float = Field(ge=0)
    trip_time_s: float = Field(ge=0)
    warnings: list[str]
    references: list[str]
    rules_version: str


class CadPoint(_ContractModel):
    """Точка контура стены в метрах СИ."""

    x: float
    y: float


class ParsedWall(_ContractModel):
    """Стена, извлечённая из DXF-плана."""

    kind: Literal["wall", "partition", "doorway", "window"]
    path: list[CadPoint] = Field(min_length=2)
    thickness: float = Field(ge=0)


class CadParseResponse(_ContractModel):
    """Нормализованные слои стен из CAD-файла."""

    walls: list[ParsedWall]
    units: str
    entities_processed: int = Field(ge=0)
    warnings: list[str]
    rules_version: str


# --- Контракты релиза v0.6.0 (ВТХ и многощитовые цепочки) ---


class TccDeviceInput(_ContractModel):
    """Аппарат защиты в цепочке ВРУ → ЩР → линия."""

    id: str = Field(min_length=1)
    rated_current_a: float = Field(gt=0)
    trip_curve: Literal["B", "C", "D"]
    breaking_capacity_ka: float | None = Field(default=None, gt=0)
    parent_id: str | None = None
    short_circuit_current_a: float | None = Field(default=None, gt=0)


class SelectivityTccRequest(_ContractModel):
    """Запрос расчёта время-токовых характеристик и каскадного ΔU."""

    devices: list[TccDeviceInput] = Field(min_length=1)
    upstream_voltage_drop_percent: float = Field(default=0, ge=0)
    group_voltage_drop_percent: float = Field(default=0, ge=0)
    voltage_drop_limit_percent: float = Field(default=5, gt=0, le=100)


class TccPoint(_ContractModel):
    """Точка время-токовой характеристики."""

    current_a: float = Field(gt=0)
    time_s: float = Field(ge=0)


class TccPairResult(_ContractModel):
    """Результат проверки пары аппаратов."""

    downstream_id: str
    upstream_id: str
    selectivity_limit_a: float = Field(ge=0)
    selective: bool


class SelectivityTccResponse(_ContractModel):
    """Детерминированный результат расчёта ВТХ и каскадной сети."""

    status: Literal["full", "partial", "none"]
    selectivity_limit_a: float = Field(ge=0)
    breaking_capacity_ok: bool
    total_voltage_drop_percent: float = Field(ge=0)
    voltage_drop_ok: bool
    pairs: list[TccPairResult]
    upstream_curve: list[TccPoint]
    downstream_curve: list[TccPoint]
    warnings: list[str]
    references: list[str]
    rules_version: str
