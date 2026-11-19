import { z } from 'zod';

/** Точка трассы в координатах подложки; `scale` переводит их в метры. */
export const CablePointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  /** Высота точки относительно нуля подложки, м. */
  z: z.number().finite().default(0),
});

/** Точка трассы кабеля. */
export type CablePoint = z.infer<typeof CablePointSchema>;

/**
 * Запрос расчёта длины кабельной трассы.
 * Совпадает с контрактом `POST /calculate/cable-length` расчётного ядра.
 */
export const CableLengthRequestSchema = z
  .object({
    /** Точки ломаной трассы, минимум две. */
    points: z.array(CablePointSchema).min(2),
    /** Масштаб: метров на единицу координат подложки. */
    scale: z.number().positive(),
    /** Высоты опусков к ЭУИ, м; по одному значению на точку или пусто. */
    drops: z.array(z.number().nonnegative()).default([]),
    /** Запас на провисание и укладку, доля от длины (0,02 = 2 %). */
    slack: z.number().min(0).max(1).default(0),
  })
  .refine((value) => value.drops.length === 0 || value.drops.length === value.points.length, {
    message: 'Число высот опусков должно совпадать с числом точек либо быть нулевым',
    path: ['drops'],
  });

/** Тип запроса расчёта длины кабеля. */
export type CableLengthRequest = z.infer<typeof CableLengthRequestSchema>;

/** Результат расчёта длины кабельной трассы, все значения в метрах. */
export const CableLengthResponseSchema = z.object({
  horizontalLength: z.number().nonnegative(),
  verticalLength: z.number().nonnegative(),
  dropsLength: z.number().nonnegative(),
  totalLength: z.number().nonnegative(),
  segmentLengths: z.array(z.number().nonnegative()),
});

/** Тип результата расчёта длины кабеля. */
export type CableLengthResponse = z.infer<typeof CableLengthResponseSchema>;
