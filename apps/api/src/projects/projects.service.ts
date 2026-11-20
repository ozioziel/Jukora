import { Inject, Injectable } from '@nestjs/common';
import { type ProjectIntent, type ProjectSector, type ResourcePriority } from '@jucumari/shared';
import { sql } from 'kysely';
import { badRequest, notFound } from '../common/errors';
import { type Database, KYSELY } from '../database/database.module';

export interface ProjectInput {
  name: string;
  sector: ProjectSector;
  intent: ProjectIntent;
  country?: string;
  city?: string;
  objective?: string;
  budgetMax?: string;
  budgetCurrency?: string;
}

export interface ResourceInput {
  label: string;
  category?: string;
  quantity?: number | null;
  unit?: string;
  priority?: ResourcePriority;
  requiredSpecs?: string[];
}

const ACCEPTED = ['accepted', 'completed'];
const ORDERED = ['funded', 'preparing'];
const IN_TRANSIT = ['shipped', 'delivery_notified', 'in_review'];

function slugify(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'recurso'
  );
}

@Injectable()
export class ProjectsService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async list(ownerId: string, includeArchived = false) {
    let q = this.db.selectFrom('projects').selectAll().where('owner_id', '=', ownerId);
    if (!includeArchived) q = q.where('status', '<>', 'archived');
    const projects = await q.orderBy('updated_at', 'desc').execute();
    const progress = await this.progressFor(projects.map((p) => p.id));
    return projects.map((p) => ({ ...this.view(p), progress: progress.get(p.id) ?? { accepted: 0, required: 0, unknownQuantities: 0 } }));
  }

  async create(ownerId: string, input: ProjectInput) {
    const row = await this.db
      .insertInto('projects')
      .values({
        owner_id: ownerId,
        name: input.name,
        sector: input.sector,
        intent: input.intent,
        country: input.country ?? null,
        city: input.city ?? null,
        objective: input.objective ?? '',
        budget_max: input.budgetMax ?? null,
        budget_currency: input.budgetCurrency ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.view(row);
  }

  /** Comprueba propiedad: los negocios son privados por defecto. */
  async owned(ownerId: string, projectId: string) {
    const row = await this.db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', projectId)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    if (!row) throw notFound('project');
    return row;
  }

  async detail(ownerId: string, projectId: string) {
    const p = await this.owned(ownerId, projectId);
    const resources = await this.resources(projectId);
    const counts = await this.db
      .selectFrom('orders')
      .select(['status', sql<number>`count(*)::int`.as('n')])
      .where('project_id', '=', projectId)
      .groupBy('status')
      .execute();
    const rfqs = await this.db
      .selectFrom('rfqs')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('project_id', '=', projectId)
      .executeTakeFirst();
    const quotes = await this.db
      .selectFrom('quotes as q')
      .innerJoin('rfqs as r', 'r.id', 'q.rfq_id')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('r.project_id', '=', projectId)
      .where('q.status', '=', 'sent')
      .executeTakeFirst();
    const lastRun = await this.db
      .selectFrom('search_runs')
      .select(['id', 'status', 'created_at'])
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    return {
      ...this.view(p),
      resources,
      summary: {
        rfqs: rfqs?.n ?? 0,
        openQuotes: quotes?.n ?? 0,
        orders: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      },
      lastSearchRun: lastRun ? { id: lastRun.id, status: lastRun.status, createdAt: lastRun.created_at } : null,
    };
  }

  async update(ownerId: string, projectId: string, input: Partial<ProjectInput> & { archived?: boolean }) {
    await this.owned(ownerId, projectId);
    const row = await this.db
      .updateTable('projects')
      .set({
        ...(input.name ? { name: input.name } : {}),
        ...(input.sector ? { sector: input.sector } : {}),
        ...(input.intent ? { intent: input.intent } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.objective !== undefined ? { objective: input.objective } : {}),
        // Archivar no borra pedidos ni acuerdos financieros.
        ...(input.archived === true ? { status: 'archived', archived_at: new Date() } : {}),
        ...(input.archived === false ? { status: 'active', archived_at: null } : {}),
      })
      .where('id', '=', projectId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.view(row);
  }

  async resources(projectId: string) {
    const rows = await this.db
      .selectFrom('resource_requirements as r')
      .leftJoin('orders as o', 'o.requirement_id', 'r.id')
      .select([
        'r.id',
        'r.slug',
        'r.label',
        'r.category',
        'r.quantity',
        'r.unit',
        'r.reason',
        'r.priority',
        'r.required_specs',
        'r.search_terms',
        'r.search_run_id',
        sql<number>`coalesce(sum(o.quantity) filter (where o.status in (${sql.join(ACCEPTED)})), 0)::int`.as('accepted'),
        sql<number>`coalesce(sum(o.quantity) filter (where o.status in (${sql.join(ORDERED)})), 0)::int`.as('ordered'),
        sql<number>`coalesce(sum(o.quantity) filter (where o.status in (${sql.join(IN_TRANSIT)})), 0)::int`.as('in_transit'),
      ])
      .where('r.project_id', '=', projectId)
      .where('r.removed_at', 'is', null)
      .groupBy('r.id')
      .orderBy('r.created_at')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      label: r.label,
      category: r.category,
      quantity: r.quantity,
      unit: r.unit,
      reason: r.reason,
      priority: r.priority,
      requiredSpecs: r.required_specs,
      searchTerms: r.search_terms,
      searchRunId: r.search_run_id,
      progress: { accepted: r.accepted, ordered: r.ordered, inTransit: r.in_transit, required: r.quantity },
    }));
  }

  async addResource(ownerId: string, projectId: string, input: ResourceInput) {
    await this.owned(ownerId, projectId);
    const base = slugify(input.label);
    const existing = await this.db
      .selectFrom('resource_requirements')
      .select('slug')
      .where('project_id', '=', projectId)
      .where('slug', 'like', `${base}%`)
      .execute();
    const slug = existing.length ? `${base}-${existing.length + 1}` : base;
    const row = await this.db
      .insertInto('resource_requirements')
      .values({
        project_id: projectId,
        slug,
        label: input.label,
        category: input.category ?? input.label,
        quantity: input.quantity ?? null,
        unit: input.unit ?? 'unidad',
        priority: input.priority ?? 'medium',
        required_specs: JSON.stringify(input.requiredSpecs ?? []),
        search_terms: JSON.stringify([input.label]),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    return { id: row.id, slug };
  }

  async updateResource(ownerId: string, projectId: string, resourceId: string, input: Partial<ResourceInput>) {
    await this.owned(ownerId, projectId);
    if (input.quantity !== undefined && input.quantity !== null && input.quantity < 1) throw badRequest('quantity_invalid');
    const r = await this.db
      .updateTable('resource_requirements')
      .set({
        ...(input.label ? { label: input.label } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.unit ? { unit: input.unit } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
      })
      .where('id', '=', resourceId)
      .where('project_id', '=', projectId)
      .returning(['id'])
      .executeTakeFirst();
    if (!r) throw notFound('resource');
    return { ok: true };
  }

  /** Quitar un requisito no cancela pedidos existentes: solo lo oculta del plan. */
  async removeResource(ownerId: string, projectId: string, resourceId: string) {
    await this.owned(ownerId, projectId);
    await this.db
      .updateTable('resource_requirements')
      .set({ removed_at: new Date() })
      .where('id', '=', resourceId)
      .where('project_id', '=', projectId)
      .execute();
    return { ok: true };
  }

  /** Progreso de la casa: unidades aceptadas sobre unidades requeridas conocidas. */
  private async progressFor(projectIds: string[]) {
    const map = new Map<string, { accepted: number; required: number; unknownQuantities: number }>();
    if (!projectIds.length) return map;
    // Subconsulta agregada para no duplicar cantidades cuando un requisito tiene varios pedidos.
    const { rows } = await sql<{ project_id: string; required: number; unknown: number; accepted: number }>`
      select r.project_id,
             coalesce(sum(r.quantity), 0)::int as required,
             (count(*) filter (where r.quantity is null))::int as unknown,
             coalesce(sum(least(coalesce(a.accepted, 0), coalesce(r.quantity, 0))), 0)::int as accepted
        from resource_requirements r
        left join (
          select requirement_id, sum(quantity) as accepted
            from orders
           where status in (${sql.join(ACCEPTED)})
           group by requirement_id
        ) a on a.requirement_id = r.id
       where r.project_id in (${sql.join(projectIds)})
         and r.removed_at is null
       group by r.project_id`.execute(this.db);
    for (const r of rows) map.set(r.project_id, { accepted: r.accepted, required: r.required, unknownQuantities: r.unknown });
    return map;
  }

  private view(p: {
    id: string;
    name: string;
    sector: string;
    intent: string;
    country: string | null;
    city: string | null;
    objective: string;
    budget_max: string | null;
    budget_currency: string | null;
    status: string;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: p.id,
      name: p.name,
      sector: p.sector,
      intent: p.intent,
      country: p.country,
      city: p.city,
      objective: p.objective,
      budget: p.budget_max ? { max: p.budget_max, currency: p.budget_currency } : null,
      status: p.status,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }
}
