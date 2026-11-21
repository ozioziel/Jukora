import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));
const stellarAddress = optional.refine((v) => v === undefined || /^G[A-Z2-7]{55}$/.test(v), 'Dirección Stellar inválida');
const stellarSecret = optional.refine((v) => v === undefined || /^S[A-Z2-7]{55}$/.test(v), 'Llave secreta Stellar inválida');

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_PUBLIC_URL: z.url().default('http://localhost:5173'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    DEMO_MODE: bool,

    DATABASE_URL: z.string().min(1),
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: optional,

    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET debe tener al menos 32 caracteres'),

    STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
    MAINNET_APPROVED: bool,
    STELLAR_RPC_URL: z.url().default('https://soroban-testnet.stellar.org'),
    STELLAR_HORIZON_URL: z.url().default('https://horizon-testnet.stellar.org'),
    PLATFORM_STELLAR_ADDRESS: stellarAddress,
    PLATFORM_STELLAR_SECRET: stellarSecret,
    ARBITER_STELLAR_ADDRESS: stellarAddress,
    DEMO_TOKEN_CODE: z
      .string()
      .regex(/^[A-Za-z0-9]{1,12}$/)
      .default('USDCDEMO'),
    DEMO_TOKEN_ISSUER: stellarAddress,
    DEMO_TOKEN_CONTRACT_ID: optional,
    DEMO_TOKEN_ISSUER_SECRET: stellarSecret,

    TW_API_URL: z.url().default('https://dev.api.trustlesswork.com'),
    TW_API_KEY: optional,

    VITE_POLLAR_PUBLISHABLE_KEY: optional,
    POLLAR_SECRET_KEY: optional,
    POLLAR_API_URL: z.url().default('https://api.pollar.xyz'),

    DIDIT_API_KEY: optional,
    DIDIT_WORKFLOW_ID: optional,
    DIDIT_WEBHOOK_SECRET: optional,
    KYC_HMAC_SECRET: optional,

    AI_PROVIDER: z.enum(['groq', 'ollama', 'demo']).default('demo'),
    GROQ_API_KEY: optional,
    // llama-3.1-8b-instant se retiró el 16/08/2026; Groq recomienda openai/gpt-oss-20b como reemplazo.
    GROQ_MODEL: z.string().default('openai/gpt-oss-20b'),
    OLLAMA_URL: optional,
    OLLAMA_MODEL: z.string().default('qwen2.5:3b-instruct'),

    SEARCH_PROVIDER: z.enum(['tavily', 'none']).default('none'),
    TAVILY_API_KEY: optional,
    SEARCH_DAILY_CREDIT_CAP: z.coerce.number().int().nonnegative().default(30),
    SEARCH_RUN_CREDIT_BUDGET: z.coerce.number().int().nonnegative().default(8),

    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(2000).default(250),
    PLATFORM_FEE_MIN: z
      .string()
      .regex(/^\d+(\.\d{1,7})?$/)
      .default('1'),
  })
  .superRefine((e, ctx) => {
    if (e.STELLAR_NETWORK === 'mainnet') {
      if (!e.MAINNET_APPROVED)
        ctx.addIssue({ code: 'custom', message: 'Mainnet requiere MAINNET_APPROVED=true (aprobación expresa del responsable).' });
      if (e.DEMO_MODE) ctx.addIssue({ code: 'custom', message: 'DEMO_MODE no puede usarse en mainnet.' });
      if (e.DEMO_TOKEN_ISSUER_SECRET || e.PLATFORM_STELLAR_SECRET) {
        ctx.addIssue({ code: 'custom', message: 'Las llaves secretas de prueba solo se aceptan en testnet.' });
      }
    }
    if (e.AI_PROVIDER === 'groq' && !e.GROQ_API_KEY) ctx.addIssue({ code: 'custom', message: 'AI_PROVIDER=groq requiere GROQ_API_KEY.' });
    if (e.AI_PROVIDER === 'ollama' && !e.OLLAMA_URL) ctx.addIssue({ code: 'custom', message: 'AI_PROVIDER=ollama requiere OLLAMA_URL.' });
    if (e.SEARCH_PROVIDER === 'tavily' && !e.TAVILY_API_KEY)
      ctx.addIssue({ code: 'custom', message: 'SEARCH_PROVIDER=tavily requiere TAVILY_API_KEY.' });
    if (e.NODE_ENV === 'production' && !e.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({ code: 'custom', message: 'En producción se requiere SUPABASE_SERVICE_ROLE_KEY.' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;
export const ENV = Symbol('ENV');

/** Busca `.env` subiendo desde este archivo (la salida compilada puede anidarse en dist/ o dist/src/). */
function findRootEnv(): string | null {
  let dir = __dirname;
  for (let i = 0; i < 7; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate) && existsSync(resolve(dir, 'package.json')) && existsSync(resolve(dir, 'apps'))) return candidate;
    dir = resolve(dir, '..');
  }
  return null;
}

/** Carga `.env` de la raíz del monorepo (si existe) y valida. Falla al arrancar si algo no cuadra. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const rootEnv = findRootEnv();
  // Las variables ya definidas (Docker, CI) tienen prioridad sobre el archivo.
  if (source === process.env && rootEnv) process.loadEnvFile(rootEnv);
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `- ${i.path.join('.') || 'env'}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${detail}`);
  }
  return parsed.data;
}
