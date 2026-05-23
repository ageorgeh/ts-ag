// import { deserialize } from './deserializer.js';
import { parse } from 'devalue';
import { parse as vParse, parseAsync, type GenericSchema, type GenericSchemaAsync } from 'valibot';

import type { ApiEndpoints, ApiInput, ApiResponse } from './client-types.js';

const bodyMethods = ['POST', 'PUT', 'PATCH'] as const;
const queryMethods = ['GET', 'DELETE'] as const;

async function _apiRequest<T = Response>(
  path: string,
  method: HTTPMethod,
  input: object | null,
  schema: ApiSchema,
  // This was here because of the deserializer being different in prod
  environment: string | 'production',
  apiUrl: string,
  headers?: HeadersInit
): Promise<T> {
  if (schema) {
    if (schema.async === true) await parseAsync(schema, input);
    else vParse(schema, input);
  }

  let url = `${apiUrl}${apiUrl.endsWith('/') ? '' : '/'}${path}`;

  if (queryMethods.includes(method as any)) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(input ?? {})) {
      if (Array.isArray(value)) {
        value.forEach((item) => params.append(key, String(item)));
      } else {
        params.append(key, String(value));
      }
    }

    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;
  }

  headers = { 'Content-Type': 'application/json', ...headers };
  const response = await fetch(url, {
    method,
    headers,
    // oxlint-disable-next-line
    body: bodyMethods.includes(method as any) ? JSON.stringify(input) : undefined,
    credentials: 'include'
  });
  const contentType = response.headers.get('content-type') ?? '';

  let retrieved: Promise<string> | false = false;
  response.json = async () => {
    if (retrieved === false) {
      retrieved = response.text();
    }

    if (contentType === 'application/devalue') {
      return await parse(await retrieved);
    } else {
      return JSON.parse(await retrieved);
    }
  };
  return response as unknown as T;
}

const HTTPMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const;
type HTTPMethod = (typeof HTTPMethods)[number];

export type ApiRequestFunction<API extends ApiEndpoints> = <
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
>(
  endpoint: ApiEndpointContract<API, Path, Method>,
  input: ApiInput<API, Path, Method>,
  headers?: HeadersInit
) => Promise<ApiResponse<API, Path, Method>>;

export type ApiSchema = GenericSchema | GenericSchemaAsync;

export type ApiEndpointContract<
  API extends ApiEndpoints,
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
> = { path: Path; method: Method; schema: ApiSchema };

export type AnyApiEndpointContract<API extends ApiEndpoints> = {
  [Path in API['path']]: {
    [Method in Extract<API, { path: Path }>['method']]: ApiEndpointContract<API, Path, Method>;
  }[Extract<API, { path: Path }>['method']];
}[API['path']];

export function endpointKey(endpoint: { path: string; method: string }) {
  return `${endpoint.method} ${endpoint.path}`;
}

/**
 * @returns A function that can be used to make API requests with type safety
 * @example const clientApiRequest = createApiRequest<ApiEndpoints>();
 */
export function createApiRequest<API extends ApiEndpoints>(apiUrl: string, env: string): ApiRequestFunction<API> {
  return async function apiRequest(endpoint, input, headers) {
    return _apiRequest<ApiResponse<API, typeof endpoint.path, typeof endpoint.method>>(
      endpoint.path,
      endpoint.method,
      input,
      endpoint.schema,
      env,
      apiUrl,
      headers
    );
  };
}
