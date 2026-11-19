// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Проверка подложек по magic bytes — доверять объявленному MIME-типу нельзя (RULES § 6.5). */

import { BadRequestException } from '@nestjs/common';
import type { FloorPlanImageKind } from '@voltwirecraft/shared/graph.schema.js';

/** Максимальный размер загружаемой подложки: 25 МБ. */
export const MAX_FLOOR_PLAN_SIZE_BYTES = 25 * 1024 * 1024;

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
  readonly kind: FloorPlanImageKind;
  /** MIME-тип, соответствующий сигнатуре. */
  readonly mimeType: string;
}

interface Signature {
  readonly kind: FloorPlanImageKind;
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
