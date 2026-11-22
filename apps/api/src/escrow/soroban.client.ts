import { createHash } from 'node:crypto';
import { Address, BASE_FEE, Contract, nativeToScVal, rpc, scValToNative, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

/**
 * Cliente del contrato escrow de Montuno (Soroban, contrato `import_escrow` del equipo).
 * Construye invocaciones sin firmar para que cada parte firme en su wallet; la API nunca tiene llaves
 * de los usuarios. Modos: 0 = escrow completo, 1 = anticipo parcial (el anticipo pagado no es
 * recuperable on-chain; el resto queda retenido hasta la confirmación o la resolución del árbitro).
 */
export type EscrowMode = 'full' | 'partial';

export interface OnchainTerms {
  importer: string;
  arbiter: string;
  token: string;
  amountTotal: bigint; // unidades atómicas (7 decimales)
  advanceAmount: bigint;
  mode: EscrowMode;
  termsHash: string; // hex de 32 bytes
  fundingDeadline: number; // segundos Unix
  fulfillmentDeadline: number;
}

export interface OnchainOrder {
  status: 'funded' | 'advance_paid' | 'disputed' | 'settled' | 'cancelled';
  amountTotal: bigint;
  advanceAmount: bigint;
  advanceReleased: bigint;
  remainingEscrow: bigint;
  sellerReleased: bigint;
  buyerRefunded: bigint;
  buyer: string;
  importer: string;
  termsHash: string;
}

const STATUS = ['funded', 'advance_paid', 'disputed', 'settled', 'cancelled'] as const;

/** order_id on-chain determinista y sin datos personales. */
export function onchainOrderId(orderId: string): string {
  return createHash('sha256').update(`montuno/order/v1:${orderId}`).digest('hex');
}

/** Huella de un texto (motivo de disputa, resolución) para guardar on-chain sin el texto. */
export function hash32(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const bytes32 = (hex: string) => {
  const b = Buffer.from(hex, 'hex');
  if (b.length !== 32) throw new Error('hash_must_be_32_bytes');
  return xdr.ScVal.scvBytes(b);
};
const addr = (a: string) => new Address(a).toScVal();
const i128 = (v: bigint) => nativeToScVal(v, { type: 'i128' });
const u64 = (v: number) => nativeToScVal(BigInt(v), { type: 'u64' });

/** `OrderTerms` como mapa con claves ordenadas (así codifica Soroban los structs). */
export function termsToScVal(t: OnchainTerms): xdr.ScVal {
  const entries: [string, xdr.ScVal][] = [
    ['advance_amount', i128(t.advanceAmount)],
    ['amount_total', i128(t.amountTotal)],
    ['arbiter', addr(t.arbiter)],
    ['fulfillment_deadline', u64(t.fulfillmentDeadline)],
    ['funding_deadline', u64(t.fundingDeadline)],
    ['importer', addr(t.importer)],
    ['mode', nativeToScVal(t.mode === 'partial' ? 1 : 0, { type: 'u32' })],
    ['terms_hash', bytes32(t.termsHash)],
    ['token', addr(t.token)],
  ];
  return xdr.ScVal.scvMap(entries.map(([k, v]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v })));
}

export class SorobanEscrowClient {
  private readonly server: rpc.Server;
  private readonly contract: Contract;

  constructor(
    rpcUrl: string,
    readonly contractId: string,
    readonly passphrase: string,
  ) {
    this.server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
    this.contract = new Contract(contractId);
  }

  private async build(source: string, method: string, args: xdr.ScVal[]): Promise<string> {
    const account = await this.server.getAccount(source);
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.passphrase })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(300)
      .build();
    // Simula y agrega el footprint y la autorización; si el contrato rechazaría la llamada, falla aquí.
    const prepared = await this.server.prepareTransaction(tx);
    return prepared.toXDR();
  }

  createAndFund(buyer: string, orderIdHex: string, terms: OnchainTerms) {
    return this.build(buyer, 'create_and_fund', [bytes32(orderIdHex), addr(buyer), termsToScVal(terms)]);
  }
  claimAdvance(importer: string, orderIdHex: string) {
    return this.build(importer, 'claim_advance', [bytes32(orderIdHex)]);
  }
  confirmDelivery(buyer: string, orderIdHex: string) {
    return this.build(buyer, 'confirm_delivery_and_release', [bytes32(orderIdHex)]);
  }
  openDispute(caller: string, orderIdHex: string, reasonHashHex: string) {
    return this.build(caller, 'open_dispute', [bytes32(orderIdHex), addr(caller), bytes32(reasonHashHex)]);
  }
  resolveDispute(arbiter: string, orderIdHex: string, refundToBuyer: bigint, releaseToImporter: bigint, resolutionHashHex: string) {
    return this.build(arbiter, 'resolve_dispute', [
      bytes32(orderIdHex),
      i128(refundToBuyer),
      i128(releaseToImporter),
      bytes32(resolutionHashHex),
    ]);
  }

  /** Envía una transacción firmada y espera su resultado (si el RPC tarda, se consulta por hash, nunca se reenvía). */
  async send(signedXdr: string): Promise<{ hash: string; ok: boolean; error?: string }> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.passphrase);
    const sent = await this.server.sendTransaction(tx);
    if (sent.status === 'ERROR') return { hash: sent.hash, ok: false, error: 'send_error' };
    for (let i = 0; i < 30; i++) {
      const r = await this.server.getTransaction(sent.hash);
      if (r.status === rpc.Api.GetTransactionStatus.SUCCESS) return { hash: sent.hash, ok: true };
      if (r.status === rpc.Api.GetTransactionStatus.FAILED) return { hash: sent.hash, ok: false, error: 'tx_failed' };
      await new Promise((res) => setTimeout(res, 1000));
    }
    return { hash: sent.hash, ok: false, error: 'timeout' };
  }

  /** Lee el pedido on-chain (simulación de solo lectura, no envía nada). */
  async getOrder(orderIdHex: string, anySource: string): Promise<OnchainOrder | null> {
    const account = await this.server.getAccount(anySource);
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.passphrase })
      .addOperation(this.contract.call('get_order', bytes32(orderIdHex)))
      .setTimeout(60)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) return null;
    const o = scValToNative(sim.result.retval) as Record<string, unknown>;
    const big = (k: string) => BigInt(o[k] as bigint | number);
    return {
      status: STATUS[Number(o.status)] ?? 'funded',
      amountTotal: big('amount_total'),
      advanceAmount: big('advance_amount'),
      advanceReleased: big('advance_released'),
      remainingEscrow: big('remaining_escrow'),
      sellerReleased: big('seller_released'),
      buyerRefunded: big('buyer_refunded'),
      buyer: String(o.buyer),
      importer: String(o.importer),
      termsHash: Buffer.from(o.terms_hash as Uint8Array).toString('hex'),
    };
  }
}
