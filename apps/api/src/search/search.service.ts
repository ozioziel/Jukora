import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Candidate, rankCandidates, type ResourcePlan, type SearchEventType, SearchRequestSchema } from '@jucumari/shared';
import { sql } from 'kysely';
import type { AuthUser } from '../auth/auth.types';
import { badRequest, conflict, notFound } from '../common/errors';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';
import { JobsService } from '../jobs/jobs.service';
import { ProjectsService } from '../projects/projects.service';
import { AiService } from './ai/ai.service';
import { PlannerError } from './ai/planner';
import { QuotaService } from './quota.service';
import { CatalogSource } from './sources/catalog.source';
import { TavilySource } from './sources/tavily.source';
import type { RankInputExtra } from './sources/types';

const QUEUE = 'search-plan';
const ACTIVE = ['accepted', 'planning'];
const TERMINAL = ['done', 'partial', 'empty', 'error', 'cancelled'];

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger('Search');
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly quota: QuotaService,
    private readonly ai: AiService,
    private readonly catalog: CatalogSource,
    private readonly tavily: TavilySource,
    private readonly jobs: JobsService,
    private readonly projects: ProjectsService,
  ) {}

  onModuleInit() {
    this.jobs.register(QUEUE, (data) => this.process(String(data.runId)));
  }

  // ───────────── Borradores (sin IA, sin cuota) ─────────────
  async saveDraft(userId: string, payload: unknown, draftId?: string, projectId?: string) {
    if (JSON.stringify(payload ?? {}).length > 20_000) throw badRequest('draft_too_large');
    if (projectId) await this.projects.owned(userId, projectId);
    if (draftId) {
      const r = await this.db
        .updateTable('search_drafts')
        .set({ payload: JSON.stringify(payload ?? {}), updated_at: new Date() })
        .where('id', '=', draftId)
        .where('owner_id', '=', userId)
        .returning(['id', 'updated_at'])
        .executeTakeFirst();
      if (!r) throw notFound('draft');
      return { id: r.id, updatedAt: r.updated_at };
    }
    const r = await this.db
      .insertInto('search_drafts')
      .values({ owner_id: userId, project_id: projectId ?? null, payload: JSON.stringify(payload ?? {}) })
      .returning(['id', 'updated_at'])
      .executeTakeFirstOrThrow();
    return { id: r.id, updatedAt: r.updated_at };
  }

  async latestDraft(userId: string, projectId?: string) {
    let q = this.db.selectFrom('search_drafts').select(['id', 'payload', 'project_id', 'updated_at']).where('owner_id', '=', userId);
    q = projectId ? q.where('project_id', '=', projectId) : q.where('project_id', 'is', null);
    const r = await q.orderBy('updated_at', 'desc').limit(1).executeTakeFirst();
    return r ? { id: r.id, payload: r.payload, projectId: r.project_id, updatedAt: r.updated_at } : null;
  }

  // ───────────── Corridas ─────────────
  async start(user: AuthUser, body: unknown, idempotencyKey: string | undefined) {
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) throw badRequest('idempotency_key_required');
    const parsed = SearchRequestSchema.safeParse(body);
    if (!parsed.success)
      throw badRequest('validation_failed', {
        issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    const req = parsed.data;
    if (req.projectId) await this.projects.owned(user.id, req.projectId);

    const existing = await this.db
      .selectFrom('search_runs')
      .select(['id'])
      .where('owner_id', '=', user.id)
      .where('idempotency_key', '=', idempotencyKey)
      .executeTakeFirst();
    if (existing) return this.view(user.id, existing.id);

    // Una corrida activa de hace más de 5 minutos se considera caída: se cierra y se devuelve la cuota.
    const stale = await this.db
      .updateTable('search_runs')
      .set({ status: 'error', error_code: 'stale_run', finished_at: new Date() })
      .where('owner_id', '=', user.id)
      .where('status', 'in', ACTIVE)
      .where('created_at', '<', new Date(Date.now() - 5 * 60_000))
      .returning(['id'])
      .execute();
    for (const s of stale) await this.quota.refundForRun(s.id);
    const active = await this.db
      .selectFrom('search_runs')
      .select('id')
      .where('owner_id', '=', user.id)
      .where('status', 'in', ACTIVE)
      .executeTakeFirst();
    if (active) throw conflict('search_in_progress', { runId: active.id });

    const { ledgerId } = await this.quota.reserve(user.id, user.timeZone, idempotencyKey);
    const ai = this.ai.describe();
    const run = await this.db
      .insertInto('search_runs')
      .values({
        owner_id: user.id,
        project_id: req.projectId ?? null,
        idempotency_key: idempotencyKey,
        request: JSON.stringify(req),
        ai_provider: ai.provider,
        ai_model: ai.model,
        ai_is_demo: ai.isDemo,
        external_credit_budget: this.env.SEARCH_RUN_CREDIT_BUDGET,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await this.quota.attachRun(ledgerId, run.id);
    await this.event(run.id, 'accepted', {});
    try {
      await this.jobs.enqueue(QUEUE, { runId: run.id }, run.id);
    } catch (e) {
      // Sin cola no hay trabajo útil: la corrida termina en error y la cuota se devuelve.
      this.logger.error(`No se pudo encolar ${run.id}: ${e instanceof Error ? e.message : e}`);
      await this.db
        .updateTable('search_runs')
        .set({ status: 'error', error_code: 'queue_unavailable', finished_at: new Date() })
        .where('id', '=', run.id)
        .execute();
      await this.quota.refundForRun(run.id);
      await this.event(run.id, 'error', { code: 'queue_unavailable', quotaRefunded: true });
    }
    return this.view(user.id, run.id);
  }

  /** Trabajo de la cola: plan de recursos + candidatos del catálogo propio. */
  async process(runId: string): Promise<void> {
    const run = await this.db.selectFrom('search_runs').selectAll().where('id', '=', runId).executeTakeFirst();
    if (!run || run.status !== 'accepted') return;
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    try {
      await this.setStatus(runId, 'planning');
      await this.event(runId, 'planning', {});
      const req = SearchRequestSchema.parse(run.request);
      const result = await this.ai.plan(req, controller.signal);
      if (await this.isCancelled(runId)) return;

      await this.db
        .updateTable('search_runs')
        .set({
          plan: JSON.stringify(result.plan),
          status: 'resources_ready',
          ai_provider: result.provider,
          ai_model: result.model,
          ai_is_demo: result.isDemo,
        })
        .where('id', '=', runId)
        .execute();
      await this.quota.consumeForRun(runId);
      if (run.project_id) await this.upsertRequirements(run.project_id, runId, result.plan);
      await this.event(runId, 'resources_ready', {
        resources: result.plan.resources.map((r) => ({ id: r.id, label: r.label, quantity: r.quantity, unit: r.unit })),
      });

      // Catálogo propio para todas las categorías (sin coste). Lo externo se busca al abrir cada categoría.
      let total = 0;
      for (const resource of result.plan.resources) {
        const found = await this.catalog.find(resource, req);
        await this.storeCandidates(runId, resource.id, found);
        total += found.length;
        await this.event(runId, 'candidate_batch', { resourceId: resource.id, count: found.length, source: 'catalog' });
      }
      await this.db.updateTable('search_runs').set({ status: 'done', finished_at: new Date() }).where('id', '=', runId).execute();
      await this.event(runId, 'done', { catalogCandidates: total });
    } catch (e) {
      const code = e instanceof PlannerError ? `ai_${e.code}` : 'internal_error';
      this.logger.warn(`Corrida ${runId} falló: ${code}`);
      if (!(await this.isCancelled(runId))) {
        // Sin plan útil: se devuelve la búsqueda al usuario.
        const ran = await this.db.selectFrom('search_runs').select('plan').where('id', '=', runId).executeTakeFirst();
        if (!ran?.plan) await this.quota.refundForRun(runId);
        await this.db
          .updateTable('search_runs')
          .set({ status: ran?.plan ? 'partial' : 'error', error_code: code, finished_at: new Date() })
          .where('id', '=', runId)
          .execute();
        await this.event(runId, ran?.plan ? 'partial' : 'error', { code, quotaRefunded: !ran?.plan });
      }
    } finally {
      this.controllers.delete(runId);
    }
  }

  async cancel(userId: string, runId: string) {
    const run = await this.owned(userId, runId);
    if (!ACTIVE.includes(run.status)) throw conflict('run_not_cancellable');
    // Antes de llamar a la IA se devuelve la cuota; si ya se llamó, el coste ya ocurrió y se consume.
    const startedPlanning = run.status === 'planning';
    await this.db.updateTable('search_runs').set({ status: 'cancelled', finished_at: new Date() }).where('id', '=', runId).execute();
    this.controllers.get(runId)?.abort();
    if (startedPlanning) await this.quota.consumeForRun(runId);
    else await this.quota.refundForRun(runId);
    await this.event(runId, 'cancelled', { quotaRefunded: !startedPlanning });
    return this.view(userId, runId);
  }

  async view(userId: string, runId: string) {
    const run = await this.owned(userId, runId);
    const counts = await this.db
      .selectFrom('search_candidates')
      .select(['resource_slug', sql<number>`count(*)::int`.as('n')])
      .where('run_id', '=', runId)
      .groupBy('resource_slug')
      .execute();
    const fetched = await this.db
      .selectFrom('search_category_fetches')
      .select(['resource_slug', 'status'])
      .where('run_id', '=', runId)
      .execute();
    const plan = run.plan as ResourcePlan | null;
    return {
      id: run.id,
      status: run.status,
      projectId: run.project_id,
      errorCode: run.error_code,
      ai: { provider: run.ai_provider, model: run.ai_model, isDemo: run.ai_is_demo },
      plan: plan
        ? {
            ...plan,
            resources: plan.resources.map((r) => ({
              ...r,
              candidateCount: counts.find((c) => c.resource_slug === r.id)?.n ?? 0,
              externalStatus: fetched.find((f) => f.resource_slug === r.id)?.status ?? null,
            })),
          }
        : null,
      externalSearch: { enabled: this.tavily.enabled(), creditsUsed: run.external_credits_used, budget: run.external_credit_budget },
      createdAt: run.created_at,
      finishedAt: run.finished_at,
      terminal: TERMINAL.includes(run.status),
    };
  }

  async events(userId: string, runId: string, afterId: number) {
    await this.owned(userId, runId);
    return this.db
      .selectFrom('search_events')
      .select(['id', 'type', 'payload'])
      .where('run_id', '=', runId)
      .where('id', '>', String(afterId))
      .orderBy('id')
      .limit(100)
      .execute();
  }

  /**
   * Abre una categoría. Reutiliza lo ya obtenido sin coste. La búsqueda externa usa el presupuesto
   * de créditos de la corrida original y el tope global diario; si no alcanza, se queda en catálogo.
   */
  async openCategory(userId: string, runId: string, slug: string) {
    const run = await this.owned(userId, runId);
    const plan = run.plan as ResourcePlan | null;
    const resource = plan?.resources.find((r) => r.id === slug);
    if (!resource) throw notFound('resource');
    const req = SearchRequestSchema.parse(run.request);

    const claimed = await this.db
      .insertInto('search_category_fetches')
      .values({ run_id: runId, resource_slug: slug, status: 'fetching' })
      .onConflict((oc) => oc.doNothing())
      .returning(['status'])
      .executeTakeFirst();

    if (claimed) {
      let status: 'done' | 'error' | 'budget_exhausted' = 'done';
      let credits = 0;
      if (this.tavily.enabled()) {
        const runBudgetOk = run.external_credits_used + 1 <= run.external_credit_budget;
        const today = new Date().toISOString().slice(0, 10);
        const { rows } = runBudgetOk
          ? await sql<{
              ok: boolean;
            }>`select public.spend_external_credits(${today}::date, 1, ${this.env.SEARCH_DAILY_CREDIT_CAP}) as ok`.execute(this.db)
          : { rows: [{ ok: false }] };
        if (rows[0]?.ok) {
          credits = 1;
          try {
            const found = await this.tavily.search(resource, req);
            await this.storeCandidates(runId, slug, found);
          } catch {
            status = 'error';
          }
        } else {
          status = 'budget_exhausted';
        }
      }
      await this.db
        .updateTable('search_category_fetches')
        .set({ status, credits_used: credits })
        .where('run_id', '=', runId)
        .where('resource_slug', '=', slug)
        .execute();
      if (credits)
        await this.db
          .updateTable('search_runs')
          .set({ external_credits_used: sql`external_credits_used + ${credits}` })
          .where('id', '=', runId)
          .execute();
    }
    return this.candidates(userId, runId, slug);
  }

  async candidates(userId: string, runId: string, slug: string) {
    const run = await this.owned(userId, runId);
    const req = SearchRequestSchema.parse(run.request);
    const rows = await this.db
      .selectFrom('search_candidates')
      .select(['payload'])
      .where('run_id', '=', runId)
      .where('resource_slug', '=', slug)
      .execute();
    const items = rows.map((r) => r.payload as unknown as Candidate & RankInputExtra);
    const ranked = rankCandidates(
      items.map((c) => ({
        id: c.id,
        price: c.price,
        leadTimeDays: c.leadTimeDays,
        specs: c._specs,
        trust: c.supplierTrust,
        servesDestination: c._servesDestination,
        failsMandatory: c._failsMandatory,
      })),
      req.priorities,
      req.budget.currency,
    );
    const byId = new Map(items.map((c) => [c.id, c]));
    const fetch = await this.db
      .selectFrom('search_category_fetches')
      .select(['status'])
      .where('run_id', '=', runId)
      .where('resource_slug', '=', slug)
      .executeTakeFirst();
    return {
      resourceId: slug,
      externalStatus: fetch?.status ?? null,
      candidates: ranked.map((r) => {
        const { _servesDestination, _failsMandatory, _specs, ...c } = byId.get(r.id)!;
        void _specs;
        return {
          ...c,
          score: r.score,
          reasons: r.reasons,
          excluded: r.excluded,
          servesDestination: _servesDestination,
          failsMandatory: _failsMandatory,
        };
      }),
    };
  }

  // ───────────── Internos ─────────────
  private async owned(userId: string, runId: string) {
    const run = await this.db
      .selectFrom('search_runs')
      .selectAll()
      .where('id', '=', runId)
      .where('owner_id', '=', userId)
      .executeTakeFirst();
    if (!run) throw notFound('search_run');
    return run;
  }

  private async isCancelled(runId: string) {
    const r = await this.db.selectFrom('search_runs').select('status').where('id', '=', runId).executeTakeFirst();
    return r?.status === 'cancelled';
  }

  private async setStatus(runId: string, status: string) {
    await this.db.updateTable('search_runs').set({ status }).where('id', '=', runId).execute();
  }

  private async event(runId: string, type: SearchEventType, payload: Record<string, unknown>) {
    await this.db
      .insertInto('search_events')
      .values({ run_id: runId, type, payload: JSON.stringify(payload) })
      .execute();
  }

  private async storeCandidates(runId: string, slug: string, items: (Candidate & RankInputExtra)[]) {
    if (!items.length) return;
    await this.db
      .insertInto('search_candidates')
      .values(items.map((c) => ({ run_id: runId, resource_slug: slug, dedupe_key: c.id, payload: JSON.stringify(c) })))
      .onConflict((oc) => oc.columns(['run_id', 'resource_slug', 'dedupe_key']).doNothing())
      .execute();
  }

  /** Lleva el plan a la casa sin borrar requisitos editados ni historial. */
  private async upsertRequirements(projectId: string, runId: string, plan: ResourcePlan) {
    for (const r of plan.resources) {
      await this.db
        .insertInto('resource_requirements')
        .values({
          project_id: projectId,
          search_run_id: runId,
          slug: r.id,
          label: r.label,
          category: r.category,
          quantity: r.quantity,
          unit: r.unit,
          reason: r.reason,
          required_specs: JSON.stringify(r.requiredSpecs),
          optional_specs: JSON.stringify(r.optionalSpecs),
          search_terms: JSON.stringify(r.searchTerms),
          priority: r.priority,
        })
        .onConflict((oc) =>
          oc
            .columns(['project_id', 'slug'])
            .doUpdateSet({ search_run_id: runId, search_terms: JSON.stringify(r.searchTerms), removed_at: null }),
        )
        .execute();
    }
  }

  quotaStatus(user: AuthUser) {
    return this.quota.status(user.id, user.timeZone);
  }
}
