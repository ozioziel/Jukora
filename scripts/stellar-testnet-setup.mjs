// Prepara cuentas y token de PRUEBA en Stellar Testnet (sin valor real). Idempotente.
// - Cuentas: plataforma (comisión + liberación), árbitro DEMO, emisor del token de prueba.
// - Token USDCDEMO (no es USDC) y su contrato SAC para Trustless Work.
// - Escribe direcciones y llaves de testnet en `.env` (no versionado) y la llave del árbitro
//   en `.demo-keys.json` (no versionado) para entrar como árbitro con «llave de prueba».
// Nunca imprime llaves secretas. Se niega a correr si STELLAR_NETWORK no es testnet.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');
const keysPath = resolve(root, '.demo-keys.json');
let env = readFileSync(envPath, 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
const set = (k, v) => {
  const re = new RegExp(`^${k}=.*$`, 'm');
  env = re.test(env) ? env.replace(re, `${k}=${v}`) : `${env}\n${k}=${v}\n`;
};

if ((get('STELLAR_NETWORK') || 'testnet') !== 'testnet') {
  console.error('Este script solo funciona en testnet.');
  process.exit(1);
}

const horizon = new Horizon.Server(get('STELLAR_HORIZON_URL') || 'https://horizon-testnet.stellar.org');
const keys = existsSync(keysPath) ? JSON.parse(readFileSync(keysPath, 'utf8')) : {};

function keypair(name, secretEnv) {
  const s = (secretEnv && get(secretEnv)) || keys[name];
  const kp = s ? Keypair.fromSecret(s) : Keypair.random();
  keys[name] = kp.secret();
  return kp;
}

async function fund(kp, label) {
  try {
    await horizon.loadAccount(kp.publicKey());
    console.log(`  ${label}: cuenta ya existe`);
  } catch {
    const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    console.log(`  ${label}: friendbot ${r.ok ? 'OK' : `falló (${r.status})`}`);
  }
}

async function trust(kp, asset, label) {
  const acc = await horizon.loadAccount(kp.publicKey());
  if (acc.balances.some((b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer))
    return console.log(`  ${label}: trustline ya existe`);
  const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(120)
    .build();
  tx.sign(kp);
  await horizon.submitTransaction(tx);
  console.log(`  ${label}: trustline creada`);
}

const platform = keypair('platform', 'PLATFORM_STELLAR_SECRET');
const arbiter = keypair('arbiter');
const issuer = keypair('issuer', 'DEMO_TOKEN_ISSUER_SECRET');
const code = get('DEMO_TOKEN_CODE') || 'USDCDEMO';

console.log('Fondeando cuentas de prueba (friendbot)…');
await fund(platform, 'plataforma');
await fund(arbiter, 'árbitro');
await fund(issuer, 'emisor');

const asset = new Asset(code, issuer.publicKey());
console.log('Trustlines…');
await trust(platform, asset, 'plataforma'); // recibe la comisión

console.log('Contrato SAC del token de prueba…');
let contractId = get('DEMO_TOKEN_CONTRACT_ID');
const stellar = process.platform === 'win32' ? 'stellar.exe' : 'stellar';
// Red explícita y entorno sin variables STELLAR_* del sistema que puedan apuntar a otra red.
const net = ['--rpc-url', 'https://soroban-testnet.stellar.org', '--network-passphrase', Networks.TESTNET];
const cliEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('STELLAR_') && !k.startsWith('SOROBAN_')));
try {
  contractId = execFileSync(stellar, ['contract', 'id', 'asset', '--asset', `${code}:${issuer.publicKey()}`, ...net], {
    encoding: 'utf8',
    env: cliEnv,
  }).trim();
  try {
    execFileSync(
      stellar,
      ['contract', 'asset', 'deploy', '--asset', `${code}:${issuer.publicKey()}`, '--source-account', issuer.secret(), ...net],
      {
        env: cliEnv,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    console.log('  SAC desplegado');
  } catch (e) {
    const msg = String(e.stderr ?? e.message);
    console.log(/exist/i.test(msg) ? '  SAC ya desplegado' : `  aviso al desplegar SAC: ${msg.split('\n')[0]}`);
  }
} catch (e) {
  console.log(`  No se pudo calcular el contrato SAC (¿Stellar CLI instalado?): ${String(e.message).split('\n')[0]}`);
}

set('PLATFORM_STELLAR_ADDRESS', platform.publicKey());
set('PLATFORM_STELLAR_SECRET', platform.secret());
set('ARBITER_STELLAR_ADDRESS', arbiter.publicKey());
set('DEMO_TOKEN_CODE', code);
set('DEMO_TOKEN_ISSUER', issuer.publicKey());
set('DEMO_TOKEN_ISSUER_SECRET', issuer.secret());
if (contractId) set('DEMO_TOKEN_CONTRACT_ID', contractId);
writeFileSync(envPath, env);
writeFileSync(
  keysPath,
  JSON.stringify({ ...keys, _aviso: 'Llaves de TESTNET sin valor real. No versionar. No usar en mainnet.' }, null, 2),
);

// Cuenta del árbitro DEMO con su rol (se entra con «llave de prueba» importando su llave).
const db = new pg.Client({ connectionString: get('DATABASE_URL') });
try {
  await db.connect();
  await db.query(
    `insert into public.app_users (stellar_address, auth_method, display_name, staff_roles, is_demo)
     values ($1, 'demo', 'Árbitro DEMO', '{arbiter}', true)
     on conflict (stellar_address) do update set staff_roles = array(select distinct unnest(app_users.staff_roles || '{arbiter}'))`,
    [arbiter.publicKey()],
  );
  console.log('Rol de árbitro DEMO asignado en la base local.');
} catch (e) {
  console.log(`No se pudo asignar el rol en la base (¿Supabase local apagado?): ${e.message}`);
} finally {
  await db.end().catch(() => undefined);
}

console.log('\nListo (testnet):');
console.log(`  Plataforma: ${platform.publicKey()}`);
console.log(`  Árbitro:    ${arbiter.publicKey()}  (llave en .demo-keys.json)`);
console.log(`  Token:      ${code}:${issuer.publicKey()}`);
console.log(`  SAC:        ${contractId || 'pendiente'}`);
