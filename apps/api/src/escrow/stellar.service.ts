import { Inject, Injectable } from '@nestjs/common';
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { badRequest, unavailable } from '../common/errors';
import { ENV, type Env } from '../config/env';

/**
 * Utilidades Stellar del lado del servidor. La API NUNCA tiene llaves de los usuarios.
 * Solo en testnet usa dos llaves propias de la plataforma: la de liberación/despliegue (rol de
 * coordinación con poder mínimo) y la del emisor del token de prueba (rampa QR simulada).
 */
@Injectable()
export class StellarService {
  readonly passphrase: string;
  private readonly horizon: Horizon.Server;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.passphrase = env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    this.horizon = new Horizon.Server(env.STELLAR_HORIZON_URL);
  }

  demoAsset(): Asset {
    if (!this.env.DEMO_TOKEN_ISSUER) throw unavailable('demo_token_not_configured');
    return new Asset(this.env.DEMO_TOKEN_CODE, this.env.DEMO_TOKEN_ISSUER);
  }

  /** Dirección que se usa como `trustline.address` en Trustless Work (contrato SAC del token). */
  trustline(): { address: string; symbol: string } {
    if (!this.env.DEMO_TOKEN_CONTRACT_ID) throw unavailable('demo_token_not_configured');
    return { address: this.env.DEMO_TOKEN_CONTRACT_ID, symbol: this.env.DEMO_TOKEN_CODE };
  }

  /** Hash de la transacción (sin firmas): permite comprobar que el usuario firmó lo que preparamos. */
  txHash(xdr: string): string {
    try {
      return Buffer.from(TransactionBuilder.fromXDR(xdr, this.passphrase).hash()).toString('hex');
    } catch {
      throw badRequest('xdr_invalid');
    }
  }

  assertSameTransaction(unsignedXdr: string, signedXdr: string): string {
    const a = this.txHash(unsignedXdr);
    const b = this.txHash(signedXdr);
    if (a !== b) throw badRequest('signed_tx_mismatch');
    const tx = TransactionBuilder.fromXDR(signedXdr, this.passphrase);
    if (!tx.signatures.length) throw badRequest('tx_not_signed');
    return b;
  }

  /** Firma con la llave de la plataforma (solo testnet; en mainnet esto se haría con custodia aprobada). */
  signAsPlatform(xdr: string): string {
    if (this.env.STELLAR_NETWORK !== 'testnet' || !this.env.PLATFORM_STELLAR_SECRET) throw unavailable('platform_signer_unavailable');
    const kp = Keypair.fromSecret(this.env.PLATFORM_STELLAR_SECRET);
    if (kp.publicKey() !== this.env.PLATFORM_STELLAR_ADDRESS) throw unavailable('platform_signer_mismatch');
    const tx = TransactionBuilder.fromXDR(xdr, this.passphrase);
    tx.sign(kp);
    return tx.toXDR();
  }

  async hasTrustline(address: string): Promise<boolean | null> {
    try {
      const acc = await this.horizon.loadAccount(address);
      return acc.balances.some(
        (b) =>
          'asset_code' in b &&
          b.asset_code === this.env.DEMO_TOKEN_CODE &&
          'asset_issuer' in b &&
          b.asset_issuer === this.env.DEMO_TOKEN_ISSUER,
      );
    } catch {
      return null; // cuenta inexistente o red no disponible
    }
  }

  async balance(address: string): Promise<string | null> {
    try {
      const acc = await this.horizon.loadAccount(address);
      const b = acc.balances.find(
        (x) =>
          'asset_code' in x &&
          x.asset_code === this.env.DEMO_TOKEN_CODE &&
          'asset_issuer' in x &&
          x.asset_issuer === this.env.DEMO_TOKEN_ISSUER,
      );
      return b ? b.balance : '0';
    } catch {
      return null;
    }
  }

  /** XDR sin firmar para que el usuario acepte el token de prueba en su cuenta. */
  async buildTrustlineTx(address: string): Promise<string> {
    const account = await this.horizon.loadAccount(address).catch(() => {
      throw badRequest('account_not_found');
    });
    return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.passphrase })
      .addOperation(Operation.changeTrust({ asset: this.demoAsset() }))
      .setTimeout(300)
      .build()
      .toXDR();
  }

  /** Envía a la red una transacción ya firmada y espera el resultado. */
  async submit(signedXdr: string): Promise<{ hash: string; successful: boolean }> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.passphrase);
    try {
      const r = await this.horizon.submitTransaction(tx);
      return { hash: r.hash, successful: r.successful };
    } catch {
      return { hash: Buffer.from(tx.hash()).toString('hex'), successful: false };
    }
  }

  /** Rampa simulada (testnet): el emisor del token de prueba paga al usuario. */
  async mintDemoToken(to: string, amount: string): Promise<string> {
    if (this.env.STELLAR_NETWORK !== 'testnet' || !this.env.DEMO_MODE || !this.env.DEMO_TOKEN_ISSUER_SECRET)
      throw unavailable('simulated_ramp_unavailable');
    const issuer = Keypair.fromSecret(this.env.DEMO_TOKEN_ISSUER_SECRET);
    const account = await this.horizon.loadAccount(issuer.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.passphrase })
      .addOperation(Operation.payment({ destination: to, asset: this.demoAsset(), amount }))
      .setTimeout(120)
      .build();
    tx.sign(issuer);
    const r = await this.horizon.submitTransaction(tx);
    if (!r.successful) throw unavailable('mint_failed');
    return r.hash;
  }
}
