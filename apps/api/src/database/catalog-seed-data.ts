// © 2026 RuChating (iilmchat) · VoltWireCraft v0.2.0
/** Базовый набор каталога модульного оборудования для сида (RULES § 1.13). */

import type { catalogDevices } from './schema.js';

/** Тип новой записи каталога (без генерируемого идентификатора). */
export type CatalogSeedRow = Omit<typeof catalogDevices.$inferInsert, 'id'>;

/**
 * Ходовые позиции: автоматы 6–63 А кривых B/C, УЗО, АВДТ, реле напряжения,
 * кросс-модули и корпуса НКУ на 12/24/36/54 модуля. Все цены — в рублях,
 * токи — в амперах, габариты — в 18-мм модулях (RULES § 5.3).
 */
export const CATALOG_SEED_ROWS: readonly CatalogSeedRow[] = [
  // Автоматические выключатели IEK VA47-29, кривая B, 1P.
  ...[6, 10, 16, 20, 25, 32, 40, 63].map((current): CatalogSeedRow => ({
    brand: 'IEK',
    series: 'VA47-29',
    sku: `IEK-VA47-29-B${current}`,
    name: `Автоматический выключатель IEK VA47-29 1P B${current}`,
    deviceType: 'circuit_breaker',
    poles: '1P',
    ratedCurrentA: current,
    tripCurve: 'B',
    breakingCapacityKa: '4.5',
    widthModules: 1,
    priceRub: '690.00',
    specsJson: { ratedVoltageV: 230, mounting: 'DIN-рейка' },
  })),
  // Автоматические выключатели IEK VA47-29, кривая C, 1P.
  ...[6, 10, 16, 20, 25, 32, 40, 63].map((current): CatalogSeedRow => ({
    brand: 'IEK',
    series: 'VA47-29',
    sku: `IEK-VA47-29-C${current}`,
    name: `Автоматический выключатель IEK VA47-29 1P C${current}`,
    deviceType: 'circuit_breaker',
    poles: '1P',
    ratedCurrentA: current,
    tripCurve: 'C',
    breakingCapacityKa: '4.5',
    widthModules: 1,
    priceRub: '690.00',
    specsJson: { ratedVoltageV: 230, mounting: 'DIN-рейка' },
  })),
  // Автоматические выключатели EKF MN61.
  { brand: 'EKF', series: 'MN61', sku: 'EKF-MN61-B16', name: 'Автоматический выключатель EKF MN61 1P B16', deviceType: 'circuit_breaker', poles: '1P', ratedCurrentA: 16, tripCurve: 'B', breakingCapacityKa: '6', widthModules: 1, priceRub: '585.00', specsJson: { ratedVoltageV: 400, mounting: 'DIN-рейка' } },
  { brand: 'EKF', series: 'MN61', sku: 'EKF-MN61-C16', name: 'Автоматический выключатель EKF MN61 1P C16', deviceType: 'circuit_breaker', poles: '1P', ratedCurrentA: 16, tripCurve: 'C', breakingCapacityKa: '6', widthModules: 1, priceRub: '585.00', specsJson: { ratedVoltageV: 400, mounting: 'DIN-рейка' } },
  { brand: 'EKF', series: 'MN61', sku: 'EKF-MN61-C25', name: 'Автоматический выключатель EKF MN61 1P C25', deviceType: 'circuit_breaker', poles: '1P', ratedCurrentA: 25, tripCurve: 'C', breakingCapacityKa: '6', widthModules: 1, priceRub: '610.00', specsJson: { ratedVoltageV: 400, mounting: 'DIN-рейка' } },
  { brand: 'EKF', series: 'MN61', sku: 'EKF-MN61-C32', name: 'Автоматический выключатель EKF MN61 1P C32', deviceType: 'circuit_breaker', poles: '1P', ratedCurrentA: 32, tripCurve: 'C', breakingCapacityKa: '6', widthModules: 1, priceRub: '640.00', specsJson: { ratedVoltageV: 400, mounting: 'DIN-рейка' } },
  // Автоматические выключатели КЭАЗ OptiMax.
  { brand: 'КЭАЗ', series: 'OptiMax', sku: 'KEAZ-OM-C16', name: 'Автоматический выключатель КЭАЗ OptiMax 1P C16', deviceType: 'circuit_breaker', poles: '1P', ratedCurrentA: 16, tripCurve: 'C', breakingCapacityKa: '10', widthModules: 1, priceRub: '940.00', specsJson: { ratedVoltageV: 400, mounting: 'DIN-рейка' } },
  { brand: 'КЭАЗ', series: 'OptiMax', sku: 'KEAZ-OM-C25', name: 'Автоматический выключатель КЭАЗ OptiMax 1P C25', deviceType: 'circuit_breaker', poles: '1P', ratedCurrentA: 25, tripCurve: 'C', breakingCapacityKa: '10', widthModules: 1, priceRub: '960.00', specsJson: { ratedVoltageV: 400, mounting: 'DIN-рейка' } },
  { brand: 'КЭАЗ', series: 'OptiMax', sku: 'KEAZ-OM-C40', name: 'Автоматический выключатель КЭАЗ OptiMax 1P C40', deviceType: 'circuit_breaker', poles: '1P', ratedCurrentA: 40, tripCurve: 'C', breakingCapacityKa: '10', widthModules: 1, priceRub: '990.00', specsJson: { ratedVoltageV: 400, mounting: 'DIN-рейка' } },
  // УЗО с уставками 30/100/300 мА.
  { brand: 'IEK', series: 'RCD', sku: 'IEK-RCD-25-30', name: 'УЗО IEK 2P 25А 30 мА', deviceType: 'rcd', poles: '2P', ratedCurrentA: 25, leakageCurrentMa: 30, widthModules: 2, priceRub: '1490.00', specsJson: { ratedVoltageV: 230, type: 'AC' } },
  { brand: 'IEK', series: 'RCD', sku: 'IEK-RCD-40-30', name: 'УЗО IEK 2P 40А 30 мА', deviceType: 'rcd', poles: '2P', ratedCurrentA: 40, leakageCurrentMa: 30, widthModules: 2, priceRub: '1540.00', specsJson: { ratedVoltageV: 230, type: 'AC' } },
  { brand: 'IEK', series: 'RCD', sku: 'IEK-RCD-63-30', name: 'УЗО IEK 2P 63А 30 мА', deviceType: 'rcd', poles: '2P', ratedCurrentA: 63, leakageCurrentMa: 30, widthModules: 2, priceRub: '1690.00', specsJson: { ratedVoltageV: 230, type: 'A' } },
  { brand: 'IEK', series: 'RCD', sku: 'IEK-RCD-40-100', name: 'УЗО IEK 2P 40А 100 мА', deviceType: 'rcd', poles: '2P', ratedCurrentA: 40, leakageCurrentMa: 100, widthModules: 2, priceRub: '1490.00', specsJson: { ratedVoltageV: 230, type: 'AC' } },
  { brand: 'IEK', series: 'RCD', sku: 'IEK-RCD-63-300', name: 'УЗО IEK 2P 63А 300 мА', deviceType: 'rcd', poles: '2P', ratedCurrentA: 63, leakageCurrentMa: 300, widthModules: 2, priceRub: '1590.00', specsJson: { ratedVoltageV: 230, type: 'AC' } },
  // АВДТ (УЗО с встроенной защитой от сверхтока).
  { brand: 'IEK', series: 'AVDT', sku: 'IEK-AVDT-16-30', name: 'АВДТ IEK 2P 16А 30 мА C16', deviceType: 'rcbo', poles: '2P', ratedCurrentA: 16, tripCurve: 'C', leakageCurrentMa: 30, breakingCapacityKa: '4.5', widthModules: 2, priceRub: '2490.00', specsJson: { ratedVoltageV: 230, type: 'A' } },
  { brand: 'IEK', series: 'AVDT', sku: 'IEK-AVDT-25-30', name: 'АВДТ IEK 2P 25А 30 мА C25', deviceType: 'rcbo', poles: '2P', ratedCurrentA: 25, tripCurve: 'C', leakageCurrentMa: 30, breakingCapacityKa: '4.5', widthModules: 2, priceRub: '2590.00', specsJson: { ratedVoltageV: 230, type: 'A' } },
  { brand: 'КЭАЗ', series: 'AVDT', sku: 'KEAZ-AVDT-16-30', name: 'АВДТ КЭАЗ 2P 16А 30 мА C16', deviceType: 'rcbo', poles: '2P', ratedCurrentA: 16, tripCurve: 'C', leakageCurrentMa: 30, breakingCapacityKa: '6', widthModules: 2, priceRub: '3190.00', specsJson: { ratedVoltageV: 230, type: 'A' } },
  { brand: 'КЭАЗ', series: 'AVDT', sku: 'KEAZ-AVDT-25-30', name: 'АВДТ КЭАЗ 2P 25А 30 мА C25', deviceType: 'rcbo', poles: '2P', ratedCurrentA: 25, tripCurve: 'C', leakageCurrentMa: 30, breakingCapacityKa: '6', widthModules: 2, priceRub: '3290.00', specsJson: { ratedVoltageV: 230, type: 'A' } },
  // Реле напряжения.
  { brand: 'IEK', series: 'RN', sku: 'IEK-RN-101', name: 'Реле напряжения IEK RN-101 1P', deviceType: 'relay_voltage', poles: '1P', widthModules: 1, priceRub: '1890.00', specsJson: { nominalVoltageV: 230, thresholdLowV: 180, thresholdHighV: 260, mounting: 'DIN-рейка' } },
  { brand: 'EKF', series: 'RN', sku: 'EKF-RN-200', name: 'Реле напряжения EKF RN-200 2P', deviceType: 'relay_voltage', poles: '2P', widthModules: 2, priceRub: '2190.00', specsJson: { nominalVoltageV: 230, thresholdLowV: 180, thresholdHighV: 260, mounting: 'DIN-рейка' } },
  // Кросс-модули (шинные и нулевые клеммы).
  { brand: 'IEK', series: 'Busbar', sku: 'IEK-BUS-N-12', name: 'Кросс-модуль IEK шина нулевая N, 12 модулей', deviceType: 'contactor', priceRub: '390.00', specsJson: { function: 'neutral_busbar', modules: 12, mounting: 'DIN-рейка' } },
  { brand: 'IEK', series: 'Busbar', sku: 'IEK-BUS-L-12', name: 'Кросс-модуль IEK шина фазная L1/L2/L3, 12 модулей', deviceType: 'contactor', priceRub: '560.00', specsJson: { function: 'phase_busbar', modules: 12, mounting: 'DIN-рейка' } },
  // Корпуса щитов НКУ: ёмкость указана в specsJson, а не в widthModules.
  { brand: 'IEK', series: 'Shield', sku: 'IEK-SH-12', name: 'Корпус щита IEK на 12 модулей', deviceType: 'panel', priceRub: '2390.00', specsJson: { modules: 12, ipRating: 'IP30', mounting: 'настенный' } },
  { brand: 'IEK', series: 'Shield', sku: 'IEK-SH-24', name: 'Корпус щита IEK на 24 модуля', deviceType: 'panel', priceRub: '3490.00', specsJson: { modules: 24, ipRating: 'IP30', mounting: 'настенный' } },
  { brand: 'EKF', series: 'Shield', sku: 'EKF-SH-36', name: 'Корпус щита EKF на 36 модулей', deviceType: 'panel', priceRub: '5190.00', specsJson: { modules: 36, ipRating: 'IP31', mounting: 'настенный' } },
  { brand: 'КЭАЗ', series: 'Shield', sku: 'KEAZ-SH-54', name: 'Корпус щита КЭАЗ на 54 модуля', deviceType: 'panel', priceRub: '7490.00', specsJson: { modules: 54, ipRating: 'IP31', mounting: 'настенный' } },
];
