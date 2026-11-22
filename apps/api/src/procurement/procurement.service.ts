import { Inject, Injectable } from '@nestjs/common';
import { addMoney, computePlatformFee, type DeliveryAddress, fromUnits, toUnits } from '@jucumari/shared';
import { sql } from 'kysely';
import type { AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { NotificationsService } from '../common/notifications.service';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';

export interface RfqInput {
  title: string;
  specs?: string[];
  quantity: number;
  unit?: string;
  destinationCountry: string;
  destinationCity?: string;
  deadlineDays?: number;
  currency?: string;
  needs?: string[];
  projectId?: string;
  requirementId?: string;
  listingId?: string;
  visibility: 'private' | 'invited' | 'public';
  /** Consentimiento explícito para publicar la necesidad en «Buscar negocios». */
  consentPublish?: boolean;
  inviteOrgIds?: string[];
  shareBudget?: boolean;
  budgetMax?: string;
}

export interface QuoteInput {
  description?: string;
  quantity: number;
  unitPrice: string;
  shipping?: string;
  taxes?: string;
  currency: string;
  leadTimeDays?: number;
  incoterm?: string;
  warranty?: string;
  terms?: string;
  validDays: number;
}

@Injectable()
export class ProcurementService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
  ) {}

  private fee(amount: string) {
    return computePlatformFee(amount, { basisPoints: this.env.PLATFORM_FEE_BPS, minimum: this.env.PLATFORM_FEE_MIN });
  }

  async createRfq(user: AuthUser, input: RfqInput) {
    if (input.visibility === 'public' && !input.consentPublish) throw badRequest('publish_consent_required');
    if (input.projectId) {
      const p = await this.db
        .selectFrom('projects')
        .select('id')
        .where('id', '=', input.projectId)
        .where('owner_id', '=', user.id)
        .executeTakeFirst();
      if (!p) throw notFound('project');
    }
    const invites = new Set(input.inviteOrgIds ?? []);
    if (input.listingId) {
      const l = await this.db
        .selectFrom('listings')
        .select(['org_id'])
        .where('id', '=', input.listingId)
        .where('status', '=', 'published')
        .executeTakeFirst();
      if (!l) throw notFound('listing');
      invites.add(l.org_id);
    }
    if (input.visibility !== 'public' && invites.size === 0) throw badRequest('invite_required');
    const status = input.visibility === 'public' ? 'published' : 'sent';
    const rfq = await this.db
      .insertInto('rfqs')
      .values({
        buyer_id: user.id,
        project_id: input.projectId ?? null,
        requirement_id: input.requirementId ?? null,
        listing_id: input.listingId ?? null,
        title: input.title,
        specs: JSON.stringify(input.specs ?? []),
        quantity: input.quantity,
        unit: input.unit ?? 'unidad',
        destination_country: input.destinationCountry,
        destination_city: input.destinationCity ?? '',
        deadline_days: input.deadlineDays ?? null,
        currency: input.currency ?? 'USD',
        needs: JSON.stringify(input.needs ?? []),
        visibility: input.visibility,
        status,
        share_budget: input.shareBudget ?? false,
        budget_max: input.shareBudget ? (input.budgetMax ?? null) : null,
        expires_at: new Date(Date.now() + 14 * 86_400_000),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    if (invites.size) {
      await this.db
        .insertInto('rfq_invites')
        .values([...invites].map((org_id) => ({ rfq_id: rfq.id, org_id })))
        .onConflict((oc) => oc.doNothing())
        .execute();
      const members = await this.db
        .selectFrom('memberships')
        .select('user_id')
        .where('org_id', 'in', [...invites])
        .execute();
      for (const m of members)
        await this.notifications.notify({
          userId: m.user_id,
          kind: 'rfq_received',
          entityType: 'rfq',
          entityId: rfq.id,
          requiresAction: true,
        });
    }
    return { id: rfq.id, status };
  }

  async myRfqs(user: AuthUser) {
    return this.db
      .selectFrom('rfqs as r')
      .select([
        'r.id',
        'r.title',
        'r.quantity',
        'r.unit',
        'r.status',
        'r.visibility',
        'r.project_id',
        'r.created_at',
        (eb) =>
          eb
            .selectFrom('quotes')
            .select(sql<number>`count(*)::int`.as('n'))
            .whereRef('quotes.rfq_id', '=', 'r.id')
            .as('quotes'),
      ])
      .where('r.buyer_id', '=', user.id)
      .orderBy('r.created_at', 'desc')
      .limit(100)
      .execute();
  }

  /** Marketplace inverso (Buscar negocios): solo necesidades públicas o a las que fue invitado. */
  async supplierRfqs(user: AuthUser, filter: { q?: string; country?: string }) {
    const orgs = await this.access.orgIdsOf(user.id);
    let q = this.db
      .selectFrom('rfqs as r')
      .select([
        'r.id',
        'r.title',
        'r.specs',
        'r.quantity',
        'r.unit',
        'r.destination_country',
        'r.destination_city',
        'r.deadline_days',
        'r.currency',
        'r.needs',
        'r.visibility',
        'r.status',
        'r.created_at',
        'r.expires_at',
        'r.share_budget',
        'r.budget_max',
      ])
      .where('r.status', 'in', ['published', 'sent', 'answered'])
      .where('r.buyer_id', '<>', user.id)
      .where((eb) =>
        eb.or([
          eb('r.visibility', '=', 'public'),
          ...(orgs.length
            ? [
                eb.exists(
                  eb.selectFrom('rfq_invites as i').select('i.rfq_id').whereRef('i.rfq_id', '=', 'r.id').where('i.org_id', 'in', orgs),
                ),
              ]
            : []),
        ]),
      );
    if (filter.q) q = q.where('r.title', 'ilike', `%${filter.q}%`);
    if (filter.country) q = q.where('r.destination_country', '=', filter.country);
    const rows = await q.orderBy('r.created_at', 'desc').limit(60).execute();
    // El presupuesto solo se muestra si el comprador autorizó compartirlo.
    return rows.map(({ share_budget, budget_max, ...r }) => ({ ...r, budget: share_budget ? budget_max : null }));
  }

  async rfqDetail(user: AuthUser, id: string) {
    const r = await this.db.selectFrom('rfqs').selectAll().where('id', '=', id).executeTakeFirst();
    if (!r) throw notFound('rfq');
    const isBuyer = r.buyer_id === user.id;
    const orgs = await this.access.orgIdsOf(user.id);
    const invited = orgs.length
      ? await this.db.selectFrom('rfq_invites').select('org_id').where('rfq_id', '=', id).where('org_id', 'in', orgs).executeTakeFirst()
      : undefined;
    if (!isBuyer && r.visibility !== 'public' && !invited) throw notFound('rfq');
    const quotes = isBuyer
      ? await this.quotesQuery().where('q.rfq_id', '=', id).execute()
      : orgs.length
        ? await this.quotesQuery().where('q.rfq_id', '=', id).where('q.org_id', 'in', orgs).execute()
        : [];
    const { buyer_id: _b, budget_max, share_budget, project_id, requirement_id, ...pub } = r;
    return {
      ...pub,
      budget: isBuyer || share_budget ? budget_max : null,
      projectId: isBuyer ? project_id : null,
      requirementId: isBuyer ? requirement_id : null,
      isBuyer,
      quotes: quotes.map((q) => this.quoteView(q)),
    };
  }

  async sendQuote(user: AuthUser, rfqId: string, input: QuoteInput) {
    const orgId = await this.access.requireOrg(user.id);
    const rfq = await this.db.selectFrom('rfqs').selectAll().where('id', '=', rfqId).executeTakeFirst();
    if (!rfq || !['published', 'sent', 'answered'].includes(rfq.status)) throw notFound('rfq');
    if (rfq.buyer_id === user.id) throw forbidden('cannot_quote_own_rfq');
    if (rfq.visibility !== 'public') {
      const inv = await this.db
        .selectFrom('rfq_invites')
        .select('org_id')
        .where('rfq_id', '=', rfqId)
        .where('org_id', '=', orgId)
        .executeTakeFirst();
      if (!inv) throw notFound('rfq');
    }
    const subtotal = fromUnits(toUnits(input.unitPrice) * BigInt(input.quantity));
    const total = addMoney(subtotal, input.shipping ?? '0', input.taxes ?? '0');
    this.fee(total); // valida monto mínimo
    const prev = await this.db
      .selectFrom('quotes')
      .select(['id', 'version'])
      .where('rfq_id', '=', rfqId)
      .where('org_id', '=', orgId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (prev)
      await this.db.updateTable('quotes').set({ status: 'withdrawn' }).where('id', '=', prev.id).where('status', '=', 'sent').execute();
    const q = await this.db
      .insertInto('quotes')
      .values({
        rfq_id: rfqId,
        listing_id: rfq.listing_id,
        org_id: orgId,
        buyer_id: rfq.buyer_id,
        version: (prev?.version ?? 0) + 1,
        previous_quote_id: prev?.id ?? null,
        description: input.description ?? '',
        quantity: input.quantity,
        unit_price: input.unitPrice,
        shipping: input.shipping ?? '0',
        taxes: input.taxes ?? '0',
        total,
        currency: input.currency,
        lead_time_days: input.leadTimeDays ?? null,
        incoterm: input.incoterm ?? null,
        warranty: input.warranty ?? '',
        terms: input.terms ?? '',
        valid_until: new Date(Date.now() + input.validDays * 86_400_000),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await this.db
      .updateTable('rfqs')
      .set({ status: 'answered' })
      .where('id', '=', rfqId)
      .where('status', 'in', ['sent', 'published'])
      .execute();
    await this.notifications.notify({
      userId: rfq.buyer_id,
      kind: 'quote_received',
      entityType: 'quote',
      entityId: q.id,
      requiresAction: true,
    });
    return { id: q.id };
  }

  async myQuotes(user: AuthUser) {
    const rows = await this.quotesQuery().where('q.buyer_id', '=', user.id).orderBy('q.created_at', 'desc').limit(100).execute();
    return rows.map((q) => this.quoteView(q));
  }

  async supplierQuotes(user: AuthUser) {
    const orgs = await this.access.orgIdsOf(user.id);
    if (!orgs.length) return [];
    const rows = await this.quotesQuery().where('q.org_id', 'in', orgs).orderBy('q.created_at', 'desc').limit(100).execute();
    return rows.map((q) => this.quoteView(q));
  }

  /**
   * Aceptación del comprador: crea el pedido pendiente de pago con la comisión calculada.
   * El envío lo hace el proveedor (ya cotizado); el comprador entrega su dirección y teléfono.
   */
  async acceptQuote(user: AuthUser, quoteId: string, delivery: DeliveryAddress) {
    const q = await this.db.selectFrom('quotes').selectAll().where('id', '=', quoteId).where('buyer_id', '=', user.id).executeTakeFirst();
    if (!q) throw notFound('quote');
    if (q.status !== 'sent') throw conflict('quote_not_open');
    if (q.valid_until < new Date()) {
      await this.db.updateTable('quotes').set({ status: 'expired' }).where('id', '=', q.id).execute();
      throw conflict('quote_expired');
    }
    const rfq = q.rfq_id
      ? await this.db
          .selectFrom('rfqs')
          .select(['project_id', 'requirement_id', 'title', 'unit', 'destination_country', 'destination_city'])
          .where('id', '=', q.rfq_id)
          .executeTakeFirst()
      : null;
    const fee = this.fee(q.total);
    const order = await this.db.transaction().execute(async (trx) => {
      const upd = await trx
        .updateTable('quotes')
        .set({ status: 'accepted' })
        .where('id', '=', q.id)
        .where('status', '=', 'sent')
        .returning(['id'])
        .executeTakeFirst();
      if (!upd) throw conflict('quote_not_open');
      return trx
        .insertInto('orders')
        .values({
          buyer_id: user.id,
          org_id: q.org_id,
          quote_id: q.id,
          listing_id: q.listing_id,
          project_id: rfq?.project_id ?? null,
          requirement_id: rfq?.requirement_id ?? null,
          title: rfq?.title ?? 'Pedido',
          quantity: q.quantity,
          unit: rfq?.unit ?? 'unidad',
          amount: q.total,
          currency: q.currency,
          platform_fee: fee.fee,
          platform_fee_percent: String(fee.percent),
          fulfillment: 'delivery',
          shipping: q.shipping,
          delivery: JSON.stringify({ ...delivery, fulfillment: 'delivery' }),
          is_demo: this.env.DEMO_MODE,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
    });
    const members = await this.db.selectFrom('memberships').select('user_id').where('org_id', '=', q.org_id).execute();
    for (const m of members)
      await this.notifications.notify({ userId: m.user_id, kind: 'order_accepted', entityType: 'order', entityId: order.id });
    await this.notifications.resolveFor(user.id, q.id, ['quote_received']);
    return { orderId: order.id };
  }

  async rejectQuote(user: AuthUser, quoteId: string) {
    const r = await this.db
      .updateTable('quotes')
      .set({ status: 'rejected' })
      .where('id', '=', quoteId)
      .where('buyer_id', '=', user.id)
      .where('status', '=', 'sent')
      .returning(['id'])
      .executeTakeFirst();
    if (!r) throw notFound('quote');
    return { ok: true };
  }

  /** El proveedor puede retirar antes de la aceptación. */
  async withdrawQuote(user: AuthUser, quoteId: string) {
    const orgs = await this.access.orgIdsOf(user.id);
    if (!orgs.length) throw notFound('quote');
    const r = await this.db
      .updateTable('quotes')
      .set({ status: 'withdrawn' })
      .where('id', '=', quoteId)
      .where('org_id', 'in', orgs)
      .where('status', '=', 'sent')
      .returning(['id'])
      .executeTakeFirst();
    if (!r) throw notFound('quote');
    return { ok: true };
  }

  private quotesQuery() {
    return this.db
      .selectFrom('quotes as q')
      .innerJoin('organizations as o', 'o.id', 'q.org_id')
      .leftJoin('rfqs as r', 'r.id', 'q.rfq_id')
      .select([
        'q.id',
        'q.rfq_id',
        'q.version',
        'q.status',
        'q.description',
        'q.quantity',
        'q.unit_price',
        'q.shipping',
        'q.taxes',
        'q.total',
        'q.currency',
        'q.lead_time_days',
        'q.incoterm',
        'q.warranty',
        'q.terms',
        'q.valid_until',
        'q.created_at',
        'o.id as org_id',
        'o.name as org_name',
        'o.trust as org_trust',
        'o.is_demo as org_is_demo',
        'r.title as rfq_title',
      ]);
  }

  private quoteView(q: Awaited<ReturnType<ReturnType<ProcurementService['quotesQuery']>['executeTakeFirstOrThrow']>>) {
    let fee: ReturnType<ProcurementService['fee']> | null;
    try {
      fee = this.fee(q.total);
    } catch {
      fee = null; // pedido por debajo del mínimo: no se muestra comisión
    }
    return {
      id: q.id,
      rfqId: q.rfq_id,
      rfqTitle: q.rfq_title,
      version: q.version,
      status: q.valid_until < new Date() && q.status === 'sent' ? 'expired' : q.status,
      description: q.description,
      quantity: q.quantity,
      unitPrice: q.unit_price,
      shipping: q.shipping,
      taxes: q.taxes,
      total: q.total,
      currency: q.currency,
      leadTimeDays: q.lead_time_days,
      incoterm: q.incoterm,
      warranty: q.warranty,
      terms: q.terms,
      validUntil: q.valid_until,
      createdAt: q.created_at,
      platformFee: fee ? { amount: fee.fee, percent: fee.percent } : null,
      supplier: { id: q.org_id, name: q.org_name, trust: q.org_trust, isDemo: q.org_is_demo },
    };
  }
}
