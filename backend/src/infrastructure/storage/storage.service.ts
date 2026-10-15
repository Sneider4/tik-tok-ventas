import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, ReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { AppConfig } from '../../config/app-config.service';

/**
 * Almacenamiento de archivos privados (comprobantes, guías).
 * Hoy: disco local. Para producción, reemplazar por S3/Cloudflare R2 con la misma interfaz.
 * Las rutas guardadas en BD son relativas ("receipts/2026/10/uuid.jpg").
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: AppConfig) {
    this.root = resolve(config.get('STORAGE_DIR'));
  }

  async save(folder: string, data: Buffer, extension: string): Promise<string> {
    const now = new Date();
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    const relative = [folder, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), `${randomUUID()}${ext}`].join('/');
    const absolute = this.toAbsolute(relative);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, data);
    return relative;
  }

  async read(relativePath: string): Promise<Buffer> {
    return readFile(this.existing(relativePath));
  }

  stream(relativePath: string): ReadStream {
    return createReadStream(this.existing(relativePath));
  }

  static extensionFor(mimeType: string, originalName?: string): string {
    const byMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/heic': '.heic',
      'application/pdf': '.pdf',
    };
    return byMime[mimeType] ?? ((originalName && extname(originalName)) || '.bin');
  }

  static readonly RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

  static isAllowedReceipt(mimeType: string): boolean {
    return StorageService.RECEIPT_MIME_TYPES.includes(mimeType);
  }

  private existing(relativePath: string): string {
    const absolute = this.toAbsolute(relativePath);
    if (!existsSync(absolute)) throw new NotFoundException('Archivo no encontrado');
    return absolute;
  }

  /** Evita path traversal ("../../etc/passwd"). */
  private toAbsolute(relativePath: string): string {
    const absolute = normalize(join(this.root, relativePath));
    if (!absolute.startsWith(this.root + sep)) throw new NotFoundException('Ruta inválida');
    return absolute;
  }
}
