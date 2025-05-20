/**
 * Converts a RawApiGatewayHandler response type to a fetch like response type.
 */
type ConvertToFetch<T> = T extends { statusCode: number; body: object; headers: object }
  ? {
      ok: T['statusCode'] extends 200 | 201 | 204 ? true : false;
      json: () => Promise<T['body']>;
      status: T['statusCode'];
    }
  : T;

export type CleanResponse = Omit<Response, 'status' | 'ok' | 'json'>;
export type FetchResponse<T extends (...args: any) => any> = ConvertToFetch<Awaited<ReturnType<T>>> & CleanResponse;

/**
 * Extracts the requestInput type from an API endpoint definition
 * @template E - Union type of all API endpoints
 * @template P - Path string literal type (e.g. 'payments/account')
 * @template M - HTTP method string literal type (e.g. 'GET', 'POST')
 */
export type ApiInput<
  E extends { path: string; method: string; requestInput: any },
  P extends E['path'],
  M extends E['method']
> = Extract<E, { path: P; method: M }>['requestInput'];

/**
 * Extracts the requestOutput type from an API endpoint definition
 * @template E - Union type of all API endpoints
 * @template P - Path string literal type (e.g. 'payments/account')
 * @template M - HTTP method string literal type (e.g. 'GET', 'POST')
 */
export type ApiOutput<
  E extends { path: string; method: string; requestOutput: any },
  P extends E['path'],
  M extends E['method']
> = Extract<E, { path: P; method: M }>['requestOutput'];

/**
 * Extracts the response type from an API endpoint definition
 * @template E - Union type of all API endpoints
 * @template P - Path string literal type (e.g. 'payments/account')
 * @template M - HTTP method string literal type (e.g. 'GET', 'POST')
 */
export type ApiResponse<
  E extends { path: string; method: string; response: any },
  P extends E['path'],
  M extends E['method']
> = Extract<E, { path: P; method: M }>['response'];

/**
 * Extracts the sucessful body type from an API endpoint definition
 * @template E - Union type of all API endpoints
 * @template P - Path string literal type (e.g. 'payments/account')
 * @template M - HTTP method string literal type (e.g. 'GET', 'POST')
 */
export type ApiSuccessBody<
  E extends { path: string; method: string; response: any },
  P extends E['path'],
  M extends E['method']
> = Extract<Extract<E, { path: P; method: M }>['response'], { status: 200 }>['json'] extends () => Promise<infer R>
  ? R
  : unknown;
