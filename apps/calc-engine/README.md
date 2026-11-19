# Calc Engine — детерминированное расчётное ядро

**© 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0**

Python-сервис, в котором **исключительно** выполняются физические расчёты
электрических сетей (RULES § 5.1). ИИ-агент не вычисляет длины, сечения и токи
самостоятельно — он вызывает инструменты этого ядра и интерпретирует результат.

## Состав

| Модуль | Назначение |
|---|---|
| `app/schemas.py` | Pydantic-контракты (зеркало `@voltwirecraft/shared`) |
| `app/calculator.py` | расчёт длины кабельной линии в метрах |
| `app/main.py` | FastAPI: `GET /health`, `POST /v1/calc/cable-length` |
| `tests/` | юнит-тесты расчёта и HTTP-контракта |

## Формула

```
L_гор   = Σ √(Δx² + Δy²) × scale_meters_per_px
L_верт  = |H_потолка − H_источника| + |H_потолка − H_приёмника|
L       = (L_гор + L_верт) × K_запаса
```

`K_запаса` по умолчанию `1.15`. Нулевая трасса (0 или 1 точка) даёт нулевую
горизонтальную длину, но вертикальные опуски учитываются. Все вычисления идут
в `Decimal`, результат округляется до 1 мкм (`ROUND_HALF_UP`) — расчёт
детерминирован.

## Запуск

```bash
python -m pytest apps/calc-engine/tests -q
uvicorn app.main:app --app-dir apps/calc-engine --port 8000
```

## Контракт

Запрос и ответ используют `camelCase` (как TypeScript-схемы в `packages/shared`):

```json
{
  "waypointsPx": [{ "x": 0, "y": 0 }, { "x": 100, "y": 0 }],
  "scaleMetersPerPx": 0.01,
  "ceilingHeightM": 2.5,
  "sourceMountHeightM": 0.3,
  "targetMountHeightM": 1.5,
  "reserveFactor": 1.15
}
```

Путь `/calculate/cable-length` сохранён как обратно совместимый псевдоним.
