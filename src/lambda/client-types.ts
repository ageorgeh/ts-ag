import type { ErrorCode } from 'rehype-parse';
import type { ErrorBody, SuccessCode } from './handlerUtils.js';

// ----------------- Helpers ----------------------
// Used to easily extract types from ApiEndpoints types

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
  E extends {
    path: string;
    method: string;
    response: any;
  },
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

/**
 * Converts a RawApiGatewayHandler response type to a fetch like response type.
 */
type ConvertToFetch<T> = T extends { statusCode: number; body: object; headers: object }
  ? {
      ok: T['statusCode'] extends SuccessCode ? true : false;
      json: () => Promise<T['body']>;
      status: T['statusCode'];
    }
  : T;

export type CleanResponse = Omit<Response, 'status' | 'ok' | 'json'>;
export type FetchResponse<T extends (...args: any) => any> = ConvertToFetch<Awaited<ReturnType<T>>> & CleanResponse;

// ------------------------ Proper types ------------------
// This is used by createApiRequest and createFormFunction

export const HTTPMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const;
export type HTTPMethod = (typeof HTTPMethods)[number];

export type ApiEndpoints = {
  path: string;
  method: HTTPMethod;
  requestInput: object;
  requestOutput: object;
  response: FetchResponse<
    // This means we get better types in the createFormFunction
    () => Promise<
      | {
          headers: any;
          statusCode: SuccessCode;
          body: object;
        }
      | {
          headers: any;
          statusCode: ErrorCode;
          body: ErrorBody;
        }
    >
  >;
};
