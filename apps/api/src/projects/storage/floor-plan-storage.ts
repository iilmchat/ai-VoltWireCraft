// © 2026 RuChating (iilmchat) · VoltWireCraft v0.1.0
/** Абстракция хранилища подложек: локальная ФС или S3-совместимый сервис. */

import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

/** Хранилище файлов подложек. */
export interface FloorPlanStorage {
  /**
   * Сохраняет файл по заданному ключу.
   *
   * @param key — ключ объекта (генерируется сервисом, без путей).
   * @param bytes — содержимое файла.
   * @param contentType — MIME-тип, подтверждённый по magic bytes.
   * @returns nothing.
   */
  saveAsync(key: string, bytes: Buffer, contentType: string): Promise<void>;
}

/** Токен внедрения хранилища подложек. */
export const FLOOR_PLAN_STORAGE = Symbol('FLOOR_PLAN_STORAGE');

/** Параметр конструктора для внедрения хранилища подложек. */
export const InjectFloorPlanStorage = (): ParameterDecorator => Inject(FLOOR_PLAN_STORAGE);

/** Локальное хранилище; ключ используется как имя файла внутри каталога. */
@Injectable()
export class LocalFloorPlanStorage implements FloorPlanStorage {
  private readonly directory: string;

  /**
   * @param config — валидированная конфигурация приложения.
   */
  public constructor(config: ConfigService<Env, true>) {
    this.directory = resolve(config.get('LOCAL_STORAGE_DIR', { infer: true }));
  }

  /** @inheritdoc */
  public async saveAsync(key: string, bytes: Buffer, _contentType: string): Promise<void> {
    if (key.includes('/') || key.includes('\\') || key.includes('..')) {
      throw new Error('Недопустимый ключ объекта хранилища');
    }
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, key), bytes);
  }
}

/** S3-совместимое объектное хранилище. */
@Injectable()
export class S3FloorPlanStorage implements FloorPlanStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  /**
   * @param config — валидированная конфигурация приложения.
   */
  public constructor(config: ConfigService<Env, true>) {
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });

    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      region: config.get('S3_REGION', { infer: true }),
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }) === 'true',
      credentials:
        accessKeyId !== undefined && secretAccessKey !== undefined
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  /** @inheritdoc */
  public async saveAsync(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `floor-plans/${key}`,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  }
}

/** Провайдер хранилища, выбираемый по конфигурации `STORAGE_DRIVER`. */
export const floorPlanStorageProvider: Provider = {
  provide: FLOOR_PLAN_STORAGE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): FloorPlanStorage =>
    config.get('STORAGE_DRIVER', { infer: true }) === 's3'
      ? new S3FloorPlanStorage(config)
      : new LocalFloorPlanStorage(config),
};
