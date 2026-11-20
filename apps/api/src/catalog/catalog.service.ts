import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';

export interface ListingQuery {
  q?: string;
  category?: string;
  country?: string;
  condition?: 'new' | 'used';
  verifiedOnly?: boolean;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'lead_time';
  page?: number;
}

export interface ListingInput {
  title: string;
  description?: string;
  category: string;
  specs?: Record<string, string>;
  unit?: string;
  price?: string | null;
  currency?: string;
  quoteOnly?: boolean;
  stock?: number | null;
  minQty?: number;
  condition?: 'new' | 'used';
  originCountry: string;
  originCity?: string;
  shipsTo?: string[];
  leadTimeDays?: number | null;
  warranty?: string;
  paymentTerms?: string;
}

const PAGE = 24;

/** Explorar: marketplace clásico. Buscar aquí no consume la cuota de búsquedas inteligentes. */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly access: AccessService,
  ) {}

  private base() {
    return this.db
      .selectFrom('listings as l')
      .innerJoin('organizations as o', 'o.id', 'l.org_id')
      .leftJoin(
        (eb) =>
          eb
            .selectFrom('reviews')
            .select(['org_id', sql<string>`round(avg(supplier_rating)::numeric, 2)`.as('avg'), sql<number>`count(*)::int`.as('n')])
            .groupBy('org_id')
            .as('rv'),
        (join) => join.onRef('rv.org_id', '=', 'o.id'),
      )
      .select([
        'l.id',
        'l.title',
        'l.description',
        'l.category',
        'l.specs',
        'l.unit',
        'l.price',
        'l.currency',
        'l.quote_only',
        'l.stock',
        'l.min_qty',
        'l.condition',
        'l.origin_country',
        'l.origin_city',
        'l.ships_to',
        'l.lead_time_days',
        'l.warranty',
        'l.payment_terms',
        'l.photos',
        'l.status',
        'l.is_demo',
        'l.updated_at',
        'o.id as org_id',
        'o.name as org_name',
        'o.trust as org_trust',
        'o.country as org_country',
        'rv.avg as rating_avg',
        'rv.n as rating_count',
      ]);
  }

  async search(query: ListingQuery) {
    let q = this.base().where('l.status', '=', 'published').where('o.trust', '<>', 'kyb_rejected');
    const text = query.q?.trim();
    if (text)
      q = q.where((eb) =>
        eb.or([eb(sql`l.search_doc`, '@@', sql`websearch_to_tsquery('simple', ${text})`), eb('l.title', 'ilike', `%${text}%`)]),
      );
    if (query.category) q = q.where('l.category', 'ilike', query.category);
    if (query.country)
      q = q.where((eb) => eb.or([eb('l.origin_country', '=', query.country!), eb(sql`${query.country}`, '=', eb.fn.any('l.ships_to'))]));
    if (query.condition) q = q.where('l.condition', '=', query.condition);
    if (query.verifiedOnly) q = q.where('o.trust', '=', 'kyb_verified');
    switch (query.sort) {
      case 'price_asc':
        q = q.orderBy(sql`l.price asc nulls last`);
        break;
      case 'price_desc':
        q = q.orderBy(sql`l.price desc nulls last`);
        break;
      case 'lead_time':
        q = q.orderBy(sql`l.lead_time_days asc nulls last`);
        break;
      default:
        q = text ? q.orderBy(sql`ts_rank(l.search_doc, websearch_to_tsquery('simple', ${text})) desc`) : q.orderBy('l.updated_at', 'desc');
    }
    const page = Math.max(1, query.page ?? 1);
    const rows = await q
      .limit(PAGE + 1)
      .offset((page - 1) * PAGE)
      .execute();
    const categories = await this.db
      .selectFrom('listings')
      .select(['category', sql<number>`count(*)::int`.as('n')])
      .where('status', '=', 'published')
      .groupBy('category')
      .orderBy('n', 'desc')
      .limit(30)
      .execute();
    return { items: rows.slice(0, PAGE).map((r) => this.view(r)), page, hasMore: rows.length > PAGE, categories };
  }

  async detail(id: string) {
    const r = await this.base().where('l.id', '=', id).where('l.status', '=', 'published').executeTakeFirst();
    if (!r) throw notFound('listing');
    return this.view(r);
  }

  async supplier(orgId: string) {
    const o = await this.db.selectFrom('organizations').selectAll().where('id', '=', orgId).executeTakeFirst();
    if (!o) throw notFound('supplier');
    const listings = await this.base().where('l.org_id', '=', orgId).where('l.status', '=', 'published').limit(50).execute();
    const reviews = await this.db
      .selectFrom('reviews')
      .select(['supplier_rating', 'product_rating', 'comment', 'is_demo', 'created_at'])
      .where('org_id', '=', orgId)
      .orderBy('created_at', 'desc')
      .limit(20)
      .execute();
    const avg = reviews.length ? reviews.reduce((a, r) => a + r.supplier_rating, 0) / reviews.length : null;
    return {
      id: o.id,
      name: o.name,
      description: o.description,
      country: o.country,
      city: o.city,
      trust: o.trust,
      kybVerifiedAt: o.kyb_verified_at,
      isDemo: o.is_demo,
      rating: avg === null ? null : { average: Math.round(avg * 100) / 100, count: reviews.length },
      reviews,
      listings: listings.map((l) => this.view(l)),
    };
  }

  // ───────────── Proveedor ─────────────
  async myOrg(user: AuthUser) {
    const ids = await this.access.orgIdsOf(user.id);
    if (!ids.length) return null;
    const o = await this.db.selectFrom('organizations').selectAll().where('id', '=', ids[0]!).executeTakeFirstOrThrow();
    return {
      id: o.id,
      name: o.name,
      description: o.description,
      country: o.country,
      city: o.city,
      trust: o.trust,
      payoutAddress: o.payout_address,
      isDemo: o.is_demo,
    };
  }

  async createOrg(user: AuthUser, input: { name: string; description?: string; country: string; city?: string; payoutAddress?: string }) {
    if ((await this.access.orgIdsOf(user.id)).length) throw conflict('org_exists');
    const org = await this.db.transaction().execute(async (trx) => {
      const o = await trx
        .insertInto('organizations')
        .values({
          owner_id: user.id,
          name: input.name,
          description: input.description ?? '',
          country: input.country,
          city: input.city ?? '',
          payout_address: input.payoutAddress ?? user.address,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await trx.insertInto('memberships').values({ org_id: o.id, user_id: user.id, role: 'owner' }).execute();
      await trx
        .updateTable('app_users')
        .set({ modes: sql`array(select distinct unnest(modes || array['supplier']))`, active_mode: 'supplier' })
        .where('id', '=', user.id)
        .execute();
      return o;
    });
    return { id: org.id };
  }

  /** Solo DEMO en testnet: unirse a un proveedor ficticio para mostrar el flujo del lado vendedor. */
  async joinDemoOrg(user: AuthUser, orgId: string) {
    if (!this.env.DEMO_MODE || this.env.STELLAR_NETWORK !== 'testnet') throw forbidden('demo_only');
    const org = await this.db.selectFrom('organizations').select(['id', 'is_demo']).where('id', '=', orgId).executeTakeFirst();
    if (!org?.is_demo) throw notFound('supplier');
    await this.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: user.id, role: 'member' })
      .onConflict((oc) => oc.doNothing())
      .execute();
    // En la demo, el miembro cobra con su propia wallet de prueba (necesaria para firmar como proveedor).
    await this.db.updateTable('organizations').set({ payout_address: user.address }).where('id', '=', orgId).execute();
    await this.db
      .updateTable('app_users')
      .set({ modes: sql`array(select distinct unnest(modes || array['supplier']))`, active_mode: 'supplier' })
      .where('id', '=', user.id)
      .execute();
    return { ok: true };
  }

  async myListings(user: AuthUser) {
    const orgId = await this.access.requireOrg(user.id);
    const rows = await this.base().where('l.org_id', '=', orgId).orderBy('l.updated_at', 'desc').execute();
    return rows.map((r) => this.view(r));
  }

  async saveListing(user: AuthUser, input: ListingInput, id?: string) {
    const orgId = await this.access.requireOrg(user.id);
    if (!input.quoteOnly && !input.price) throw badRequest('price_or_quote_required');
    const values = {
      title: input.title,
      description: input.description ?? '',
      category: input.category.toLowerCase(),
      specs: JSON.stringify(input.specs ?? {}),
      unit: input.unit ?? 'unidad',
      price: input.quoteOnly ? null : (input.price ?? null),
      currency: input.currency ?? 'USD',
      quote_only: input.quoteOnly ?? false,
      stock: input.stock ?? null,
      min_qty: input.minQty ?? 1,
      condition: input.condition ?? 'new',
      origin_country: input.originCountry,
      origin_city: input.originCity ?? '',
      ships_to: input.shipsTo ?? [input.originCountry],
      lead_time_days: input.leadTimeDays ?? null,
      warranty: input.warranty ?? '',
      payment_terms: input.paymentTerms ?? '',
    };
    if (id) {
      const r = await this.db
        .updateTable('listings')
        .set(values)
        .where('id', '=', id)
        .where('org_id', '=', orgId)
        .returning(['id'])
        .executeTakeFirst();
      if (!r) throw notFound('listing');
      return { id: r.id };
    }
    const r = await this.db
      .insertInto('listings')
      .values({ ...values, org_id: orgId, status: 'draft' })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    return { id: r.id };
  }

  async setListingStatus(user: AuthUser, id: string, status: 'published' | 'archived' | 'draft') {
    const orgId = await this.access.requireOrg(user.id);
    const r = await this.db
      .updateTable('listings')
      .set({ status })
      .where('id', '=', id)
      .where('org_id', '=', orgId)
      .returning(['id'])
      .executeTakeFirst();
    if (!r) throw notFound('listing');
    return { id, status };
  }

  view(r: Awaited<ReturnType<ReturnType<CatalogService['base']>['executeTakeFirstOrThrow']>>) {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      specs: r.specs,
      unit: r.unit,
      price: r.price ? { amount: r.price, currency: r.currency } : null,
      quoteOnly: r.quote_only,
      stock: r.stock,
      minQty: r.min_qty,
      condition: r.condition,
      origin: { country: r.origin_country, city: r.origin_city || null },
      shipsTo: r.ships_to,
      leadTimeDays: r.lead_time_days,
      warranty: r.warranty,
      paymentTerms: r.payment_terms,
      photos: r.photos,
      status: r.status,
      isDemo: r.is_demo,
      updatedAt: r.updated_at,
      supplier: {
        id: r.org_id,
        name: r.org_name,
        trust: r.org_trust,
        country: r.org_country,
        rating: r.rating_count ? { average: Number(r.rating_avg), count: r.rating_count } : null,
      },
    };
  }
}
