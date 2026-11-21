import { describe, expect, it } from 'vitest';
import { groqBody } from './llm.planners';

const messages = [{ role: 'user', content: 'hola' }];

describe('groqBody', () => {
  it('gpt-oss: razonamiento bajo, más margen de salida y modo JSON', () => {
    const body = groqBody('openai/gpt-oss-20b', messages);
    expect(body).toMatchObject({ model: 'openai/gpt-oss-20b', reasoning_effort: 'low', max_tokens: 4000 });
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('otros modelos: sin reasoning_effort (lo rechazarían)', () => {
    const body = groqBody('otro-modelo', messages);
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body.max_tokens).toBe(1800);
  });
});
