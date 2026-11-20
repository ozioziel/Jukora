/** Cliente HTTP de la API propia. La sesión viaja en cookie httpOnly; nunca hay claves aquí. */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  if (init.idempotencyKey) headers.set('idempotency-key', init.idempotencyKey);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, body, headers, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; details?: Record<string, unknown> };
    throw new ApiError(res.status, d.code ?? `http_${res.status}`, d.details);
  }
  return data as T;
}

export const newIdempotencyKey = () => `k-${crypto.randomUUID()}`;

export const apiUrl = (path: string) => `${BASE}${path}`;
