import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import { ENV, type Env } from '../config/env';
import type { DB } from './database.types';

export const KYSELY = Symbol('KYSELY');
export type Database = Kysely<DB>;

// numeric e int8 se mantienen como texto: nunca convertir dinero a coma flotante.
// Se quitan ceros finales sin redondear ('7.5000000' → '7.5').
types.setTypeParser(types.builtins.NUMERIC, (v) => (v.includes('.') ? v.replace(/\.?0+$/, '') : v));
types.setTypeParser(types.builtins.INT8, (v) => v);

export function createDatabase(databaseUrl: string): Database {
  const pool = new Pool({ connectionString: databaseUrl, max: 8, idleTimeoutMillis: 30_000 });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

@Global()
@Module({
  providers: [{ provide: KYSELY, inject: [ENV], useFactory: (env: Env) => createDatabase(env.DATABASE_URL) }],
  exports: [KYSELY],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
