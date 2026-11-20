import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { badRequest } from './errors';

/** Valida y normaliza el cuerpo/consulta con un esquema zod. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw badRequest('validation_failed', {
        issues: r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
