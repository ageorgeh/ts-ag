import { deserialize } from './deserializer.js';
import * as v from 'valibot';
import type { ApiInput, ApiResponse } from './client-types.js';

const bodyMethods = ['POST', 'PUT', 'PATCH'] as const;
const queryMethods = ['GET', 'DELETE'] as const;

async function _apiRequest<T = Response>(
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  input: object,
  schema: v.GenericSchema | undefined,
  environment: string | 'production',
  apiUrl: string,
  headers?: HeadersInit
): Promise<T> {
  if (schema) {
    v.parse(schema, input);
  }

  let url = `${apiUrl}${path}`;

  if (queryMethods.includes(method as any)) {
    const params = input ?? {};
    const queryString = new URLSearchParams(
      Object.entries(params).reduce(
        (acc, [key, value]) => {
          if (Array.isArray(value)) {
            value.forEach((v) => (acc[key] = String(v)));
          } else {
            acc[key] = String(value);
          }
          return acc;
        },
        {} as Record<string, string>
      )
    ).toString();
    if (queryString) url += `?${queryString}`;
  }

  headers = {
    'Content-Type': 'application/json',
    ...(headers || {})
  };
  const response = await fetch(url, {
    method,
    headers,
    body: bodyMethods.includes(method as any) ? JSON.stringify(input) : undefined,
    credentials: 'include'
  });

  response.json = async () => {
    return await deserialize(await response.text(), environment);
  };
  return response as unknown as T;
}

const HTTPMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const;
type HTTPMethod = (typeof HTTPMethods)[number];

export type ApiRequestFunction<
  API extends { path: string; method: string; requestInput: any; requestOutput: any; response: any }
> = <Path extends API['path'], Method extends Extract<API, { path: Path }>['method']>(
  path: Path,
  method: Method,
  input: ApiInput<API, Path, Method>,
  headers?: HeadersInit
) => Promise<ApiResponse<API, Path, Method>>;

/**
 * @returns A function that can be used to make API requests with type safety
 * @example const clientApiRequest = createApiRequest<ApiEndpoints>();
 */
export function createApiRequest<
  API extends { path: string; method: string; requestInput: any; requestOutput: any; response: any }
>(
  schemas: Partial<Record<API['path'], Partial<Record<HTTPMethod, v.GenericSchema | (() => v.GenericSchema)>>>>,
  apiUrl: string,
  env: string
): ApiRequestFunction<API> {
  return async function apiRequest(path, method, input, headers) {
    // @ts-expect-error method can be used to index schemas
    let schema = schemas[path]?.[method];
    if (typeof schema === 'function') {
      schema = schema();
    }

    return _apiRequest<ApiResponse<API, typeof path, typeof method>>(
      path as string,
      method as 'GET' | 'POST',
      input,
      schema,
      env,
      apiUrl,
      headers
    );
  };
}
