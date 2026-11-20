import { Controller, Get, HttpCode, Inject, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { sql } from 'kysely';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { type Database, KYSELY } from '../database/database.module';

/** Avisos: «Requieren tu atención» vs «Actualizaciones». Leer no es resolver ni mueve dinero. */
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const rows = await this.db
      .selectFrom('notifications')
      .select(['id', 'kind', 'entity_type', 'entity_id', 'data', 'requires_action', 'read_at', 'resolved_at', 'created_at'])
      .where('user_id', '=', u.id)
      .orderBy('created_at', 'desc')
      .limit(80)
      .execute();
    const items = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      entity: { type: r.entity_type, id: r.entity_id },
      data: r.data,
      requiresAction: r.requires_action && !r.resolved_at,
      read: Boolean(r.read_at),
      resolved: Boolean(r.resolved_at),
      createdAt: r.created_at,
    }));
    return {
      attention: items.filter((i) => i.requiresAction),
      updates: items.filter((i) => !i.requiresAction),
      pendingCount: items.filter((i) => i.requiresAction).length,
      unreadCount: items.filter((i) => !i.read).length,
    };
  }

  @Get('count')
  async count(@CurrentUser() u: AuthUser) {
    const r = await this.db
      .selectFrom('notifications')
      .select([
        sql<number>`(count(*) filter (where requires_action and resolved_at is null))::int`.as('pending'),
        sql<number>`(count(*) filter (where read_at is null))::int`.as('unread'),
      ])
      .where('user_id', '=', u.id)
      .executeTakeFirst();
    return { pending: r?.pending ?? 0, unread: r?.unread ?? 0 };
  }

  @Patch(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.db
      .updateTable('notifications')
      .set({ read_at: new Date() })
      .where('id', '=', id)
      .where('user_id', '=', u.id)
      .where('read_at', 'is', null)
      .execute();
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() u: AuthUser) {
    await this.db
      .updateTable('notifications')
      .set({ read_at: new Date() })
      .where('user_id', '=', u.id)
      .where('read_at', 'is', null)
      .execute();
  }
}

@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
