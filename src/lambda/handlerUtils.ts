import type { APIGatewayProxyResultV2, Context } from 'aws-lambda';
// import { stringify } from './serializer.js';
import { stringify } from 'devalue';

export type SuccessCode = 200 | 201 | 204;
export type ErrorCode = 400 | 401 | 403 | 404 | 409 | 500;

export type ErrorBody = { message: string; field?: { name: string; value: string } };

/**
 * The error response for the lambda functions to return
 */
export type ErrorRawProxyResultV2 = {
  statusCode: ErrorCode;
  headers?: { [header: string]: boolean | number | string } | undefined;
  body?: ErrorBody;
  isBase64Encoded?: boolean | undefined;
  cookies?: string[] | undefined;
};

export type OkRawProxyResultV2 = {
  statusCode: SuccessCode;
  headers?: { [header: string]: boolean | number | string } | undefined;
  body?: object | undefined;
  isBase64Encoded?: boolean | undefined;
  cookies?: string[] | undefined;
};
/**
 * A type for the raw proxy result - just using an object not a stirng for the body
 */
export type RawProxyResultV2 = ErrorRawProxyResultV2 | OkRawProxyResultV2;

// The type of the handler returned from wrapHandler
export type APIGatewayHandler<E> = (event: E, context: Context) => Promise<APIGatewayProxyResultV2>;

// The type of the handler passed into wrapHandler
export type RawApiGatewayHandler<E> = (event: E, context: Context) => Promise<RawProxyResultV2>;

/**
 * Wraps a handler that returns the body as an object rather than a string.
 *
 * This means you can achieve proper type inference on your handler and have standardised serialisation
 *
 * @example
```ts
export type AuthorizerContext = {
  details: JWTPayload;
} | null;

export const wrapHandler = baseWrapHandler<APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>>

*/
export function wrapHandler<E>(handler: RawApiGatewayHandler<E>): APIGatewayHandler<E> {
  return async (event: E, context: Context): Promise<APIGatewayProxyResultV2> => {
    const result = await handler(event, context);
    return { ...result, body: result.body ? stringify(result.body) : undefined };
  };
}
