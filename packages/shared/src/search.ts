import { z } from 'zod';
import { LOCALES, PROJECT_INTENTS, RESOURCE_PRIORITIES } from './states.js';

const decimal = z.string().regex(/^\d{1,13}(\.\d{1,7})?$/, 'Importe inválido');
const currency = z.string().regex(/^[A-Z]{3,5}$/, 'Moneda inválida');
const country = z.string().regex(/^[A-Z]{2}$/, 'País ISO de 2 letras');

export const PRIORITIES = ['total_cost', 'arrival_time', 'quality', 'balance'] as const;
export const ORIGIN_SCOPES = ['local', 'national', 'international', 'local_and_international'] as const;
export const CONDITIONS = ['new', 'used'] as const;
export const SERVICES = ['delivery', 'installation', 'warranty', 'insurance', 'pickup', 'maintenance'] as const;

/**
 * Borrador que arma el frontend con el cuestionario (sin IA). El backend lo valida, normaliza y
 * solo entonces compone el prompt. «Unknown» se conserva: no se inventan restricciones.
 */
export const SearchRequestSchema = z.object({
  projectId: z.uuid().optional(),
  scope: z.enum(['whole_business', 'single_resource']).default('whole_business'),
  intent: z.enum(PROJECT_INTENTS),
  description: z.string().trim().min(20, 'Describe un poco más tu negocio').max(4000),
  destination: z.object({ country, city: z.string().trim().max(80).optional() }),
  capacity: z
    .object({
      seats: z.number().int().positive().max(100_000).optional(),
      unitsPerDay: z.number().int().positive().max(10_000_000).optional(),
      notes: z.string().max(300).optional(),
    })
    .optional(),
  budget: z.object({
    max: decimal.optional(),
    currency,
    flexibility: z.enum(['strict', 'approximate', 'unknown']),
  }),
  priorities: z.array(z.enum(PRIORITIES)).min(1).max(4),
  deadline: z.object({
    days: z.number().int().positive().max(3650).optional(),
    strict: z.boolean(),
  }),
  originScope: z.enum(ORIGIN_SCOPES),
  includeCountries: z.array(country).max(30).default([]),
  excludeCountries: z.array(country).max(30).default([]),
  condition: z.array(z.enum(CONDITIONS)).min(1),
  existingResources: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  technicalRequirements: z
    .array(z.object({ key: z.string().max(60), value: z.string().max(120), mandatory: z.boolean() }))
    .max(30)
    .default([]),
  preferVerified: z.boolean().default(true),
  services: z.array(z.enum(SERVICES)).max(SERVICES.length).default([]),
  shareWithSuppliers: z.literal(false).default(false),
  locale: z.enum(LOCALES).default('es'),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

/** Salida estructurada que se le exige al modelo. Sin URLs ni proveedores: eso viene de fuentes reales. */
export const ResourcePlanSchema = z.object({
  projectSummary: z.string().max(600),
  assumptions: z.array(z.string().max(300)).max(15),
  warnings: z.array(z.string().max(300)).max(15),
  resources: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{2,60}$/),
        label: z.string().min(2).max(80),
        category: z.string().min(2).max(60),
        quantity: z.number().int().positive().max(100_000).nullable(),
        unit: z.string().min(1).max(30),
        reason: z.string().max(300),
        requiredSpecs: z.array(z.string().max(120)).max(12),
        optionalSpecs: z.array(z.string().max(120)).max(12),
        searchTerms: z.array(z.string().min(2).max(80)).min(1).max(6),
        dependencies: z.array(z.string().max(60)).max(10),
        priority: z.enum(RESOURCE_PRIORITIES),
        estimatedCost: z.object({ amount: decimal, currency, isEstimate: z.literal(true) }).nullable(),
      }),
    )
    .min(1)
    .max(20),
});
export type ResourcePlan = z.infer<typeof ResourcePlanSchema>;

/** Candidato real para un recurso. Los campos desconocidos van en null, nunca se completan. */
export const CandidateSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  title: z.string(),
  origin: z.enum(['demo', 'testnet', 'external', 'registered']),
  supplierName: z.string().nullable(),
  supplierTrust: z.enum(['found_online', 'registered', 'kyb_pending', 'kyb_verified', 'kyb_rejected', 'kyb_expired']),
  listingId: z.uuid().nullable(),
  sourceUrl: z.url().nullable(),
  sourceName: z.string().nullable(),
  retrievedAt: z.string(),
  price: z.object({ amount: decimal, currency }).nullable(),
  locationCountry: country.nullable(),
  locationCity: z.string().nullable(),
  leadTimeDays: z.number().int().nonnegative().nullable(),
  condition: z.enum(CONDITIONS).nullable(),
  rating: z.object({ average: z.number().min(0).max(5), count: z.number().int().nonnegative() }).nullable(),
  reasons: z.array(z.string()),
  score: z.number(),
  action: z.enum(['view_source', 'request_quote', 'request_order']),
});
export type Candidate = z.infer<typeof CandidateSchema>;
