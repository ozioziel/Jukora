import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ENV, type Env } from '../config/env';

type Handler = (data: Record<string, unknown>) => Promise<void>;

/**
 * Cola de trabajos sobre el mismo Postgres (pg-boss): sin Redis, menos RAM.
 * Los trabajos sobreviven a reinicios de la API y se reintentan con límite.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  private boss: PgBoss | null = null;
  private starting: Promise<PgBoss> | null = null;
  private readonly handlers = new Map<string, Handler>();
  /** En pruebas se ejecuta en línea para no depender del sondeo de la cola. */
  inline = false;

  constructor(@Inject(ENV) private readonly env: Env) {}

  register(queue: string, handler: Handler): void {
    this.handlers.set(queue, handler);
  }

  private async ensure(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.starting ??= (async () => {
      const boss = new PgBoss({ connectionString: this.env.DATABASE_URL, schema: 'pgboss' });
      boss.on('error', (e: Error) => this.logger.error(`pg-boss: ${e.message}`));
      await boss.start();
      for (const [queue, handler] of this.handlers) {
        await boss.createQueue(queue, { retryLimit: 2, retryDelay: 5, expireInSeconds: 120 });
        await boss.work<Record<string, unknown>>(queue, { pollingIntervalSeconds: 1 }, async (jobs) => {
          for (const job of jobs) await handler(job.data);
        });
      }
      this.boss = boss;
      return boss;
    })();
    return this.starting;
  }

  /** Se ejecuta después de todos los onModuleInit: los trabajos ya están registrados. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.inline) await this.ensure();
  }

  async enqueue(queue: string, data: Record<string, unknown>, singletonKey?: string): Promise<void> {
    if (this.inline) {
      const h = this.handlers.get(queue);
      if (h) await h(data);
      return;
    }
    const boss = await this.ensure();
    await boss.send(queue, data, singletonKey ? { singletonKey } : {});
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 5000 }).catch(() => undefined);
  }
}
