import { Inject, Injectable, Logger } from '@nestjs/common';
import { fromUnits, toUnits } from '@jucumari/shared';
import type { AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access.service';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../common/errors';
import { NotificationsService } from '../common/notifications.service';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';
import { hash32, onchainOrderId, type OnchainTerms, SorobanEscrowClient } from './soroban.client';
import { StellarService } from './stellar.service';
import { type TwRoles, TwClient } from './tw.client';

type Action = 'deploy' | 'fund' | 'change_status' | 'approve' | 'release' | 'dispute' | 'resolve' | 'claim_advance';

/** Términos del contrato Soroban guardados en `escrows.terms` (montos atómicos como texto). */
interface StoredTerms {
  buyer: string;
  importer: string;
  arbiter: string;
  token: string;
  amountTotal: string;
  advanceAmount: string;
  mode: 'full' | 'partial';
  termsHash: string;
  fundingDeadline: number;
  fulfillmentDeadline: number;
}
const toOnchain = (t: StoredTerms): OnchainTerms => ({ ...t, amountTotal: BigInt(t.amountTotal), advanceAmount: BigInt(t.advanceAmount) });

/** Número para la API de Trustless Work a partir de un decimal exacto (máx. 7 decimales). */
const toTwNumber = (amount: string) => Number(toUnits(amount)) / 1e7;

/**
 * Escrow por pedido (single-release) con Trustless Work en testnet.
 * Roles: comprador = approver; proveedor = serviceProvider y receiver; plataforma = platformAddress
 * y releaseSigner (solo puede liberar después de la aprobación del comprador); árbitro independiente
 * = disputeResolver. Un pago se marca confirmado solo con respuesta de la red.
 */
@Injectable()
export class EscrowService {
  private readonly logger = new Logger('Escrow');
  /** Contrato escrow de Montuno (Soroban): escrow completo y anticipo parcial. */
  private readonly soroban: SorobanEscrowClient | null;

  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tw: TwClient,
    private readonly stellar: StellarService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
  ) {
    this.soroban = env.MONTUNO_ESCROW_CONTRACT_ID
      ? new SorobanEscrowClient(env.STELLAR_RPC_URL, env.MONTUNO_ESCROW_CONTRACT_ID, this.stellar.passphrase)
      : null;
  }

  /** Configuración del contrato Soroban de Montuno (anticipo y respaldo del escrow completo). */
  sorobanStatus() {
    return {
      enabled: Boolean(this.soroban && this.env.ARBITER_STELLAR_ADDRESS && this.env.DEMO_TOKEN_CONTRACT_ID),
      provider: 'soroban' as const,
      network: this.env.STELLAR_NETWORK,
      contractId: this.env.MONTUNO_ESCROW_CONTRACT_ID ?? null,
      asset: { code: this.env.DEMO_TOKEN_CODE, issuer: this.env.DEMO_TOKEN_ISSUER ?? null, isTestToken: true },
      missing: [
        !this.soroban && 'MONTUNO_ESCROW_CONTRACT_ID',
        !this.env.ARBITER_STELLAR_ADDRESS && 'ARBITER_STELLAR_ADDRESS',
        !this.env.DEMO_TOKEN_CONTRACT_ID && 'DEMO_TOKEN_CONTRACT_ID',
      ].filter(Boolean) as string[],
    };
  }

  /** Configuración según el motor del pedido. */
  configFor(provider: string) {
    return provider === 'soroban' ? this.sorobanStatus() : { ...this.status(), provider: 'trustless_work' as const, contractId: null };
  }

  /**
   * Motor para un pedido nuevo de enlace: el anticipo siempre va al contrato Soroban; el escrow completo usa
   * Trustless Work cuando está configurado y, si no, el mismo contrato Soroban (que también lo soporta).
   */
  providerFor(mode: 'full' | 'partial'): 'trustless_work' | 'soroban' {
    if (mode === 'partial') return 'soroban';
    if (this.status().enabled) return 'trustless_work';
    // Sin Trustless Work: el contrato Soroban también hace escrow completo. Sin ninguno, la página lo informa.
    return this.sorobanStatus().enabled ? 'soroban' : 'trustless_work';
  }

  /** Crea el escrow Soroban del pedido con los términos exactos que aceptó el comprador (sin mover fondos). */
  async createSoroban(input: {
    orderId: string;
    buyer: string;
    importer: string;
    amount: string;
    advance: string;
    mode: 'full' | 'partial';
    termsHash: string;
    deliveryDays: number;
    platformFeePercent: string;
  }) {
    const st = this.sorobanStatus();
    if (!st.enabled) throw unavailable('escrow_not_configured');
    const arbiter = this.env.ARBITER_STELLAR_ADDRESS!;
    if (new Set([input.buyer, input.importer, arbiter]).size !== 3) throw conflict('escrow_participants_must_differ');
    const now = Math.floor(Date.now() / 1000);
    const fundingDeadline = now + 3 * 86_400;
    const terms: StoredTerms = {
      buyer: input.buyer,
      importer: input.importer,
      arbiter,
      token: this.env.DEMO_TOKEN_CONTRACT_ID!,
      amountTotal: toUnits(input.amount).toString(),
      advanceAmount: toUnits(input.advance).toString(),
      mode: input.mode,
      termsHash: input.termsHash,
      fundingDeadline,
      fulfillmentDeadline: fundingDeadline + input.deliveryDays * 86_400,
    };
    return this.db
      .insertInto('escrows')
      .values({
        order_id: input.orderId,
        network: this.env.STELLAR_NETWORK,
        engagement_id: onchainOrderId(input.orderId),
        contract_id: this.env.MONTUNO_ESCROW_CONTRACT_ID!,
        provider: 'soroban',
        roles: JSON.stringify({ buyer: input.buyer, importer: input.importer, arbiter }),
        terms: JSON.stringify(terms),
        amount: input.amount,
        platform_fee_percent: input.platformFeePercent,
        asset_code: this.env.DEMO_TOKEN_CODE,
        asset_address: this.env.DEMO_TOKEN_CONTRACT_ID!,
        status: 'funding_pending',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
  }

  status() {
    return {
      enabled:
        this.tw.enabled() &&
        Boolean(this.env.PLATFORM_STELLAR_ADDRESS && this.env.ARBITER_STELLAR_ADDRESS && this.env.DEMO_TOKEN_CONTRACT_ID),
      network: this.env.STELLAR_NETWORK,
      asset: { code: this.env.DEMO_TOKEN_CODE, issuer: this.env.DEMO_TOKEN_ISSUER ?? null, isTestToken: true },
      missing: [
        !this.tw.enabled() && 'TW_API_KEY',
        !this.env.PLATFORM_STELLAR_ADDRESS && 'PLATFORM_STELLAR_ADDRESS',
        !this.env.ARBITER_STELLAR_ADDRESS && 'ARBITER_STELLAR_ADDRESS',
        !this.env.DEMO_TOKEN_CONTRACT_ID && 'DEMO_TOKEN_CONTRACT_ID',
      ].filter(Boolean),
    };
  }

  async forOrder(orderId: string) {
    const e = await this.db.selectFrom('escrows').selectAll().where('order_id', '=', orderId).executeTakeFirst();
    if (!e) return null;
    const txs = await this.db
      .selectFrom('escrow_txs')
      .select(['id', 'action', 'status', 'tx_hash', 'signer', 'created_at'])
      .where('escrow_id', '=', e.id)
      .orderBy('created_at')
      .execute();
    const terms = e.terms as Partial<StoredTerms>;
    return {
      id: e.id,
      provider: e.provider,
      network: e.network,
      contractId: e.contract_id,
      status: e.status,
      mode: terms.mode ?? 'full',
      advanceAmount: terms.advanceAmount ? fromUnits(BigInt(terms.advanceAmount)) : '0',
      advanceReleased: e.advance_released,
      amount: e.amount,
      asset: { code: e.asset_code, address: e.asset_address },
      platformFeePercent: e.platform_fee_percent,
      roles: e.roles,
      txs,
    };
  }

  /** El comprador inicia el pago protegido: la plataforma despliega el contrato (sin mover fondos). */
  async open(user: AuthUser, orderId: string) {
    const { role, order } = await this.access.orderRole(user, orderId);
    if (role !== 'buyer') throw forbidden('only_buyer');
    if (order.status !== 'pending_payment') throw conflict('order_not_payable');
    if (order.escrow_provider === 'soroban') {
      // El escrow Soroban se crea al aceptar el enlace, con los términos exactos; aquí solo se devuelve.
      const e = await this.forOrder(orderId);
      if (!e) throw conflict('escrow_not_created');
      return e;
    }
    const st = this.status();
    if (!st.enabled) throw unavailable('escrow_not_configured');
    const org = await this.db
      .selectFrom('organizations')
      .select(['payout_address', 'trust'])
      .where('id', '=', order.org_id)
      .executeTakeFirstOrThrow();
    if (!org.payout_address) throw conflict('supplier_payout_missing');
    if (org.trust === 'kyb_rejected') throw conflict('supplier_not_allowed');

    let escrow = await this.db.selectFrom('escrows').selectAll().where('order_id', '=', orderId).executeTakeFirst();
    if (!escrow) {
      const roles: TwRoles = {
        approver: user.address,
        serviceProvider: org.payout_address,
        platformAddress: this.env.PLATFORM_STELLAR_ADDRESS!,
        releaseSigner: this.env.PLATFORM_STELLAR_ADDRESS!,
        disputeResolver: this.env.ARBITER_STELLAR_ADDRESS!,
        receiver: org.payout_address,
      };
      const trust = this.stellar.trustline();
      escrow = await this.db
        .insertInto('escrows')
        .values({
          order_id: orderId,
          network: this.env.STELLAR_NETWORK,
          engagement_id: `order-${orderId}`,
          roles: JSON.stringify(roles),
          amount: order.amount,
          platform_fee_percent: order.platform_fee_percent,
          asset_code: trust.symbol,
          asset_address: trust.address,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    if (escrow.contract_id) return this.forOrder(orderId);

    const roles = escrow.roles as unknown as TwRoles;
    const unsigned = await this.tw.deploy({
      signer: this.env.PLATFORM_STELLAR_ADDRESS!,
      engagementId: escrow.engagement_id,
      title: order.title.slice(0, 80),
      description: `Pedido ${order.id} · ${order.quantity} ${order.unit}`,
      roles,
      amount: toTwNumber(order.amount),
      platformFee: Number(order.platform_fee_percent),
      trustline: { address: escrow.asset_address, symbol: escrow.asset_code },
      milestones: [{ description: 'Entrega recibida y aceptada por el comprador' }],
    });
    const tx = await this.record(escrow.id, 'deploy', this.env.PLATFORM_STELLAR_ADDRESS!, unsigned, `deploy:${escrow.id}`);
    await this.finalize(tx.id, this.stellar.signAsPlatform(unsigned));
    return this.forOrder(orderId);
  }

  /** Prepara una transacción que firma el usuario con su wallet (Pollar, Freighter o llave de prueba). */
  async prepare(
    user: AuthUser,
    orderId: string,
    action: Action,
    extra: { distributions?: { buyer: string; supplier: string }; evidence?: string } = {},
  ) {
    const { role, order } = await this.access.orderRole(user, orderId);
    const escrow = await this.db.selectFrom('escrows').selectAll().where('order_id', '=', orderId).executeTakeFirst();
    if (!escrow?.contract_id) throw conflict('escrow_not_deployed');
    if (escrow.provider === 'soroban') return this.prepareSoroban(user, role, order, escrow, action, extra);
    const roles = escrow.roles as unknown as TwRoles;
    const cid = escrow.contract_id;
    let unsigned: string;
    let signer: string;

    switch (action) {
      case 'fund':
        if (role !== 'buyer' || escrow.status !== 'funding_pending') throw conflict('fund_not_allowed');
        signer = user.address;
        unsigned = await this.tw.fund(cid, signer, toTwNumber(order.amount));
        break;
      case 'change_status':
        if (role !== 'supplier' || user.address !== roles.serviceProvider) throw forbidden('only_service_provider_wallet');
        signer = user.address;
        unsigned = await this.tw.changeMilestoneStatus(cid, signer, 'delivered', (extra.evidence ?? '').slice(0, 200));
        break;
      case 'approve':
        if (role !== 'buyer' || user.address !== roles.approver) throw forbidden('only_approver');
        if (order.status !== 'in_review' || escrow.status !== 'funded') throw conflict('approve_not_allowed');
        signer = user.address;
        unsigned = await this.tw.approve(cid, signer);
        break;
      case 'dispute': {
        const isParty =
          (role === 'buyer' && user.address === roles.approver) || (role === 'supplier' && user.address === roles.serviceProvider);
        if (!isParty) throw forbidden('only_parties');
        if (!['funded', 'approval_pending'].includes(escrow.status)) throw conflict('dispute_not_allowed');
        signer = user.address;
        unsigned = await this.tw.dispute(cid, signer);
        break;
      }
      case 'resolve': {
        if (role !== 'arbiter' || user.address !== roles.disputeResolver) throw forbidden('only_dispute_resolver');
        if (escrow.status !== 'disputed') throw conflict('resolve_not_allowed');
        const d = extra.distributions;
        if (!d) throw badRequest('distributions_required');
        if (toUnits(d.buyer) + toUnits(d.supplier) !== toUnits(order.amount)) throw badRequest('distributions_must_equal_amount');
        signer = user.address;
        unsigned = await this.tw.resolve(
          cid,
          signer,
          [
            { address: roles.approver, amount: toTwNumber(d.buyer) },
            { address: roles.receiver, amount: toTwNumber(d.supplier) },
          ].filter((x) => x.amount > 0),
        );
        break;
      }
      default:
        throw badRequest('action_invalid');
    }
    const tx = await this.record(escrow.id, action, signer, unsigned, `${action}:${escrow.id}:${Date.now()}`);
    return { txId: tx.id, action, unsignedXdr: unsigned, networkPassphrase: this.stellar.passphrase };
  }

  /** Contrato Soroban de Montuno: cada parte firma su propia invocación. */
  private async prepareSoroban(
    user: AuthUser,
    role: 'buyer' | 'supplier' | 'arbiter',
    order: { id: string; status: string; amount: string },
    escrow: { id: string; status: string; engagement_id: string; terms: unknown; advance_released: string },
    action: Action,
    extra: { distributions?: { buyer: string; supplier: string }; evidence?: string },
  ) {
    if (!this.soroban) throw unavailable('escrow_not_configured');
    const t = escrow.terms as StoredTerms;
    const oid = escrow.engagement_id;
    let unsigned: string;
    switch (action) {
      case 'fund':
        if (role !== 'buyer' || user.address !== t.buyer) throw forbidden('only_buyer_wallet');
        if (escrow.status !== 'funding_pending') throw conflict('fund_not_allowed');
        if (Math.floor(Date.now() / 1000) > t.fundingDeadline) throw conflict('funding_deadline_passed');
        unsigned = await this.soroban.createAndFund(user.address, oid, toOnchain(t));
        break;
      case 'claim_advance':
        if (role !== 'supplier' || user.address !== t.importer) throw forbidden('only_importer_wallet');
        if (t.mode !== 'partial' || escrow.status !== 'funded') throw conflict('advance_not_allowed');
        if (toUnits(escrow.advance_released) > 0n) throw conflict('advance_already_claimed');
        unsigned = await this.soroban.claimAdvance(user.address, oid);
        break;
      case 'approve':
        if (role !== 'buyer' || user.address !== t.buyer) throw forbidden('only_buyer_wallet');
        if (!['delivery_notified', 'in_review'].includes(order.status) || escrow.status !== 'funded') throw conflict('approve_not_allowed');
        unsigned = await this.soroban.confirmDelivery(user.address, oid);
        break;
      case 'dispute': {
        const isParty = (role === 'buyer' && user.address === t.buyer) || (role === 'supplier' && user.address === t.importer);
        if (!isParty) throw forbidden('only_parties');
        if (escrow.status !== 'funded') throw conflict('dispute_not_allowed');
        unsigned = await this.soroban.openDispute(user.address, oid, hash32(`dispute:${order.id}:${extra.evidence ?? ''}`));
        break;
      }
      case 'resolve': {
        if (role !== 'arbiter' || user.address !== t.arbiter) throw forbidden('only_dispute_resolver');
        if (escrow.status !== 'disputed') throw conflict('resolve_not_allowed');
        const d = extra.distributions;
        if (!d) throw badRequest('distributions_required');
        // Solo se reparte lo que sigue retenido: el anticipo ya pagado no vuelve.
        const remaining = toUnits(order.amount) - toUnits(escrow.advance_released);
        if (toUnits(d.buyer) + toUnits(d.supplier) !== remaining) throw badRequest('distributions_must_equal_remaining');
        unsigned = await this.soroban.resolveDispute(
          user.address,
          oid,
          toUnits(d.buyer),
          toUnits(d.supplier),
          hash32(`resolution:${order.id}:${d.buyer}:${d.supplier}`),
        );
        break;
      }
      default:
        throw badRequest('action_invalid');
    }
    const tx = await this.record(escrow.id, action, user.address, unsigned, `${action}:${escrow.id}:${Date.now()}`);
    return { txId: tx.id, action, unsignedXdr: unsigned, networkPassphrase: this.stellar.passphrase };
  }

  /** Recibe el XDR firmado, comprueba que es el mismo que preparamos y lo envía a la red. */
  async submit(user: AuthUser, txId: string, signedXdr: string) {
    const tx = await this.db.selectFrom('escrow_txs').selectAll().where('id', '=', txId).executeTakeFirst();
    if (!tx || tx.signer !== user.address) throw notFound('escrow_tx');
    if (tx.status !== 'prepared') throw conflict('tx_already_submitted');
    return this.finalize(tx.id, signedXdr);
  }

  private async finalize(txId: string, signedXdr: string) {
    const tx = await this.db.selectFrom('escrow_txs').selectAll().where('id', '=', txId).executeTakeFirstOrThrow();
    const hash = this.stellar.assertSameTransaction(tx.unsigned_xdr!, signedXdr);
    // Idempotencia: marcar como enviada antes de enviar evita dobles envíos concurrentes.
    const claimed = await this.db
      .updateTable('escrow_txs')
      .set({ status: 'submitted', tx_hash: hash })
      .where('id', '=', txId)
      .where('status', '=', 'prepared')
      .returning(['id'])
      .executeTakeFirst();
    if (!claimed) throw conflict('tx_already_submitted');

    const esc = await this.db
      .selectFrom('escrows')
      .select(['provider', 'engagement_id', 'terms'])
      .where('id', '=', tx.escrow_id)
      .executeTakeFirstOrThrow();
    if (esc.provider === 'soroban') return this.finalizeSoroban(tx, signedXdr, esc);

    let response: Awaited<ReturnType<TwClient['send']>>;
    try {
      response = await this.tw.send(signedXdr);
    } catch (e) {
      await this.db.updateTable('escrow_txs').set({ status: 'failed', error: 'send_failed' }).where('id', '=', txId).execute();
      throw e;
    }
    const ok = !response.status || /success/i.test(String(response.status));
    if (!ok) {
      await this.db
        .updateTable('escrow_txs')
        .set({ status: 'failed', error: String(response.message ?? response.status).slice(0, 300) })
        .where('id', '=', txId)
        .execute();
      throw unavailable('escrow_tx_failed');
    }
    await this.db.updateTable('escrow_txs').set({ status: 'confirmed' }).where('id', '=', txId).execute();
    await this.applyConfirmed(tx.escrow_id, tx.action as Action, response, signedXdr);
    return { txId, status: 'confirmed', hash };
  }

  /** Envía al contrato Soroban y verifica en la red el estado resultante antes de marcar nada. */
  private async finalizeSoroban(
    tx: { id: string; escrow_id: string; action: string },
    signedXdr: string,
    esc: { engagement_id: string; terms: unknown },
  ) {
    const t = esc.terms as StoredTerms;
    let r: { hash: string; ok: boolean; error?: string };
    try {
      r = await this.soroban!.send(signedXdr);
    } catch {
      await this.db.updateTable('escrow_txs').set({ status: 'failed', error: 'send_failed' }).where('id', '=', tx.id).execute();
      throw unavailable('escrow_tx_failed');
    }
    if (!r.ok) {
      await this.db
        .updateTable('escrow_txs')
        .set({ status: 'failed', error: r.error ?? 'failed' })
        .where('id', '=', tx.id)
        .execute();
      throw unavailable('escrow_tx_failed');
    }
    // Financiado solo si el contrato guarda exactamente los términos aceptados.
    const onchain = await this.soroban!.getOrder(esc.engagement_id, t.buyer);
    if (tx.action === 'fund' && (!onchain || onchain.termsHash !== t.termsHash || onchain.amountTotal !== BigInt(t.amountTotal))) {
      await this.db.updateTable('escrow_txs').set({ status: 'failed', error: 'onchain_mismatch' }).where('id', '=', tx.id).execute();
      throw unavailable('escrow_onchain_mismatch');
    }
    await this.db.updateTable('escrow_txs').set({ status: 'confirmed', tx_hash: r.hash }).where('id', '=', tx.id).execute();
    if (tx.action === 'claim_advance') {
      await this.db
        .updateTable('escrows')
        .set({ advance_released: onchain ? fromUnits(onchain.advanceReleased) : fromUnits(BigInt(t.advanceAmount)) })
        .where('id', '=', tx.escrow_id)
        .execute();
      const o = await this.db
        .selectFrom('escrows')
        .innerJoin('orders', 'orders.id', 'escrows.order_id')
        .select(['orders.id', 'orders.buyer_id'])
        .where('escrows.id', '=', tx.escrow_id)
        .executeTakeFirstOrThrow();
      await this.notifications.notify({ userId: o.buyer_id, kind: 'advance_released', entityType: 'order', entityId: o.id });
    } else if (tx.action === 'approve') {
      // En el contrato Soroban la confirmación del comprador libera directamente el saldo a la importadora.
      await this.db
        .updateTable('orders')
        .set({ status: 'accepted' })
        .where('id', '=', await this.orderIdOf(tx.escrow_id))
        .execute();
      await this.applyConfirmed(tx.escrow_id, 'release', {}, signedXdr);
    } else {
      await this.applyConfirmed(tx.escrow_id, tx.action as Action, {}, signedXdr);
    }
    return { txId: tx.id, status: 'confirmed', hash: r.hash };
  }

  private async orderIdOf(escrowId: string) {
    const e = await this.db.selectFrom('escrows').select('order_id').where('id', '=', escrowId).executeTakeFirstOrThrow();
    return e.order_id;
  }

  private async applyConfirmed(escrowId: string, action: Action, response: Record<string, unknown>, _signedXdr: string) {
    const escrow = await this.db.selectFrom('escrows').selectAll().where('id', '=', escrowId).executeTakeFirstOrThrow();
    const order = await this.db.selectFrom('orders').selectAll().where('id', '=', escrow.order_id).executeTakeFirstOrThrow();
    const roles = escrow.roles as unknown as TwRoles;
    switch (action) {
      case 'deploy': {
        const contractId = typeof response.contractId === 'string' ? response.contractId : null;
        if (!contractId) throw unavailable('escrow_contract_id_missing');
        await this.db
          .updateTable('escrows')
          .set({ contract_id: contractId, status: 'funding_pending' })
          .where('id', '=', escrowId)
          .execute();
        break;
      }
      case 'fund':
        await this.db.updateTable('escrows').set({ status: 'funded' }).where('id', '=', escrowId).execute();
        await this.db
          .updateTable('orders')
          .set({ status: 'funded' })
          .where('id', '=', order.id)
          .where('status', '=', 'pending_payment')
          .execute();
        for (const m of await this.members(order.org_id)) {
          await this.notifications.notify({
            userId: m,
            kind: 'funding_confirmed',
            entityType: 'order',
            entityId: order.id,
            requiresAction: true,
          });
        }
        await this.notifications.notify({ userId: order.buyer_id, kind: 'funding_confirmed', entityType: 'order', entityId: order.id });
        break;
      case 'approve': {
        await this.db.updateTable('escrows').set({ status: 'release_pending' }).where('id', '=', escrowId).execute();
        await this.db.updateTable('orders').set({ status: 'accepted' }).where('id', '=', order.id).execute();
        // La plataforma solo puede liberar después de la aprobación del comprador (regla del contrato).
        try {
          const unsigned = await this.tw.release(escrow.contract_id!, roles.releaseSigner);
          const rel = await this.record(escrowId, 'release', roles.releaseSigner, unsigned, `release:${escrowId}`);
          await this.finalize(rel.id, this.stellar.signAsPlatform(unsigned));
        } catch (e) {
          this.logger.warn(`Liberación pendiente para ${escrowId}: ${e instanceof Error ? e.message : e}`);
        }
        break;
      }
      case 'release':
        await this.db.updateTable('escrows').set({ status: 'released' }).where('id', '=', escrowId).execute();
        await this.db.updateTable('orders').set({ status: 'completed' }).where('id', '=', order.id).execute();
        for (const m of await this.members(order.org_id)) {
          await this.notifications.notify({ userId: m, kind: 'funds_released', entityType: 'order', entityId: order.id });
        }
        await this.notifications.resolveFor(order.buyer_id, order.id, ['delivery_notified', 'review_reminder']);
        break;
      case 'dispute': {
        await this.db.updateTable('escrows').set({ status: 'disputed' }).where('id', '=', escrowId).execute();
        const d = await this.db
          .updateTable('disputes')
          .set({ status: 'collecting_evidence', evidence_deadline: new Date(Date.now() + 5 * 86_400_000) })
          .where('order_id', '=', order.id)
          .returning(['id', 'opened_by'])
          .executeTakeFirst();
        if (d) {
          const parties = [order.buyer_id, ...(await this.members(order.org_id))].filter((u) => u !== d.opened_by);
          const arbiters = await this.db.selectFrom('app_users').select('id').where('staff_roles', '@>', ['arbiter']).execute();
          for (const u of [...parties, ...arbiters.map((a) => a.id)]) {
            await this.notifications.notify({
              userId: u,
              kind: 'dispute_opened',
              entityType: 'dispute',
              entityId: d.id,
              requiresAction: true,
            });
          }
        }
        break;
      }
      case 'resolve': {
        await this.db.updateTable('escrows').set({ status: 'resolved' }).where('id', '=', escrowId).execute();
        const d = await this.db.selectFrom('disputes').select(['id', 'decision']).where('order_id', '=', order.id).executeTakeFirst();
        await this.db.updateTable('disputes').set({ status: 'resolved' }).where('order_id', '=', order.id).execute();
        const decision = (d?.decision ?? {}) as { buyer?: string };
        // Reembolso total: el pedido se cancela. Una resolución no suma progreso a la casa.
        if (decision.buyer && toUnits(decision.buyer) === toUnits(order.amount)) {
          await this.db.updateTable('orders').set({ status: 'cancelled' }).where('id', '=', order.id).execute();
        }
        const targets = [order.buyer_id, ...(await this.members(order.org_id))];
        for (const u of targets)
          await this.notifications.notify({ userId: u, kind: 'dispute_resolved', entityType: 'dispute', entityId: d?.id ?? order.id });
        break;
      }
      case 'change_status':
      case 'claim_advance':
        break;
    }
  }

  private async members(orgId: string) {
    const rows = await this.db.selectFrom('memberships').select('user_id').where('org_id', '=', orgId).execute();
    return rows.map((r) => r.user_id);
  }

  private record(escrowId: string, action: Action, signer: string, unsignedXdr: string, idempotencyKey: string) {
    return this.db
      .insertInto('escrow_txs')
      .values({ escrow_id: escrowId, action, signer, unsigned_xdr: unsignedXdr, idempotency_key: idempotencyKey })
      .returning(['id'])
      .executeTakeFirstOrThrow();
  }
}
