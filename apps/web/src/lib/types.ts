import type { Candidate, Locale, ResourcePlan, StaffRole, UserMode } from '@jucumari/shared';

export interface Me {
  id: string;
  address: string;
  authMethod: 'pollar' | 'wallet' | 'demo';
  displayName: string;
  locale: Locale;
  timeZone: string;
  modes: UserMode[];
  activeMode: UserMode;
  staffRoles: StaffRole[];
  kycStatus: string;
  isDemo: boolean;
  quotaResetsAt: string;
}

export interface AuthConfig {
  network: 'testnet' | 'mainnet';
  demoMode: boolean;
  methods: { pollar: boolean; wallet: boolean; demoKey: boolean };
}

export interface Quota {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
  timeZone: string;
}

export interface Progress {
  accepted: number;
  required: number;
  unknownQuantities: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  sector: 'restaurant' | 'cafe' | 'workshop' | 'store' | 'studio' | 'other';
  intent: 'start' | 'expand';
  country: string | null;
  city: string | null;
  objective: string;
  budget: { max: string; currency: string } | null;
  status: string;
  progress: Progress;
}

export interface ProjectResource {
  id: string;
  slug: string;
  label: string;
  category: string;
  quantity: number | null;
  unit: string;
  reason: string;
  priority: string;
  searchRunId: string | null;
  progress: { accepted: number; ordered: number; inTransit: number; required: number | null };
}

export interface ProjectDetail extends Omit<ProjectSummary, 'progress'> {
  resources: ProjectResource[];
  summary: { rfqs: number; openQuotes: number; orders: Record<string, number> };
  lastSearchRun: { id: string; status: string; createdAt: string } | null;
}

export type PlanResource = ResourcePlan['resources'][number] & { candidateCount: number; externalStatus: string | null };

export interface SearchRun {
  id: string;
  status: 'accepted' | 'planning' | 'resources_ready' | 'done' | 'partial' | 'empty' | 'error' | 'cancelled';
  projectId: string | null;
  errorCode: string | null;
  ai: { provider: string | null; model: string | null; isDemo: boolean };
  plan: (Omit<ResourcePlan, 'resources'> & { resources: PlanResource[] }) | null;
  externalSearch: { enabled: boolean; creditsUsed: number; budget: number };
  terminal: boolean;
}

export type RankedCandidate = Candidate & { excluded: boolean; servesDestination: boolean | null; failsMandatory: boolean };

export interface Listing {
  id: string;
  title: string;
  description: string;
  category: string;
  specs: Record<string, string>;
  unit: string;
  price: { amount: string; currency: string } | null;
  quoteOnly: boolean;
  stock: number | null;
  minQty: number;
  condition: 'new' | 'used';
  origin: { country: string; city: string | null };
  shipsTo: string[];
  leadTimeDays: number | null;
  /** Costo de envío por pedido que fija el proveedor (el envío lo hace él). */
  shipping: { amount: string; currency: string };
  /** Retiro en local: ciudad (y la dirección solo en la vista del propio proveedor). */
  pickup: { city: string | null; address?: string } | null;
  warranty: string;
  isDemo: boolean;
  status: string;
  supplier: { id: string; name: string; trust: string; country: string; rating: { average: number; count: number } | null };
}

export interface Quote {
  id: string;
  rfqId: string | null;
  rfqTitle: string | null;
  version: number;
  status: string;
  description: string;
  quantity: number;
  unitPrice: string;
  shipping: string;
  taxes: string;
  total: string;
  currency: string;
  leadTimeDays: number | null;
  warranty: string;
  terms: string;
  validUntil: string;
  platformFee: { amount: string; percent: number } | null;
  supplier: { id: string; name: string; trust: string; isDemo: boolean };
}

export interface EscrowView {
  id: string;
  provider: 'trustless_work' | 'soroban';
  mode: 'full' | 'partial';
  advanceAmount: string;
  advanceReleased: string;
  network: string;
  contractId: string | null;
  status: string;
  amount: string;
  asset: { code: string; address: string };
  platformFeePercent: string;
  txs: { id: string; action: string; status: string; tx_hash: string | null; created_at: string }[];
}

export interface OrderDelivery {
  fulfillment?: 'delivery' | 'pickup';
  country?: string;
  region?: string;
  city?: string | null;
  address?: string;
  reference?: string;
  phone?: string;
  pickup?: { city: string | null; address?: string };
}

export interface OrderDetail {
  id: string;
  role: 'buyer' | 'supplier' | 'arbiter';
  title: string;
  quantity: number;
  unit: string;
  amount: string;
  currency: string;
  platformFee: { amount: string; percent: string };
  status: string;
  isDemo: boolean;
  projectId: string | null;
  fulfillment: 'delivery' | 'pickup';
  shipping: string;
  /** Motor del escrow: Trustless Work o el contrato Soroban de Montuno. */
  escrowProvider: 'trustless_work' | 'soroban';
  escrowMode: 'full' | 'partial';
  advanceAmount: string;
  deliveryDays: number | null;
  productUrl: string;
  /** Datos de entrega privados; null si esta parte aún no puede verlos (proveedor sin pago financiado). */
  delivery: OrderDelivery | null;
  deliveryHidden: boolean;
  supplier: { id: string; name: string; trust: string; isDemo: boolean };
  escrow: EscrowView | null;
  escrowConfig: {
    enabled: boolean;
    provider: 'trustless_work' | 'soroban';
    contractId: string | null;
    network: string;
    asset: { code: string; issuer: string | null; isTestToken: boolean };
    missing: string[];
  };
  shipments: { id: string; carrier: string; tracking: string; isSimulated: boolean; createdAt: string }[];
  dispute: { id: string; status: string; reason: string } | null;
  reviewed: boolean;
  createdAt: string;
}

export interface Notice {
  id: string;
  kind: string;
  entity: { type: string; id: string };
  requiresAction: boolean;
  read: boolean;
  createdAt: string;
}
