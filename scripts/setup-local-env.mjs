// Crea `.env` local a partir de `.env.example` sin imprimir secretos.
// - Copia la plantilla si `.env` no existe.
// - Rellena SESSION_SECRET y KYC_HMAC_SECRET aleatorios si están vacíos.
// - Lee la clave de servicio del Storage local (contenedor supabase_storage_jucumari).
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : readFileSync(examplePath, 'utf8');

function setIfEmpty(key, value) {
  const re = new RegExp(`^${key}=(.*)$`, 'm');
  const m = text.match(re);
  if (!m) {
    text += `\n${key}=${value}\n`;
    return 'añadida';
  }
  if (m[1].trim() !== '') return 'sin cambios';
  text = text.replace(re, `${key}=${value}`);
  return 'rellenada';
}

const report = {};
report.SESSION_SECRET = setIfEmpty('SESSION_SECRET', randomBytes(32).toString('base64url'));
report.KYC_HMAC_SECRET = setIfEmpty('KYC_HMAC_SECRET', randomBytes(32).toString('base64url'));

try {
  const env = execFileSync('docker', ['inspect', 'supabase_storage_jucumari', '--format', '{{range .Config.Env}}{{println .}}{{end}}'], {
    encoding: 'utf8',
  });
  const line = env.split('\n').find((l) => l.startsWith('SERVICE_KEY='));
  if (line) report.SUPABASE_SERVICE_ROLE_KEY = setIfEmpty('SUPABASE_SERVICE_ROLE_KEY', line.slice('SERVICE_KEY='.length).trim());
  else report.SUPABASE_SERVICE_ROLE_KEY = 'no encontrada en el contenedor';
} catch {
  report.SUPABASE_SERVICE_ROLE_KEY = 'Supabase local no está corriendo (npm run db:start)';
}

writeFileSync(envPath, text);
console.log('.env listo. Estado de cada valor (sin mostrar secretos):');
for (const [k, v] of Object.entries(report)) console.log(`  ${k}: ${v}`);
