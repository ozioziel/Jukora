import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { badRequest, unavailable } from '../common/errors';
import { ENV, type Env } from '../config/env';

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  { mime: 'video/mp4', ext: 'mp4', test: (b) => b.subarray(4, 8).toString() === 'ftyp' },
];

/**
 * Cabeceras para Supabase con la clave de servicio.
 * - Clave heredada `service_role` (un JWT, empieza por «eyJ»): va en `apikey` y en `Authorization: Bearer`.
 * - Clave secreta nueva (`sb_secret_…`): no es un JWT; Supabase pide enviarla solo en `apikey`
 *   (en `Authorization` se intentaría validar como JWT y la petición se rechazaría).
 */
export function supabaseServiceHeaders(key: string): Record<string, string> {
  return key.startsWith('eyJ') ? { apikey: key, authorization: `Bearer ${key}` } : { apikey: key };
}

/**
 * Supabase Storage desde la API con la clave de servicio (nunca en el navegador).
 * El tipo se decide por los bytes del archivo, no por lo que declara el cliente.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  detect(buffer: Buffer, allowed: string[]): { mime: string; ext: string } {
    const sig = SIGNATURES.find((s) => s.test(buffer));
    if (!sig || !allowed.includes(sig.mime)) throw badRequest('file_type_not_allowed');
    return { mime: sig.mime, ext: sig.ext };
  }

  private headers(extra: Record<string, string> = {}) {
    if (!this.env.SUPABASE_SERVICE_ROLE_KEY) throw unavailable('storage_not_configured');
    return { ...supabaseServiceHeaders(this.env.SUPABASE_SERVICE_ROLE_KEY), ...extra };
  }

  async upload(bucket: 'evidence' | 'listing-photos', prefix: string, buffer: Buffer, allowed: string[], maxBytes: number) {
    if (buffer.length === 0 || buffer.length > maxBytes) throw badRequest('file_size_invalid');
    const { mime, ext } = this.detect(buffer, allowed);
    const path = `${prefix}/${randomUUID()}.${ext}`;
    const res = await fetch(`${this.env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': mime, 'x-upsert': 'false' }),
      body: new Uint8Array(buffer),
    });
    if (!res.ok) throw unavailable('storage_upload_failed');
    return { path, mime, size: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') };
  }

  /** URL firmada de corta duración para evidencias privadas. */
  async signedUrl(bucket: 'evidence', path: string, expiresIn = 120): Promise<string> {
    const res = await fetch(`${this.env.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) throw unavailable('storage_sign_failed');
    const data = (await res.json()) as { signedURL?: string };
    if (!data.signedURL) throw unavailable('storage_sign_failed');
    return `${this.env.SUPABASE_URL}/storage/v1${data.signedURL}`;
  }

  publicUrl(bucket: 'listing-photos', path: string) {
    return `${this.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  }
}
