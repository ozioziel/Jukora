// Asigna o quita un rol privilegiado (arbiter | verifier | admin) a una cuenta existente.
// Uso: npm run roles:assign -- --address G... --role arbiter [--remove]
// Los roles nunca se asignan desde la interfaz.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]?.startsWith('--') ? true : (arr[i + 1] ?? true)]] : acc),
      [],
    ),
);
const role = String(args.role ?? '');
const address = String(args.address ?? '');
if (!['arbiter', 'verifier', 'admin'].includes(role) || !/^G[A-Z2-7]{55}$/.test(address)) {
  console.error('Uso: npm run roles:assign -- --address G... --role arbiter|verifier|admin [--remove]');
  process.exit(1);
}
const env = readFileSync(resolve(import.meta.dirname, '..', '.env'), 'utf8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
const db = new pg.Client({ connectionString: url });
await db.connect();
const sql = args.remove
  ? `update public.app_users set staff_roles = array_remove(staff_roles, $2) where stellar_address = $1 returning staff_roles`
  : `update public.app_users set staff_roles = array(select distinct unnest(staff_roles || array[$2])) where stellar_address = $1 returning staff_roles`;
const r = await db.query(sql, [address, role]);
await db.end();
if (!r.rowCount) {
  console.error('No existe una cuenta con esa dirección. La persona debe iniciar sesión una vez primero.');
  process.exit(1);
}
console.log(`Roles actuales: ${r.rows[0].staff_roles.join(', ') || '(ninguno)'}`);
