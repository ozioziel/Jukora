import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';

/** SEP-53: firma de mensajes arbitrarios con una cuenta Stellar. */
export function sep53Hash(message: string): Buffer {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from('Stellar Signed Message:\n', 'utf8'), Buffer.from(message, 'utf8')]))
    .digest();
}

function decodeSignature(signature: string): Buffer | null {
  const s = signature.trim();
  if (/^[0-9a-f]{128}$/i.test(s)) return Buffer.from(s, 'hex');
  try {
    const b = Buffer.from(s, 'base64');
    return b.length === 64 ? b : null;
  } catch {
    return null;
  }
}

export function verifySep53(address: string, message: string, signature: string): boolean {
  const sig = decodeSignature(signature);
  if (!sig) return false;
  try {
    return Keypair.fromPublicKey(address).verify(sep53Hash(message), sig);
  } catch {
    return false;
  }
}

/** Solo para pruebas: firma como lo haría una wallet. */
export function signSep53(secret: string, message: string): string {
  return Buffer.from(Keypair.fromSecret(secret).sign(sep53Hash(message))).toString('base64');
}
