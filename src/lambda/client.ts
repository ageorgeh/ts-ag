// import { deserialize } from './deserializer.js';
import { parse } from 'devalue';
import * as v from 'valibot';
import type { ApiEndpoints, ApiInput, ApiResponse } from './client-types.js';

const bodyMethods = ['POST', 'PUT', 'PATCH'] as const;
const queryMethods = ['GET', 'DELETE'] as const;

async function _apiRequest<T = Response>(
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  input: object | null,
  schema: ApiSchema,
  // This was here because of the deserializer being different in prod
  environment: string | 'production',
  apiUrl: string,
  headers?: HeadersInit
): Promise<T> {
  if (schema) {
    if (schema.async === true) v.parseAsync(schema, input);
    else v.parse(schema, input);
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

  headers = { 'Content-Type': 'application/json', ...(headers || {}) };
  const response = await fetch(url, {
    method,
    headers,
    body: bodyMethods.includes(method as any) ? JSON.stringify(input) : undefined,
    credentials: 'include'
  });

  let retrieved: Promise<string> | false = false;
  response.json = async () => {
    if (retrieved === false) {
      retrieved = response.text();
    }
    return await parse(await retrieved);
  };
  return response as unknown as T;
}

const HTTPMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const;
type HTTPMethod = (typeof HTTPMethods)[number];

export type ApiRequestFunction<API extends ApiEndpoints> = <
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
>(
  path: Path,
  method: Method,
  input: ApiInput<API, Path, Method>,
  headers?: HeadersInit
) => Promise<ApiResponse<API, Path, Method>>;

export type ApiSchema = v.GenericSchema | v.GenericSchemaAsync;

/**
 * @returns A function that can be used to make API requests with type safety
 * @example const clientApiRequest = createApiRequest<ApiEndpoints>();
 */
export function createApiRequest<API extends ApiEndpoints>(
  schemas: Partial<Record<API['path'], Partial<Record<HTTPMethod, ApiSchema>>>>,
  apiUrl: string,
  env: string
): ApiRequestFunction<API> {
  return async function apiRequest(path, method, input, headers) {
    const schema = schemas[path]?.[method];
    if (schema === undefined) throw new Error('Schema is undefined in api request');

    // if (typeof schema === 'function') {
    //   schema = schema();
    // }

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
