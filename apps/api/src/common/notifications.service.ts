import { Inject, Injectable } from '@nestjs/common';
import type { NotificationKind } from '@jucumari/shared';
import { type Database, KYSELY } from '../database/database.module';

/** Crea avisos en la app. Leer un aviso nunca confirma entregas ni mueve dinero. */
@Injectable()
export class NotificationsService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async notify(input: {
    userId: string;
    kind: NotificationKind;
    entityType: 'order' | 'quote' | 'rfq' | 'dispute' | 'verification' | 'project';
    entityId: string;
    requiresAction?: boolean;
    data?: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    await this.db
      .insertInto('notifications')
      .values({
        user_id: input.userId,
        kind: input.kind,
        entity_type: input.entityType,
        entity_id: input.entityId,
        requires_action: input.requiresAction ?? false,
        data: input.data ?? {},
      })
      .execute();
  }

  /** Marca como resueltos los avisos de acción de una entidad (p. ej. al aceptar la entrega). */
  async resolveFor(userId: string, entityId: string, kinds: NotificationKind[]): Promise<void> {
    await this.db
      .updateTable('notifications')
      .set({ resolved_at: new Date() })
      .where('user_id', '=', userId)
      .where('entity_id', '=', entityId)
      .where('kind', 'in', kinds)
      .where('resolved_at', 'is', null)
      .execute();
  }

  async audit(
    actorId: string | null,
    entityType: string,
    entityId: string,
    action: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db
      .insertInto('audit_events')
      .values({ actor_id: actorId, entity_type: entityType, entity_id: entityId, action, data: JSON.stringify(data) })
      .execute();
  }
}
