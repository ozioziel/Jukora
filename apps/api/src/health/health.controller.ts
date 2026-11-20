import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { sql } from 'kysely';
import { Public } from '../auth/decorators';
import { AppError } from '../common/errors';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Listo para tráfico: base de datos accesible. No expone versiones ni secretos. */
  @Public()
  @Get('ready')
  async ready() {
    try {
      await sql`select 1`.execute(this.db);
    } catch {
      throw new AppError('database_unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: 'ok',
      network: this.env.STELLAR_NETWORK,
      demoMode: this.env.DEMO_MODE,
      integrations: {
        ai: this.env.AI_PROVIDER,
        search: this.env.SEARCH_PROVIDER,
        trustlessWork: Boolean(this.env.TW_API_KEY),
        pollar: Boolean(this.env.POLLAR_SECRET_KEY),
        didit: Boolean(this.env.DIDIT_API_KEY),
        demoToken: Boolean(this.env.DEMO_TOKEN_ISSUER),
      },
    };
  }
}
