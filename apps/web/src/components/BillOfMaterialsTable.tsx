// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
import { useMemo } from 'react';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import type { BomRow } from '../lib/bomExport.js';
import { buildBomRows, exportBomCsvAsync, exportBomXlsxAsync } from '../lib/bomExport.js';
import { useEditorStore } from '../store/editorStore.js';

/** Ключи локализованных заголовков в порядке столбцов таблицы и экспорта. */
const HEADER_KEYS: readonly TranslationKey[] = [
    'bom.col.name',
    'bom.col.qty',
    'bom.col.length',
    'bom.col.article',
    'bom.col.price',
    'bom.col.total',
];

/**
 * Форматировать число для отображения: две цифры после запятой.
 * @param value Числовое значение.
 * @returns Строка с десятичной запятой.
 */
function formatNumber(value: number): string {
    return value.toFixed(2).replace('.', ',');
}

/** Свойства секции таблицы спецификации. */
interface BomTableSectionProps {
    /** Заголовок секции. */
    title: string;
    /** Строки секции. */
    rows: readonly BomRow[];
    /** Локализованные заголовки столбцов. */
    headers: readonly string[];
    /** Идентификатор выбранного объекта графа для подсветки. */
    selectedId: string | null;
    /** подпись для пустой секции. */
    emptyLabel: string;
    /** Подпись итоговой строки. */
    totalLabel: string;
    /** Обработчик клика по строке. */
    onSelect: (row: BomRow) => void;
}

/**
 * Секция спецификации: таблица с заголовком и итоговой строкой.
 * @param props Заголовок, строки и обработчик выбора.
 * @returns React-элемент секции таблицы.
 */
function BomTableSection({
    title,
    rows,
    headers,
    selectedId,
    emptyLabel,
    totalLabel,
    onSelect,
}: BomTableSectionProps) {
    const sectionTotal = rows.reduce((sum, row) => sum + row.totalRub, 0);

    return (
        <div className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {title}
            </h3>
            <div className="overflow-x-auto rounded border border-slate-700">
                <table className="w-full border-collapse text-xs">
                    <thead>
                        <tr className="border-b border-slate-700 bg-slate-800/60 text-left text-slate-400">
                            {headers.map((header, index) => (
                                <th
                                    key={`${header}-${index}`}
                                    scope="col"
                                    className="whitespace-nowrap px-2 py-1 font-medium"
                                >
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={headers.length} className="px-2 py-3 text-center text-slate-500">
                                    {emptyLabel}
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, index) => (
                                <tr
                                    key={row.sourceId ?? `${row.name}-${index}`}
                                    onClick={() => onSelect(row)}
                                    className={`cursor-pointer border-b border-slate-800 transition-colors hover:bg-slate-800/70 ${
                                        row.sourceId === selectedId ? 'bg-slate-700/60' : ''
                                    }`}
                                >
                                    <td className="px-2 py-1 text-slate-200">{row.name}</td>
                                    <td className="px-2 py-1 text-right text-slate-300">{row.quantity}</td>
                                    <td className="px-2 py-1 text-right text-slate-300">
                                        {row.lengthM === null ? '—' : formatNumber(row.lengthM)}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1 font-mono text-slate-300">
                                        {row.article}
                                    </td>
                                    <td className="px-2 py-1 text-right text-slate-300">
                                        {formatNumber(row.priceRub)}
                                    </td>
                                    <td className="px-2 py-1 text-right text-slate-200">
                                        {formatNumber(row.totalRub)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    <tfoot>
                        <tr className="border-t border-slate-700 bg-slate-800/40 font-semibold text-slate-200">
                            <td colSpan={headers.length - 1} className="px-2 py-1 text-right">
                                {totalLabel}
                            </td>
                            <td className="px-2 py-1 text-right">{formatNumber(sectionTotal)} ₽</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

/**
 * Сводная таблица кабелей и защитных аппаратов с экспортом в CSV/XLSX.
 * Данные вычисляются из канонического графа (RULES § 5.2).
 * @returns React-элемент спецификации проекта.
 */
export function BillOfMaterialsTable() {
    const { t } = useI18n();
    const graph = useEditorStore((state) => state.graph);
    const selectedEdgeId = useEditorStore((state) => state.selectedEdgeId);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const selectEdge = useEditorStore((state) => state.selectEdge);
    const selectNode = useEditorStore((state) => state.selectNode);

    const { cables, devices } = useMemo(() => buildBomRows(graph), [graph]);
    const allRows = useMemo(() => [...cables, ...devices], [cables, devices]);
    const grandTotal = useMemo(
        () => allRows.reduce((sum, row) => sum + row.totalRub, 0),
        [allRows],
    );
    const headers = useMemo(() => HEADER_KEYS.map((key) => t(key)), [t]);
    const isEmpty = allRows.length === 0;

    /** Имя файла экспорта на основе названия проекта. */
    const baseFileName = (graph.name.replace(/[\\/:*?"<>|]/g, '_') || 'project') + '_bom';

    return (
        <section className="rounded border border-slate-700 bg-slate-900 p-4">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                    {t('bom.title')}
                </h2>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            void exportBomCsvAsync(allRows, baseFileName, headers);
                        }}
                        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 transition-colors hover:bg-slate-700"
                    >
                        {t('bom.exportCsv')}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void exportBomXlsxAsync(allRows, baseFileName, headers);
                        }}
                        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 transition-colors hover:bg-slate-700"
                    >
                        {t('bom.exportXlsx')}
                    </button>
                </div>
            </header>

            {isEmpty ? (
                <p className="py-4 text-center text-xs text-slate-500">{t('bom.empty')}</p>
            ) : (
                <>
                    <BomTableSection
                        title={t('bom.cables')}
                        rows={cables}
                        headers={headers}
                        selectedId={selectedEdgeId}
                        emptyLabel={t('bom.empty')}
                        totalLabel={t('bom.total')}
                        onSelect={(row) => {
                            if (row.sourceId !== undefined) {
                                selectEdge(row.sourceId);
                            }
                        }}
                    />
                    <BomTableSection
                        title={t('bom.devices')}
                        rows={devices}
                        headers={headers}
                        selectedId={selectedNodeId}
                        emptyLabel={t('bom.empty')}
                        totalLabel={t('bom.total')}
                        onSelect={(row) => {
                            if (row.sourceId !== undefined) {
                                selectNode(row.sourceId);
                            }
                        }}
                    />
                    <div className="flex items-center justify-end gap-2 border-t border-slate-700 pt-2 text-sm font-semibold text-slate-100">
                        <span>{t('bom.total')}:</span>
                        <span>{formatNumber(grandTotal)} ₽</span>
                    </div>
                </>
            )}
        </section>
    );
}
