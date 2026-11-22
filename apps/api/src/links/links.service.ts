import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  addMoney,
  type CheckoutView,
  computePlatformFee,
  type DeliveryAddress,
  fromUnits,
  RISK_DISCLOSURES,
  renderDisclosure,
  toUnits,
} from '@jucumari/shared';
import type { AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { NotificationsService } from '../common/notifications.service';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';
import { EscrowService } from '../escrow/escrow.service';

export interface LinkInput {
  title: string;
  productUrl?: string;
  description?: string;
  price: string;
  shipping?: string;
  deliveryDays: number;
  mode: 'full' | 'partial';
  advance?: string;
  validDays?: number;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** JSON canónico (claves ordenadas) para que la huella de los términos sea reproducible. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}

type LinkRow = {
  id: string;
  org_id: string;
  token: string;
  title: string;
  product_url: string;
  description: string;
  price: string;
  shipping: string;
  currency: string;
  delivery_days: number;
  mode: string;
  advance_amount: string;
  status: string;
  order_id: string | null;
  expires_at: Date;
  is_demo: boolean;
};

/**
 * Enlaces de checkout de Montuno: la importadora fija precio, envío, plazo y modalidad; el comprador abre
 * el enlace privado (sin cuenta), acepta el aviso de riesgo exacto y paga. El dinero va a un escrow en
 * Stellar: escrow completo o anticipo parcial (este último solo con el contrato Soroban).
 */
@Injectable()
export class LinksService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly access: AccessService,
    private readonly escrow: EscrowService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: AuthUser, input: LinkInput) {
    const orgId = await this.access.requireOrg(user.id);
    const org = await this.db
      .selectFrom('organizations')
      .select(['payout_address', 'trust', 'is_demo'])
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
    if (!org.payout_address) throw conflict('supplier_payout_missing');
    if (org.trust === 'kyb_rejected') throw forbidden('supplier_not_allowed');
    const shipping = input.shipping ?? '0';
    const total = addMoney(input.price, shipping);
    let advance = '0';
    if (input.mode === 'partial') {
      advance = input.advance ?? '0';
      const a = toUnits(advance);
      const t = toUnits(total);
      if (a <= 0n || a >= t) throw badRequest('advance_invalid');
      // Tope de la plataforma (sin división: a·10000 ≤ t·bps), como el contrato.
      if (a * 10_000n > t * BigInt(this.env.MONTUNO_MAX_ADVANCE_BPS)) {
        throw badRequest('advance_over_limit', { maxPercent: this.env.MONTUNO_MAX_ADVANCE_BPS / 100 });
      }
      if (!this.escrow.sorobanStatus().enabled) throw conflict('advance_unavailable');
    }
    const token = randomBytes(18).toString('base64url');
    const r = await this.db
      .insertInto('payment_links')
      .values({
        org_id: orgId,
        created_by: user.id,
        token,
        title: input.title,
        product_url: input.productUrl ?? '',
        description: input.description ?? '',
        price: input.price,
        shipping,
        currency: 'USD',
        delivery_days: input.deliveryDays,
        mode: input.mode,
        advance_amount: advance,
        expires_at: new Date(Date.now() + (input.validDays ?? 3) * 86_400_000),
        is_demo: org.is_demo || this.env.DEMO_MODE,
      })
      .returning(['id', 'token'])
      .executeTakeFirstOrThrow();
    return { id: r.id, token: r.token, url: `${this.env.APP_PUBLIC_URL.replace(/\/$/, '')}/c/${r.token}` };
  }

  async mine(user: AuthUser) {
    const orgs = await this.access.orgIdsOf(user.id);
    if (!orgs.length) return [];
    const rows = await this.db
      .selectFrom('payment_links as l')
      .leftJoin('orders as o', 'o.id', 'l.order_id')
      .select([
        'l.id',
        'l.token',
        'l.title',
        'l.price',
        'l.shipping',
        'l.currency',
        'l.mode',
        'l.advance_amount',
        'l.status',
        'l.expires_at',
        'l.created_at',
        'l.order_id',
        'o.status as order_status',
      ])
      .where('l.org_id', 'in', orgs)
      .orderBy('l.created_at', 'desc')
      .limit(100)
      .execute();
    const base = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
    return rows.map((r) => ({
      id: r.id,
      url: `${base}/c/${r.token}`,
      title: r.title,
      total: addMoney(r.price, r.shipping),
      currency: r.currency,
      mode: r.mode,
      advance: r.advance_amount,
      status: r.status === 'active' && r.expires_at < new Date() ? 'expired' : r.status,
      orderId: r.order_id,
      orderStatus: r.order_status,
      createdAt: r.created_at,
    }));
  }

  private async load(token: string) {
    const l = (await this.db.selectFrom('payment_links').selectAll().where('token', '=', token).executeTakeFirst()) as LinkRow | undefined;
    if (!l) throw notFound('link');
    return l;
  }

  private disclosure(l: LinkRow) {
    const total = addMoney(l.price, l.shipping);
    const mode = l.mode === 'partial' ? 'partial' : 'full';
    const d = RISK_DISCLOSURES[mode];
    const pct = toUnits(total) > 0n ? Number((toUnits(l.advance_amount) * 10_000n) / toUnits(total)) / 100 : 0;
    const text = renderDisclosure(d, {
      total: `${total} ${l.currency}`,
      advance: `${l.advance_amount} ${l.currency}`,
      advancePct: `${pct} %`,
      protected: `${fromUnits(toUnits(total) - toUnits(l.advance_amount))} ${l.currency}`,
    });
    return { version: d.version, text, hash: sha256(`montuno/disclosure/${d.version}\n${text}`) };
  }

  /** Vista pública del checkout, sin datos personales ni wallets. */
  async view(token: string): Promise<CheckoutView> {
    const l = await this.load(token);
    const org = await this.db
      .selectFrom('organizations')
      .select(['name', 'city', 'trust', 'is_demo'])
      .where('id', '=', l.org_id)
      .executeTakeFirstOrThrow();
    const total = addMoney(l.price, l.shipping);
    const status = l.status === 'active' && l.expires_at < new Date() ? 'expired' : (l.status as CheckoutView['status']);
    return {
      token: l.token,
      status,
      title: l.title,
      description: l.description,
      productUrl: l.product_url,
      price: l.price,
      shipping: l.shipping,
      total,
      currency: l.currency,
      deliveryDays: l.delivery_days,
      mode: l.mode === 'partial' ? 'partial' : 'full',
      advance: l.advance_amount,
      protectedAmount: fromUnits(toUnits(total) - toUnits(l.advance_amount)),
      expiresAt: l.expires_at.toISOString(),
      isDemo: l.is_demo,
      seller: { name: org.name, city: org.city, trust: org.trust, isDemo: org.is_demo },
      disclosure: this.disclosure(l),
      orderId: null,
    };
  }

  /** El comprador acepta: se registra su consentimiento y se crea el pedido pendiente de pago. */
  async accept(user: AuthUser, token: string, input: { delivery: DeliveryAddress; disclosureVersion: string; disclosureHash: string }) {
    const l = await this.load(token);
    if (l.status !== 'active') throw conflict('link_not_active');
    if (l.expires_at < new Date()) throw conflict('link_expired');
    if ((await this.access.orgIdsOf(user.id)).includes(l.org_id)) throw forbidden('cannot_buy_own_link');
    const d = this.disclosure(l);
    if (input.disclosureVersion !== d.version || input.disclosureHash !== d.hash) throw conflict('disclosure_changed');
    const org = await this.db.selectFrom('organizations').select(['payout_address']).where('id', '=', l.org_id).executeTakeFirstOrThrow();
    if (!org.payout_address) throw conflict('supplier_payout_missing');

    const mode = l.mode === 'partial' ? 'partial' : 'full';
    const provider = this.escrow.providerFor(mode);
    if (provider === 'soroban') {
      if (!this.escrow.sorobanStatus().enabled) throw conflict('advance_unavailable');
      if (user.address === org.payout_address || user.address === this.env.ARBITER_STELLAR_ADDRESS) {
        throw conflict('escrow_participants_must_differ');
      }
    }
    const total = addMoney(l.price, l.shipping);
    const fee = computePlatformFee(total, { basisPoints: this.env.PLATFORM_FEE_BPS, minimum: this.env.PLATFORM_FEE_MIN });
    const terms = {
      schema: 'montuno/terms/v1',
      linkId: l.id,
      orgId: l.org_id,
      title: l.title,
      productUrl: l.product_url,
      price: l.price,
      shipping: l.shipping,
      total,
      currency: l.currency,
      deliveryDays: l.delivery_days,
      mode,
      advance: l.advance_amount,
      disclosureVersion: d.version,
    };
    const termsHash = sha256(canonical(terms));

    const orderId = await this.db.transaction().execute(async (trx) => {
      // Un enlace se usa una sola vez (reclamo condicional contra carreras).
      const claimed = await trx
        .updateTable('payment_links')
        .set({ status: 'accepted' })
        .where('id', '=', l.id)
        .where('status', '=', 'active')
        .returning(['id'])
        .executeTakeFirst();
      if (!claimed) throw conflict('link_not_active');
      const o = await trx
        .insertInto('orders')
        .values({
          buyer_id: user.id,
          org_id: l.org_id,
          title: l.title,
          quantity: 1,
          unit: 'pedido',
          amount: total,
          currency: l.currency,
          platform_fee: fee.fee,
          platform_fee_percent: String(fee.percent),
          fulfillment: 'delivery',
          shipping: l.shipping,
          delivery: JSON.stringify(input.delivery),
          escrow_provider: provider,
          escrow_mode: mode,
          advance_amount: l.advance_amount,
          delivery_days: l.delivery_days,
          product_url: l.product_url,
          is_demo: l.is_demo,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await trx.updateTable('payment_links').set({ order_id: o.id }).where('id', '=', l.id).execute();
      await trx
        .insertInto('consent_records')
        .values({
          order_id: o.id,
          user_id: user.id,
          disclosure_version: d.version,
          disclosure_text: d.text,
          disclosure_hash: d.hash,
          terms_hash: termsHash,
        })
        .execute();
      return o.id;
    });

    if (provider === 'soroban') {
      await this.escrow.createSoroban({
        orderId,
        buyer: user.address,
        importer: org.payout_address,
        amount: total,
        advance: l.advance_amount,
        mode,
        termsHash,
        deliveryDays: l.delivery_days,
        platformFeePercent: String(fee.percent),
      });
    }
    const members = await this.db.selectFrom('memberships').select('user_id').where('org_id', '=', l.org_id).execute();
    for (const m of members)
      await this.notifications.notify({ userId: m.user_id, kind: 'link_accepted', entityType: 'order', entityId: orderId });
    return { orderId };
  }
}
