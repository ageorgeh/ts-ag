import { stringify } from 'devalue';
import * as v from 'valibot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiRequest } from './client.js';

describe('createApiRequest', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  function createClient() {
    return createApiRequest<any>('https://api.example.com/v1', 'test');
  }

  function endpoint(path: string, method: string, schema: v.GenericSchema | v.GenericSchemaAsync) {
    return { path, method, schema } as any;
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('validates GET input, serializes query params, and memoizes JSON parsing', async () => {
    const response = new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    const textSpy = vi.spyOn(response, 'text');
    fetchMock.mockResolvedValueOnce(response);

    const apiRequest = createClient();
    const search_GET = endpoint(
      'search',
      'GET',
      v.object({ term: v.string(), page: v.number(), tags: v.array(v.string()) })
    );

    const result = await apiRequest(search_GET, { term: 'hello world', page: 2, tags: ['alpha', 'beta'] });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/search?term=hello+world&page=2&tags=alpha&tags=beta',
      { method: 'GET', headers: { 'Content-Type': 'application/json' }, body: undefined, credentials: 'include' }
    );
    await expect(result.json()).resolves.toEqual({ ok: true });
    await expect(result.json()).resolves.toEqual({ ok: true });
    expect(textSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['POST', 'PUT', 'PATCH'] as const)('sends %s input as a JSON request body', async (method) => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ method }), { headers: { 'content-type': 'application/json' } })
    );

    const apiRequest = createClient();
    const resource = endpoint('resource', method, v.object({ id: v.string() }));

    const input = { id: '123' };

    await apiRequest(resource, input, { Authorization: 'Bearer token' });

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/resource', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify(input),
      credentials: 'include'
    });
  });

  it('sends DELETE input as query params without a body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ deleted: true }), { headers: { 'content-type': 'application/json' } })
    );

    const apiRequest = createClient();
    const resource_DELETE = endpoint('resource', 'DELETE', v.object({ id: v.string(), force: v.boolean() }));

    await apiRequest(resource_DELETE, { id: '123', force: true });

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/resource?id=123&force=true', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
      credentials: 'include'
    });
  });

  it('parses devalue responses and reuses the buffered text across repeated json calls', async () => {
    const response = new Response(
      stringify({ createdAt: new Date('2026-03-01T12:34:56.000Z'), nested: { ok: true } }),
      { headers: { 'content-type': 'application/devalue' } }
    );
    const textSpy = vi.spyOn(response, 'text');
    fetchMock.mockResolvedValueOnce(response);

    const apiRequest = createClient();
    const asyncResource_POST = endpoint('asyncResource', 'POST', v.objectAsync({ id: v.string() }));

    const result = await apiRequest(asyncResource_POST, { id: 'abc' });

    await expect(result.json()).resolves.toEqual({
      createdAt: new Date('2026-03-01T12:34:56.000Z'),
      nested: { ok: true }
    });
    await expect(result.json()).resolves.toEqual({
      createdAt: new Date('2026-03-01T12:34:56.000Z'),
      nested: { ok: true }
    });
    expect(textSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid sync schema input before calling fetch', async () => {
    const apiRequest = createClient();
    const search_GET = endpoint('search', 'GET', v.object({ term: v.string() }));

    await expect(apiRequest(search_GET, { term: 123 } as never)).rejects.toThrow(/Expected string/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid async schema input before calling fetch', async () => {
    const apiRequest = createClient();
    const asyncResource_POST = endpoint('asyncResource', 'POST', v.objectAsync({ id: v.string() }));

    await expect(apiRequest(asyncResource_POST, { id: 123 } as never)).rejects.toThrow(/Expected string/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
