import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Error de dominio con código estable (la interfaz lo traduce) y estado HTTP.
 * Nunca incluir secretos ni datos personales en el mensaje.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    status: HttpStatus,
    message?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message: message ?? code, details }, status);
  }
}

export const notFound = (what = 'resource') => new AppError(`${what}_not_found`, HttpStatus.NOT_FOUND);
export const forbidden = (code = 'forbidden') => new AppError(code, HttpStatus.FORBIDDEN);
export const badRequest = (code: string, details?: Record<string, unknown>) => new AppError(code, HttpStatus.BAD_REQUEST, code, details);
export const conflict = (code: string, details?: Record<string, unknown>) => new AppError(code, HttpStatus.CONFLICT, code, details);
export const unavailable = (code: string) => new AppError(code, HttpStatus.SERVICE_UNAVAILABLE);
