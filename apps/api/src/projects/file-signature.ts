// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Проверка подложек по magic bytes — доверять объявленному MIME-типу нельзя (RULES § 6.5). */

import { BadRequestException } from '@nestjs/common';
import type { BackgroundKind } from '@voltwirecraft/shared/graph.schema.js';

/** Максимальный размер загружаемой подложки: 25 МБ. */
export const MAX_FLOOR_PLAN_SIZE_BYTES = 25 * 1024 * 1024;
/** Максимальный размер DXF/DWG-плана: 50 МБ (DESIGN_V030 § 3.2). */
export const MAX_CAD_FILE_BYTES = 50 * 1024 * 1024;

/** Поддерживаемые форматы векторных чертежей. */
export type CadFileKind = 'dxf' | 'dwg';

/** Минимальный контракт файла, получаемого от multer в памяти. */
export interface UploadedFloorPlanFile {
  /** Содержимое файла. */
  readonly buffer: Buffer;
  /** Оригинальное имя файла. */
  readonly originalname: string;
  /** Размер файла в байтах. */
  readonly size: number;
}

/** Подтверждённый по содержимому тип файла. */
export interface DetectedFloorPlanType {
  /** Логический формат. */
  readonly kind: BackgroundKind;
  /** MIME-тип, соответствующий сигнатуре. */
  readonly mimeType: string;
}

/**
 * Определяет формат CAD-файла по расширению и сигнатуре.
 *
 * @param file — загруженный файл.
 * @returns `dxf` или `dwg`.
 * @throws {BadRequestException} если формат не поддержан или файл слишком велик.
 */
export function detectCadFile(file: UploadedFloorPlanFile): CadFileKind {
  if (file.buffer.length === 0) {
    throw new BadRequestException('CAD-файл пуст');
  }
  if (file.buffer.length > MAX_CAD_FILE_BYTES) {
    throw new BadRequestException('CAD-файл превышает лимит 50 МБ');
  }
  const extension = file.originalname.split('.').pop()?.toLowerCase();
  const header = file.buffer.subarray(0, 8).toString('latin1');
  if (extension === 'dxf' || header.startsWith('  0') || header.includes('AutoCAD DXF')) {
    return 'dxf';
  }
  if (extension === 'dwg' || header.startsWith('AC')) {
    return 'dwg';
  }
  throw new BadRequestException('Поддерживаются только DXF и DWG');
}

interface Signature {
  readonly kind: BackgroundKind;
  readonly mimeType: string;
  readonly matches: (bytes: Buffer) => boolean;
}

/** Сигнатуры поддерживаемых форматов, от самой длинной к короткой. */
const SIGNATURES: readonly Signature[] = [
  {
    kind: 'png',
    mimeType: 'image/png',
    matches: (bytes) =>
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    kind: 'pdf',
    mimeType: 'application/pdf',
    matches: (bytes) => bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    kind: 'jpg',
    mimeType: 'image/jpeg',
    matches: (bytes) =>
      bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
];

/**
 * Определяет формат подложки по сигнатуре и проверяет размер.
 *
 * @param bytes — содержимое загруженного файла.
 * @returns подтверждённый формат и MIME-тип.
 * @throws {BadRequestException} если файл пуст, слишком велик или имеет неизвестный формат.
 */
export function detectFloorPlanType(bytes: Buffer): DetectedFloorPlanType {
  if (bytes.length === 0) {
    throw new BadRequestException('Загруженный файл пуст');
  }
  if (bytes.length > MAX_FLOOR_PLAN_SIZE_BYTES) {
    throw new BadRequestException('Размер подложки превышает 25 МБ');
  }

  const detected = SIGNATURES.find((signature) => signature.matches(bytes));
  if (detected === undefined) {
    throw new BadRequestException('Поддерживаются только PDF, PNG и JPG');
  }

  return { kind: detected.kind, mimeType: detected.mimeType };
}
