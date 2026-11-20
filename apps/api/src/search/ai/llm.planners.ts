import type { ResourcePlan, SearchRequest } from '@jucumari/shared';
import { buildUserPrompt, parsePlan, PlannerError, type ResourcePlanner, SYSTEM_PROMPT } from './planner';

async function postJson(url: string, body: unknown, headers: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw new PlannerError('timeout', 'Tiempo de espera agotado');
    throw new PlannerError('provider_error', e instanceof Error ? e.message : 'fetch failed');
  }
  if (res.status === 429) throw new PlannerError('rate_limited', 'Límite del proveedor de IA');
  if (!res.ok) throw new PlannerError('provider_error', `HTTP ${res.status}`);
  return res.json();
}

/** Intenta una segunda vez indicando el error de validación (sin reenviar datos nuevos del usuario). */
async function withRepair(
  call: (messages: { role: string; content: string }[]) => Promise<string>,
  req: SearchRequest,
): Promise<ResourcePlan> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(req) },
  ];
  const first = await call(messages);
  try {
    return parsePlan(first);
  } catch (e) {
    if (!(e instanceof PlannerError) || e.code !== 'invalid_output') throw e;
    const second = await call([
      ...messages,
      { role: 'assistant', content: first.slice(0, 4000) },
      { role: 'user', content: `Your JSON was invalid (${e.message}). Return the corrected JSON object only.` },
    ]);
    return parsePlan(second);
  }
}

/** Groq (API compatible con OpenAI). Plan gratuito con límites diarios. */
export class GroqPlanner implements ResourcePlanner {
  readonly provider = 'groq';
  readonly isDemo = false;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  plan(req: SearchRequest, signal: AbortSignal): Promise<ResourcePlan> {
    return withRepair(async (messages) => {
      const data = (await postJson(
        'https://api.groq.com/openai/v1/chat/completions',
        { model: this.model, messages, temperature: 0.2, max_tokens: 1800, response_format: { type: 'json_object' } },
        { authorization: `Bearer ${this.apiKey}` },
        signal,
      )) as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content ?? '';
    }, req);
  }
}

/** Ollama privado (VPS). Nunca expuesto a Internet: la API lo llama por red interna. */
export class OllamaPlanner implements ResourcePlanner {
  readonly provider = 'ollama';
  readonly isDemo = false;
  constructor(
    private readonly baseUrl: string,
    readonly model: string,
  ) {}

  plan(req: SearchRequest, signal: AbortSignal): Promise<ResourcePlan> {
    return withRepair(async (messages) => {
      const data = (await postJson(
        `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
        { model: this.model, messages, stream: false, format: 'json', options: { temperature: 0.2, num_predict: 1800 } },
        {},
        signal,
      )) as { message?: { content?: string } };
      return data.message?.content ?? '';
    }, req);
  }
}
