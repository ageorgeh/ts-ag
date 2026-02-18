import { describe, expect, it } from 'vitest';
import { parse } from 'devalue';
import { wrapHandler } from './handlerUtils.js';

describe('wrapHandler', () => {
  it('serializes object bodies with devalue and preserves other fields', async () => {
    const wrapped = wrapHandler(async () => ({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true, nested: { value: 123 } },
      cookies: ['a=1']
    }));

    const response = await wrapped({} as never, {} as never);

    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(response.cookies).toEqual(['a=1']);
    expect(typeof response.body).toBe('string');
    expect(parse(response.body as string)).toEqual({ ok: true, nested: { value: 123 } });
  });

  it('keeps body undefined when raw handler has no body', async () => {
    const wrapped = wrapHandler(async () => ({ statusCode: 204 }));

    const response = await wrapped({} as never, {} as never);

    expect(response).toEqual({ statusCode: 204, body: undefined });
  });
});
