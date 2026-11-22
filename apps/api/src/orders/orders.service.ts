import { Inject, Injectable } from '@nestjs/common';
import {
  addMoney,
  canTransitionOrder,
  computePlatformFee,
  type DeliveryInput,
  type DeliveryRecord,
  deliveryFor,
  fromUnits,
  type OrderStatus,
  sameCity,
  toUnits,
} from '@jucumari/shared';
import type { AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { NotificationsService } from '../common/notifications.service';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';
import { EscrowService } from '../escrow/escrow.service';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly access: AccessService,
    private readonly escrow: EscrowService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Compra directa de un artículo con precio, stock y proveedor habilitado. Si no, corresponde cotizar.
   * Jukora es pasarela: el envío lo hace el proveedor al costo que fijó en el artículo, o el comprador
   * retira en el local (solo si está en la misma ciudad y el proveedor lo ofrece).
   */
  async fromListing(
    user: AuthUser,
    input: { listingId: string; quantity: number; projectId?: string; requirementId?: string; delivery: DeliveryInput },
  ) {
    const l = await this.db
      .selectFrom('listings as l')
      .innerJoin('organizations as o', 'o.id', 'l.org_id')
      .select([
        'l.id',
        'l.title',
        'l.price',
        'l.currency',
        'l.quote_only',
        'l.stock',
        'l.min_qty',
        'l.unit',
        'l.org_id',
        'l.ships_to',
        'l.origin_country',
        'l.origin_city',
        'l.shipping_cost',
        'l.pickup_address',
        'o.trust',
        'o.payout_address',
        'l.is_demo',
      ])
      .where('l.id', '=', input.listingId)
      .where('l.status', '=', 'published')
      .executeTakeFirst();
    if (!l) throw notFound('listing');
    if (l.quote_only || !l.price) throw conflict('quote_required');
    if (l.trust === 'kyb_rejected' || !l.payout_address) throw conflict('supplier_not_ready');
    if (input.quantity < l.min_qty) throw badRequest('below_min_qty', { minQty: l.min_qty });
    if (l.stock !== null && input.quantity > l.stock) throw conflict('insufficient_stock');
    if (await this.access.orgIdsOf(user.id).then((o) => o.includes(l.org_id))) throw forbidden('cannot_buy_own_listing');
    if (input.projectId) {
      const p = await this.db
        .selectFrom('projects')
        .select('id')
        .where('id', '=', input.projectId)
        .where('owner_id', '=', user.id)
        .executeTakeFirst();
      if (!p) throw notFound('project');
    }
    const d = input.delivery;
    let record: DeliveryRecord;
    if (d.fulfillment === 'pickup') {
      if (!l.pickup_address) throw conflict('pickup_not_offered');
      if (!sameCity(d.city, l.origin_city)) throw conflict('pickup_other_city', { city: l.origin_city });
      record = { fulfillment: 'pickup', city: d.city, phone: d.phone, pickup: { address: l.pickup_address, city: l.origin_city } };
    } else {
      if (d.country !== l.origin_country && !l.ships_to.includes(d.country)) throw conflict('destination_not_served');
      const { fulfillment: _f, ...address } = d;
      record = { fulfillment: 'delivery', ...address };
    }
    const shipping = d.fulfillment === 'delivery' ? fromUnits(toUnits(l.shipping_cost)) : '0';
    const amount = addMoney(fromUnits(toUnits(l.price) * BigInt(input.quantity)), shipping);
    const fee = computePlatformFee(amount, { basisPoints: this.env.PLATFORM_FEE_BPS, minimum: this.env.PLATFORM_FEE_MIN });
    const o = await this.db
      .insertInto('orders')
      .values({
        buyer_id: user.id,
        org_id: l.org_id,
        listing_id: l.id,
        project_id: input.projectId ?? null,
        requirement_id: input.requirementId ?? null,
        title: l.title,
        quantity: input.quantity,
        unit: l.unit,
        amount,
        currency: l.currency,
        platform_fee: fee.fee,
        platform_fee_percent: String(fee.percent),
        fulfillment: d.fulfillment,
        shipping,
        delivery: JSON.stringify(record),
        is_demo: l.is_demo,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    return { orderId: o.id };
  }

  async list(user: AuthUser, as: 'buyer' | 'supplier') {
    let q = this.db
      .selectFrom('orders as o')
      .innerJoin('organizations as org', 'org.id', 'o.org_id')
      .leftJoin('escrows as e', 'e.order_id', 'o.id')
      .select([
        'o.id',
        'o.title',
        'o.quantity',
        'o.unit',
        'o.amount',
        'o.currency',
        'o.status',
        'o.is_demo',
        'o.project_id',
        'o.created_at',
        'o.updated_at',
        'org.name as supplier_name',
        'e.status as escrow_status',
      ]);
    if (as === 'buyer') q = q.where('o.buyer_id', '=', user.id);
    else {
      const orgs = await this.access.orgIdsOf(user.id);
      if (!orgs.length) return [];
      q = q.where('o.org_id', 'in', orgs);
    }
    return q.orderBy('o.updated_at', 'desc').limit(100).execute();
  }

  async detail(user: AuthUser, id: string) {
    const { role, order } = await this.access.orderRole(user, id);
    const org = await this.db
      .selectFrom('organizations')
      .select(['id', 'name', 'trust', 'is_demo'])
      .where('id', '=', order.org_id)
      .executeTakeFirstOrThrow();
    const shipments = await this.db.selectFrom('shipments').selectAll().where('order_id', '=', id).orderBy('created_at').execute();
    const dispute = await this.db.selectFrom('disputes').select(['id', 'status', 'reason']).where('order_id', '=', id).executeTakeFirst();
    const review = await this.db.selectFrom('reviews').select(['supplier_rating']).where('order_id', '=', id).executeTakeFirst();
    // Datos de entrega: el proveedor los ve recién con el pago protegido financiado.
    const funded = !['pending_payment', 'cancelled'].includes(order.status);
    const delivery = deliveryFor(role, funded, order.delivery as Record<string, unknown>);
    return {
      id: order.id,
      role,
      title: order.title,
      quantity: order.quantity,
      unit: order.unit,
      amount: order.amount,
      currency: order.currency,
      platformFee: { amount: order.platform_fee, percent: order.platform_fee_percent },
      status: order.status,
      isDemo: order.is_demo,
      projectId: role === 'buyer' ? order.project_id : null,
      fulfillment: order.fulfillment,
      shipping: order.shipping,
      // La dirección de entrega solo la ven comprador, árbitro asignado y, con el pago financiado, el proveedor.
      delivery: delivery.data,
      deliveryHidden: !delivery.visible,
      supplier: { id: org.id, name: org.name, trust: org.trust, isDemo: org.is_demo },
      escrow: await this.escrow.forOrder(id),
      escrowConfig: this.escrow.configFor(order.escrow_provider),
      escrowProvider: order.escrow_provider,
      escrowMode: order.escrow_mode,
      advanceAmount: order.advance_amount,
      deliveryDays: order.delivery_days,
      productUrl: order.product_url,
      shipments: shipments.map((s) => ({
        id: s.id,
        carrier: s.carrier,
        tracking: s.tracking,
        isSimulated: s.is_simulated,
        events: s.events,
        createdAt: s.created_at,
      })),
      dispute: dispute ?? null,
      reviewed: Boolean(review),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  async cancel(user: AuthUser, id: string) {
    const { role, order } = await this.access.orderRole(user, id);
    if (role !== 'buyer') throw forbidden('only_buyer');
    if (!canTransitionOrder(order.status as OrderStatus, 'cancelled')) throw conflict('order_not_cancellable');
    const escrow = await this.db.selectFrom('escrows').select('status').where('order_id', '=', id).executeTakeFirst();
    if (escrow && !['not_created', 'created', 'funding_pending'].includes(escrow.status)) throw conflict('escrow_already_funded');
    await this.db.updateTable('orders').set({ status: 'cancelled' }).where('id', '=', id).execute();
    return { ok: true };
  }

  /** Avances del proveedor. Nunca puede marcar la aceptación del comprador. */
  async supplierUpdate(
    user: AuthUser,
    id: string,
    input: { status: 'preparing' | 'shipped' | 'delivery_notified'; carrier?: string; tracking?: string },
  ) {
    const { role, order } = await this.access.orderRole(user, id);
    if (role !== 'supplier') throw forbidden('only_supplier');
    const escrow = await this.db.selectFrom('escrows').select('status').where('order_id', '=', id).executeTakeFirst();
    if (!escrow || escrow.status !== 'funded') throw conflict('escrow_not_funded'); // sin financiación confirmada no se indica envío
    if (!canTransitionOrder(order.status as OrderStatus, input.status)) throw conflict('invalid_transition');
    if (input.status === 'shipped' && order.fulfillment === 'pickup') throw conflict('pickup_not_shipped');
    await this.db.updateTable('orders').set({ status: input.status }).where('id', '=', id).execute();
    if (input.status === 'shipped') {
      // El envío lo hace el proveedor: Jukora solo registra lo que él informa (no lo verifica).
      await this.db
        .insertInto('shipments')
        .values({
          order_id: id,
          carrier: input.carrier ?? (order.is_demo ? 'Logística DEMO' : ''),
          tracking: input.tracking ?? '',
          is_simulated: order.is_demo,
          events: JSON.stringify([
            { at: new Date().toISOString(), label: order.is_demo ? 'Enviado (simulación DEMO)' : 'Enviado (informado por el proveedor)' },
          ]),
        })
        .execute();
    }
    const kind = input.status === 'preparing' ? 'preparing' : input.status === 'shipped' ? 'shipped' : 'delivery_notified';
    await this.notifications.notify({
      userId: order.buyer_id,
      kind,
      entityType: 'order',
      entityId: id,
      requiresAction: input.status === 'delivery_notified',
    });
    return { status: input.status };
  }

  /** El comprador revisa la entrega: el estado «en camino» o «entrega notificada» no es recepción. */
  async startReview(user: AuthUser, id: string) {
    const { role, order } = await this.access.orderRole(user, id);
    if (role !== 'buyer') throw forbidden('only_buyer');
    if (!canTransitionOrder(order.status as OrderStatus, 'in_review')) throw conflict('invalid_transition');
    await this.db.updateTable('orders').set({ status: 'in_review' }).where('id', '=', id).execute();
    return { status: 'in_review' };
  }

  async review(user: AuthUser, id: string, input: { supplierRating: number; productRating?: number; comment?: string }) {
    const { role, order } = await this.access.orderRole(user, id);
    if (role !== 'buyer') throw forbidden('only_buyer');
    if (order.status !== 'completed') throw conflict('order_not_completed');
    await this.db
      .insertInto('reviews')
      .values({
        order_id: id,
        author_id: user.id,
        org_id: order.org_id,
        supplier_rating: input.supplierRating,
        product_rating: input.productRating ?? null,
        comment: input.comment ?? '',
        is_demo: order.is_demo,
      })
      .onConflict((oc) => oc.columns(['order_id', 'author_id']).doNothing())
      .execute();
    return { ok: true };
  }
}
