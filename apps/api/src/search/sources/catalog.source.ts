import { Inject, Injectable } from '@nestjs/common';
import type { Candidate, ResourcePlan, SearchRequest, SupplierTrust } from '@jucumari/shared';
import { sql } from 'kysely';
import { type Database, KYSELY } from '../../database/database.module';
import type { RankInputExtra } from './types';

type Resource = ResourcePlan['resources'][number];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Catálogo propio (proveedores registrados). Gratis: no consume créditos externos. */
@Injectable()
export class CatalogSource {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async find(resource: Resource, req: SearchRequest, limit = 20): Promise<(Candidate & RankInputExtra)[]> {
    const words = [...resource.searchTerms, resource.category, resource.label]
      .map((t) => t.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim())
      .filter((t) => t.length > 1);
    const tsQuery = [...new Set(words)].join(' or ');
    const country = req.destination.country;

    let q = this.db
      .selectFrom('listings as l')
      .innerJoin('organizations as o', 'o.id', 'l.org_id')
      .leftJoin(
        (eb) =>
          eb
            .selectFrom('reviews')
            .select(['org_id', sql<string>`avg(supplier_rating)::numeric(3,2)`.as('avg'), sql<number>`count(*)::int`.as('n')])
            .groupBy('org_id')
            .as('rv'),
        (join) => join.onRef('rv.org_id', '=', 'o.id'),
      )
      .select([
        'l.id',
        'l.title',
        'l.category',
        'l.price',
        'l.currency',
        'l.quote_only',
        'l.stock',
        'l.condition',
        'l.origin_country',
        'l.origin_city',
        'l.ships_to',
        'l.lead_time_days',
        'l.specs',
        'l.is_demo',
        'o.name as org_name',
        'o.trust',
        'rv.avg',
        'rv.n',
      ])
      .where('l.status', '=', 'published')
      .where('o.trust', '<>', 'kyb_rejected')
      .where((eb) =>
        eb.or([eb(sql`l.search_doc`, '@@', sql`websearch_to_tsquery('simple', ${tsQuery})`), eb('l.category', 'ilike', resource.category)]),
      )
      .where('l.condition', 'in', req.condition);

    if (req.originScope === 'local' || req.originScope === 'national') q = q.where('l.origin_country', '=', country);
    if (req.originScope === 'international') q = q.where('l.origin_country', '<>', country);
    if (req.originScope === 'local' && req.destination.city) q = q.where('l.origin_city', 'ilike', req.destination.city);
    if (req.includeCountries.length) q = q.where('l.origin_country', 'in', req.includeCountries);
    if (req.excludeCountries.length) q = q.where('l.origin_country', 'not in', req.excludeCountries);

    const rows = await q.limit(limit).execute();
    const mandatory = req.technicalRequirements.filter((t) => t.mandatory);

    return rows.map((l) => {
      const specs = (l.specs ?? {}) as Record<string, string>;
      const specKeys = Object.fromEntries(Object.entries(specs).map(([k, v]) => [norm(k), norm(String(v))]));
      const failsMandatory = mandatory.some((m) => {
        const v = specKeys[norm(m.key)];
        return v !== undefined && !v.includes(norm(m.value));
      });
      const serves = l.origin_country === country || l.ships_to.includes(country);
      const purchasable = !l.quote_only && l.price !== null && (l.stock === null || l.stock > 0);
      const trust = l.trust as SupplierTrust;
      return {
        id: `listing:${l.id}`,
        resourceId: resource.id,
        title: l.title,
        origin: l.is_demo ? 'demo' : 'registered',
        supplierName: l.org_name,
        supplierTrust: trust,
        listingId: l.id,
        sourceUrl: null,
        sourceName: null,
        retrievedAt: new Date().toISOString(),
        price: l.price ? { amount: l.price, currency: l.currency } : null,
        locationCountry: l.origin_country,
        locationCity: l.origin_city || null,
        leadTimeDays: l.lead_time_days,
        condition: l.condition as 'new' | 'used',
        rating: l.n ? { average: Number(l.avg), count: l.n } : null,
        reasons: [],
        score: 0,
        action: purchasable ? 'request_order' : 'request_quote',
        _servesDestination: serves,
        _failsMandatory: failsMandatory,
        _specs: null,
      } satisfies Candidate & RankInputExtra;
    });
  }
}
