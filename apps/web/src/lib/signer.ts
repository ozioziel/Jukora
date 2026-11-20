import type { PollarClient } from '@pollar/core';

/**
 * Firmantes en el navegador. La plataforma nunca recibe llaves privadas: cada persona firma con
 * su wallet (Pollar por correo, una wallet Stellar o, solo en testnet, una llave de prueba local).
 */
export type SignerMethod = 'pollar' | 'wallet' | 'demo';

export interface Signer {
  method: SignerMethod;
  address: string;
  /** SEP-53: devuelve la firma en base64. */
  signMessage(message: string): Promise<string>;
  /** Devuelve el XDR firmado. */
  signTx(xdr: string, networkPassphrase: string): Promise<string>;
}

const TEST_KEY = 'jcm.testkey';
const TESTNET = (import.meta.env.VITE_STELLAR_NETWORK ?? 'testnet') === 'testnet';

async function sep53Hash(message: string): Promise<Uint8Array> {
  const prefix = new TextEncoder().encode('Stellar Signed Message:\n');
  const body = new TextEncoder().encode(message);
  const all = new Uint8Array(prefix.length + body.length);
  all.set(prefix);
  all.set(body, prefix.length);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', all));
}

const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

// ───────────── Llave de prueba (solo testnet) ─────────────
export async function testKeySigner(secret?: string): Promise<Signer> {
  if (!TESTNET) throw new Error('test_key_testnet_only');
  const { Keypair, TransactionBuilder } = await import('@stellar/stellar-sdk');
  const { Buffer } = await import('buffer');
  const stored = secret ?? safeGet(TEST_KEY);
  const kp = stored ? Keypair.fromSecret(stored) : Keypair.random();
  safeSet(TEST_KEY, kp.secret());
  if (!stored) await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`).catch(() => undefined);
  return {
    method: 'demo',
    address: kp.publicKey(),
    async signMessage(message) {
      return toBase64(kp.sign(Buffer.from(await sep53Hash(message))));
    },
    async signTx(xdr, passphrase) {
      const tx = TransactionBuilder.fromXDR(xdr, passphrase);
      tx.sign(kp);
      return tx.toXDR();
    },
  };
}

export function hasStoredTestKey() {
  return Boolean(safeGet(TEST_KEY));
}

export function forgetTestKey() {
  try {
    localStorage.removeItem(TEST_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

// ───────────── Wallets Stellar (Freighter, xBull, LOBSTR, WalletConnect…) ─────────────
let kitReady = false;
export async function walletKitSigner(): Promise<Signer> {
  const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit/sdk');
  const { defaultModules } = await import('@creit.tech/stellar-wallets-kit/modules/utils');
  if (!kitReady) {
    StellarWalletsKit.init({ modules: defaultModules() });
    kitReady = true;
  }
  const { address } = await StellarWalletsKit.authModal();
  return {
    method: 'wallet',
    address,
    async signMessage(message) {
      const r = await StellarWalletsKit.signMessage(message, { address });
      return r.signedMessage;
    },
    async signTx(xdr, networkPassphrase) {
      const r = await StellarWalletsKit.signTransaction(xdr, { address, networkPassphrase });
      return r.signedTxXdr;
    },
  };
}

// ───────────── Pollar (correo → wallet gestionada) ─────────────
let pollar: PollarClient | null = null;

export async function pollarClient(): Promise<PollarClient> {
  const key = import.meta.env.VITE_POLLAR_PUBLISHABLE_KEY as string | undefined;
  if (!key) throw new Error('pollar_not_configured');
  if (pollar) return pollar;
  const { PollarClient } = await import('@pollar/core');
  const c = new PollarClient({ apiKey: key, stellarNetwork: TESTNET ? 'testnet' : 'mainnet' } as ConstructorParameters<
    typeof PollarClient
  >[0]);
  await c.ready();
  pollar = c;
  return c;
}

export async function pollarSendCode(email: string) {
  const c = await pollarClient();
  c.sendEmailCode(email.trim());
}

/** Tras verificar el código, devuelve el firmante con la wallet de Pollar. */
export async function pollarVerify(code: string): Promise<Signer> {
  const c = await pollarClient();
  await new Promise<void>((resolve, reject) => {
    const off = c.onAuthStateChange((s) => {
      if (s.step === 'authenticated') {
        off();
        resolve();
      } else if (s.step === 'error') {
        off();
        reject(new Error(s.message));
      }
    });
    c.verifyEmailCode(code.trim());
  });
  const address = c.getWallet()?.address;
  if (!address) throw new Error('pollar_wallet_missing');
  return {
    method: 'pollar',
    address,
    async signMessage(message) {
      const r = await c.stellar.sep53.signMessage(message);
      if (r.status !== 'signed') throw new Error('signature_rejected');
      return r.signature;
    },
    async signTx(xdr) {
      const r = await c.signTx(xdr);
      if (r.status !== 'signed') throw new Error('signature_rejected');
      return r.signedXdr;
    },
  };
}

// ───────────── Firmante activo de la sesión ─────────────
let current: Signer | null = null;
export const setSigner = (s: Signer | null) => {
  current = s;
};

/** Recupera un firmante para la cuenta de la sesión (al recargar la página). */
export async function signerFor(method: SignerMethod, address: string): Promise<Signer> {
  if (current?.address === address) return current;
  if (method === 'demo') {
    const s = await testKeySigner();
    if (s.address !== address) throw new Error('test_key_mismatch');
    current = s;
    return s;
  }
  if (method === 'pollar') {
    const c = await pollarClient();
    if (c.getAuthState().step !== 'authenticated' || c.getWallet()?.address !== address) throw new Error('pollar_session_required');
    current = {
      method: 'pollar',
      address,
      signMessage: async (m) => {
        const r = await c.stellar.sep53.signMessage(m);
        if (r.status !== 'signed') throw new Error('signature_rejected');
        return r.signature;
      },
      signTx: async (x) => {
        const r = await c.signTx(x);
        if (r.status !== 'signed') throw new Error('signature_rejected');
        return r.signedXdr;
      },
    };
    return current;
  }
  const s = await walletKitSigner();
  if (s.address !== address) throw new Error('wallet_mismatch');
  current = s;
  return s;
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* modo privado: la llave solo vive en memoria */
  }
}
