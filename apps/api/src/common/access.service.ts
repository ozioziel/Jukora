import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { type Database, KYSELY } from '../database/database.module';
import { forbidden, notFound } from './errors';

export type OrderRole = 'buyer' | 'supplier' | 'arbiter';

/** Autorización por entidad. La interfaz nunca es la autoridad: todo se comprueba aquí. */
@Injectable()
export class AccessService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async orgIdsOf(userId: string): Promise<string[]> {
    const rows = await this.db.selectFrom('memberships').select('org_id').where('user_id', '=', userId).execute();
    return rows.map((r) => r.org_id);
  }

  async requireOrg(userId: string): Promise<string> {
    const [org] = await this.orgIdsOf(userId);
    if (!org) throw forbidden('supplier_org_required');
    return org;
  }

  async assertMember(userId: string, orgId: string): Promise<void> {
    const m = await this.db
      .selectFrom('memberships')
      .select('org_id')
      .where('user_id', '=', userId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!m) throw forbidden('not_org_member');
  }

  /** Rol del usuario en un pedido: comprador, proveedor (miembro) o árbitro asignado a su disputa. */
  async orderRole(
    user: AuthUser,
    orderId: string,
  ): Promise<{ role: OrderRole; order: NonNullable<Awaited<ReturnType<AccessService['loadOrder']>>> }> {
    const order = await this.loadOrder(orderId);
    if (!order) throw notFound('order');
    if (order.buyer_id === user.id) return { role: 'buyer', order };
    const orgs = await this.orgIdsOf(user.id);
    if (orgs.includes(order.org_id)) return { role: 'supplier', order };
    if (user.staffRoles.includes('arbiter')) {
      const d = await this.db.selectFrom('disputes').select(['arbiter_id']).where('order_id', '=', orderId).executeTakeFirst();
      if (d && (d.arbiter_id === user.id || d.arbiter_id === null)) return { role: 'arbiter', order };
    }
    throw notFound('order'); // no revelar existencia
  }

  loadOrder(orderId: string) {
    return this.db.selectFrom('orders').selectAll().where('id', '=', orderId).executeTakeFirst();
  }
}
