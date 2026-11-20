import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SearchRequest } from '@jucumari/shared';
import { ENV, type Env } from '../../config/env';
import { DemoPlanner } from './demo.planner';
import { GroqPlanner, OllamaPlanner } from './llm.planners';
import { PlannerError, type PlannerResult, type ResourcePlanner } from './planner';

const TIMEOUT_MS = 45_000;

@Injectable()
export class AiService {
  private readonly logger = new Logger('AI');
  private readonly primary: ResourcePlanner;
  private readonly fallback: ResourcePlanner | null;

  constructor(@Inject(ENV) env: Env) {
    const demo = new DemoPlanner();
    const groq = env.GROQ_API_KEY ? new GroqPlanner(env.GROQ_API_KEY, env.GROQ_MODEL) : null;
    const ollama = env.OLLAMA_URL ? new OllamaPlanner(env.OLLAMA_URL, env.OLLAMA_MODEL) : null;
    if (env.AI_PROVIDER === 'groq' && groq) {
      this.primary = groq;
      this.fallback = ollama; // Ollama del VPS como respaldo cuando Groq llega al límite.
    } else if (env.AI_PROVIDER === 'ollama' && ollama) {
      this.primary = ollama;
      this.fallback = groq;
    } else {
      this.primary = demo;
      this.fallback = null;
    }
  }

  describe() {
    return { provider: this.primary.provider, model: this.primary.model, isDemo: this.primary.isDemo };
  }

  async plan(req: SearchRequest, outer?: AbortSignal): Promise<PlannerResult> {
    const attempt = async (p: ResourcePlanner): Promise<PlannerResult> => {
      const signal = AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(outer ? [outer] : [])]);
      const plan = await p.plan(req, signal);
      return { plan, provider: p.provider, model: p.model, isDemo: p.isDemo };
    };
    try {
      return await attempt(this.primary);
    } catch (e) {
      const code = e instanceof PlannerError ? e.code : 'provider_error';
      this.logger.warn(`Planificador ${this.primary.provider} falló (${code})`);
      if (this.fallback && (code === 'rate_limited' || code === 'provider_error' || code === 'timeout')) return attempt(this.fallback);
      throw e;
    }
  }
}
