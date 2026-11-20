import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { AuthUser } from '../auth/auth.types';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../common/errors';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';
import { StellarService } from '../escrow/stellar.service';

/** Tipo de cambio y comisión de la rampa SIMULADA. No son datos de mercado. */
export const SIMULATED_RAMP = { currency: 'BOB', ratePerUnit: '6.96', feePercent: 1, minutes: 15 } as const;

/**
 * «Pagar con QR»: en testnet la rampa es SIMULADA (QR no pagable, etiquetado) y entrega token de
 * prueba a la wallet del usuario. La rampa real (Pollar: Stereum BOB por QR bancario) solo existe
 * en mainnet y requiere aprobación expresa; aquí no se activa.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly stellar: StellarService,
  ) {}

  config() {
    return {
      network: this.env.STELLAR_NETWORK,
      asset: { code: this.env.DEMO_TOKEN_CODE, issuer: this.env.DEMO_TOKEN_ISSUER ?? null, isTestToken: true },
      simulatedRamp: this.simulatedEnabled() ? SIMULATED_RAMP : null,
      pollar: {
        enabled: Boolean(this.env.VITE_POLLAR_PUBLISHABLE_KEY),
        // En testnet Pollar ofrece un ancla sandbox (ARS, PEN, COP), no bolivianos.
        sandboxCurrencies: this.env.STELLAR_NETWORK === 'testnet' ? ['ARS', 'PEN', 'COP'] : [],
        liveBobQr: false,
      },
    };
  }

  private simulatedEnabled() {
    return this.env.DEMO_MODE && this.env.STELLAR_NETWORK === 'testnet' && Boolean(this.env.DEMO_TOKEN_ISSUER_SECRET);
  }

  async wallet(user: AuthUser) {
    const [trust, balance] = await Promise.all([this.stellar.hasTrustline(user.address), this.stellar.balance(user.address)]);
    return {
      address: user.address,
      network: this.env.STELLAR_NETWORK,
      accountExists: trust !== null,
      hasTrustline: trust === true,
      balance,
    };
  }

  async prepareTrustline(user: AuthUser) {
    return { unsignedXdr: await this.stellar.buildTrustlineTx(user.address), networkPassphrase: this.stellar.passphrase };
  }

  /** Solo acepta una transacción changeTrust del propio usuario hacia el token de prueba. */
  async submitTrustline(user: AuthUser, signedXdr: string) {
    let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
    try {
      tx = TransactionBuilder.fromXDR(signedXdr, this.stellar.passphrase);
    } catch {
      throw badRequest('xdr_invalid');
    }
    if (!(tx instanceof Transaction) || tx.source !== user.address || tx.operations.length !== 1) throw forbidden('unexpected_transaction');
    const op = tx.operations[0]!;
    if (op.type !== 'changeTrust' || !('line' in op) || op.line.toString() !== this.stellar.demoAsset().toString())
      throw forbidden('unexpected_transaction');
    const r = await this.stellar.submit(signedXdr);
    if (!r.successful) throw unavailable('trustline_failed');
    return { hash: r.hash };
  }

  async createSimulatedRamp(user: AuthUser, input: { tokenAmount: string; orderId?: string }) {
    if (!this.simulatedEnabled()) throw unavailable('simulated_ramp_unavailable');
    if (input.orderId) {
      const o = await this.db
        .selectFrom('orders')
        .select('id')
        .where('id', '=', input.orderId)
        .where('buyer_id', '=', user.id)
        .executeTakeFirst();
      if (!o) throw notFound('order');
    }
    const token = Number(input.tokenAmount);
    if (!(token > 0 && token <= 10_000)) throw badRequest('amount_out_of_range');
    const fiat = (token * Number(SIMULATED_RAMP.ratePerUnit) * (1 + SIMULATED_RAMP.feePercent / 100)).toFixed(2);
    const reference = `SIM-${randomBytes(4).toString('hex').toUpperCase()}`;
    // Carga útil deliberadamente NO pagable: no es un QR bancario EMV y lo dice en el propio texto.
    const qr = `SIMULACION NO PAGABLE | DEMO testnet | ref ${reference} | Bs ${fiat}`;
    const r = await this.db
      .insertInto('ramps')
      .values({
        user_id: user.id,
        order_id: input.orderId ?? null,
        kind: 'simulated_bob',
        fiat_amount: fiat,
        fiat_currency: SIMULATED_RAMP.currency,
        token_amount: input.tokenAmount,
        reference,
        qr_payload: qr,
        expires_at: new Date(Date.now() + SIMULATED_RAMP.minutes * 60_000),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.view(r);
  }

  async ramp(user: AuthUser, id: string) {
    const r = await this.db.selectFrom('ramps').selectAll().where('id', '=', id).where('user_id', '=', user.id).executeTakeFirst();
    if (!r) throw notFound('ramp');
    if (r.status === 'awaiting_payment' && r.expires_at < new Date()) {
      await this.db.updateTable('ramps').set({ status: 'expired' }).where('id', '=', id).execute();
      r.status = 'expired';
    }
    return this.view(r);
  }

  /** Botón «Simular el pago del banco» (solo DEMO): el emisor de prueba acredita el token. */
  async simulateBankPayment(user: AuthUser, id: string) {
    if (!this.simulatedEnabled()) throw unavailable('simulated_ramp_unavailable');
    const r = await this.ramp(user, id);
    if (r.status !== 'awaiting_payment') throw conflict('ramp_not_awaiting');
    if ((await this.stellar.hasTrustline(user.address)) !== true) throw conflict('trustline_required');
    const claimed = await this.db
      .updateTable('ramps')
      .set({ status: 'processing' })
      .where('id', '=', id)
      .where('status', '=', 'awaiting_payment')
      .returning(['id'])
      .executeTakeFirst();
    if (!claimed) throw conflict('ramp_not_awaiting');
    try {
      const hash = await this.stellar.mintDemoToken(user.address, r.tokenAmount);
      await this.db.updateTable('ramps').set({ status: 'credited', tx_hash: hash }).where('id', '=', id).execute();
    } catch {
      await this.db.updateTable('ramps').set({ status: 'failed' }).where('id', '=', id).execute();
      throw unavailable('mint_failed');
    }
    return this.ramp(user, id);
  }

  private view(r: {
    id: string;
    kind: string;
    fiat_amount: string;
    fiat_currency: string;
    token_amount: string;
    status: string;
    reference: string;
    qr_payload: string | null;
    tx_hash: string | null;
    expires_at: Date;
  }) {
    return {
      id: r.id,
      kind: r.kind,
      isSimulated: r.kind === 'simulated_bob',
      fiat: { amount: r.fiat_amount, currency: r.fiat_currency },
      tokenAmount: r.token_amount,
      tokenCode: this.env.DEMO_TOKEN_CODE,
      status: r.status,
      reference: r.reference,
      qrPayload: r.status === 'awaiting_payment' ? r.qr_payload : null,
      txHash: r.tx_hash,
      expiresAt: r.expires_at,
    };
  }
}
