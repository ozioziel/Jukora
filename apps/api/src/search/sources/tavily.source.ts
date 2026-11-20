import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Candidate, ResourcePlan, SearchRequest } from '@jucumari/shared';
import { ENV, type Env } from '../../config/env';
import type { RankInputExtra } from './types';

type Resource = ResourcePlan['resources'][number];

const EXCLUDED_HOSTS = /(^|\.)(wikipedia\.org|youtube\.com|youtu\.be|tiktok\.com|pinterest\.[a-z]+)$/i;

/**
 * Búsqueda web con Tavily (1 crédito por búsqueda básica). El contenido externo es DATO: nunca se
 * reenvía al modelo de IA ni se interpreta como instrucción. Precio y plazo quedan en null porque
 * no están respaldados por una fuente estructurada.
 */
@Injectable()
export class TavilySource {
  private readonly logger = new Logger('Tavily');
  constructor(@Inject(ENV) private readonly env: Env) {}

  enabled(): boolean {
    return this.env.SEARCH_PROVIDER === 'tavily' && Boolean(this.env.TAVILY_API_KEY);
  }

  buildQuery(resource: Resource, req: SearchRequest): string {
    const where = req.originScope === 'international' ? '' : ` ${req.destination.city ?? ''} ${req.destination.country}`;
    const condition = req.condition.length === 1 && req.condition[0] === 'used' ? ' usado' : '';
    return `${resource.searchTerms[0] ?? resource.label}${condition} comprar proveedor${where}`.replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  async search(resource: Resource, req: SearchRequest): Promise<(Candidate & RankInputExtra)[]> {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query: this.buildQuery(resource, req), search_depth: 'basic', max_results: 6, include_answer: false }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      this.logger.warn(`Tavily HTTP ${res.status}`);
      throw new Error(`tavily_http_${res.status}`);
    }
    const data = (await res.json()) as { results?: { title?: string; url?: string }[] };
    const seen = new Set<string>();
    const out: (Candidate & RankInputExtra)[] = [];
    for (const r of data.results ?? []) {
      let url: URL;
      try {
        url = new URL(r.url ?? '');
      } catch {
        continue;
      }
      if (!/^https?:$/.test(url.protocol) || EXCLUDED_HOSTS.test(url.hostname)) continue;
      const key = `${url.hostname}${url.pathname}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `web:${createHash('sha256').update(key).digest('hex').slice(0, 16)}`,
        resourceId: resource.id,
        title: (r.title ?? url.hostname).slice(0, 140),
        origin: 'external',
        supplierName: url.hostname.replace(/^www\./, ''),
        supplierTrust: 'found_online',
        listingId: null,
        sourceUrl: url.toString(),
        sourceName: 'Tavily',
        retrievedAt: new Date().toISOString(),
        price: null,
        locationCountry: null,
        locationCity: null,
        leadTimeDays: null,
        condition: null,
        rating: null,
        reasons: [],
        score: 0,
        action: 'view_source',
        _servesDestination: null,
        _failsMandatory: false,
        _specs: null,
      });
    }
    return out;
  }
}
