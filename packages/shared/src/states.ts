/**
 * Estados de dominio. Cada entidad tiene su propio ciclo: no se mezcla cotización, pedido físico,
 * escrow y disputa en un único enum (ver planeacion/04 §5).
 */

export const LOCALES = ['es', 'en', 'qu', 'ay'] as const;
export type Locale = (typeof LOCALES)[number];

export const USER_MODES = ['buyer', 'supplier'] as const;
export type UserMode = (typeof USER_MODES)[number];

/** Roles privilegiados asignados por script (no se autoasignan desde la interfaz). */
export const STAFF_ROLES = ['arbiter', 'verifier', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PROJECT_INTENTS = ['start', 'expand'] as const;
export type ProjectIntent = (typeof PROJECT_INTENTS)[number];

export const PROJECT_SECTORS = ['restaurant', 'cafe', 'workshop', 'store', 'studio', 'other'] as const;
export type ProjectSector = (typeof PROJECT_SECTORS)[number];

export const PROJECT_STATUSES = ['draft', 'active', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const RESOURCE_PRIORITIES = ['high', 'medium', 'low'] as const;
export type ResourcePriority = (typeof RESOURCE_PRIORITIES)[number];

/** Procedencia/identidad del proveedor. Encontrado ≠ registrado ≠ verificado. */
export const SUPPLIER_TRUST = ['found_online', 'registered', 'kyb_pending', 'kyb_verified', 'kyb_rejected', 'kyb_expired'] as const;
export type SupplierTrust = (typeof SUPPLIER_TRUST)[number];

export const KYC_STATUSES = ['not_started', 'pending', 'approved', 'declined', 'expired'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const SEARCH_RUN_STATUSES = ['accepted', 'planning', 'resources_ready', 'done', 'partial', 'empty', 'error', 'cancelled'] as const;
export type SearchRunStatus = (typeof SEARCH_RUN_STATUSES)[number];

export const SEARCH_EVENT_TYPES = [
  'accepted',
  'planning',
  'resources_ready',
  'candidate_batch',
  'partial',
  'done',
  'error',
  'cancelled',
] as const;
export type SearchEventType = (typeof SEARCH_EVENT_TYPES)[number];

export const RFQ_STATUSES = ['draft', 'sent', 'published', 'answered', 'closed', 'cancelled', 'expired'] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

export const QUOTE_STATUSES = ['sent', 'accepted', 'rejected', 'withdrawn', 'expired'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const ORDER_STATUSES = [
  'pending_payment',
  'funded',
  'preparing',
  'shipped',
  'delivery_notified',
  'in_review',
  'accepted',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ESCROW_STATUSES = [
  'not_created',
  'created',
  'funding_pending',
  'funded',
  'approval_pending',
  'release_pending',
  'released',
  'disputed',
  'resolution_pending',
  'resolved',
] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

export const DISPUTE_STATUSES = [
  'draft',
  'open',
  'collecting_evidence',
  'review',
  'decided',
  'execution_pending',
  'resolved',
  'closed',
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_REASONS = [
  'not_delivered',
  'late',
  'damaged',
  'different_product',
  'wrong_quantity',
  'terms_breach',
  'other',
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const RAMP_STATUSES = ['awaiting_payment', 'processing', 'credited', 'expired', 'failed'] as const;
export type RampStatus = (typeof RAMP_STATUSES)[number];

export const NOTIFICATION_KINDS = [
  'quote_received',
  'quote_expiring',
  'order_accepted',
  'funding_confirmed',
  'funding_failed',
  'preparing',
  'shipped',
  'delivery_notified',
  'review_reminder',
  'delayed',
  'dispute_opened',
  'evidence_requested',
  'dispute_resolved',
  'funds_released',
  'refund_confirmed',
  'verification_required',
  'rfq_received',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Origen de un dato mostrado: nunca presentar una simulación como real. */
export const DATA_ORIGINS = ['demo', 'testnet', 'external', 'registered'] as const;
export type DataOrigin = (typeof DATA_ORIGINS)[number];

/** Transiciones de pedido permitidas. Aceptación la hace el comprador; nunca el proveedor. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['funded', 'cancelled'],
  // delivery_notified directo: retiro en local («listo para retirar») o entrega en mano del proveedor.
  funded: ['preparing', 'shipped', 'delivery_notified'],
  preparing: ['shipped', 'delivery_notified'],
  shipped: ['delivery_notified'],
  delivery_notified: ['in_review'],
  in_review: ['accepted'],
  accepted: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}
