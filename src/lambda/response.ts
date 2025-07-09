import type { SafeParseResult } from 'valibot';
import { error_lambda_badRequest, type type_error_lambda } from './errors.js';
import type { ErrorRawProxyResultV2 } from './handlerUtils.js';

function field(obj: { fieldName?: string; fieldValue?: string }) {
  return obj.fieldName === undefined || obj.fieldValue === undefined
    ? {}
    : {
        field: {
          name: obj.fieldName,
          value: obj.fieldValue
        }
      };
}

/**
 * Takes a lambda error and gives an error response suitable to be returned from the lambda handler
 */
export function errorResponse(e: type_error_lambda, headers: any, extras?: any): ErrorRawProxyResultV2 {
  switch (e.type) {
    case 'lambda_badRequest':
      return {
        headers,
        statusCode: 400 as const,
        body: {
          message: e.message,
          ...field(e),
          ...extras
        }
      };
    case 'lambda_unauthorized':
      return {
        headers,
        statusCode: 401 as const,
        body: {
          message: e.message,
          ...extras
        }
      };
    case 'lambda_forbidden':
      return {
        headers,
        statusCode: 403 as const,
        body: {
          message: e.message,
          ...extras
        }
      };
    case 'lambda_notFound':
      return {
        headers,
        statusCode: 404 as const,
        body: {
          message: e.message,
          ...field(e),
          ...extras
        }
      };
    case 'lambda_conflict':
      return {
        headers,
        statusCode: 409 as const,
        body: {
          message: e.message,
          ...field(e),
          ...extras
        }
      };
    default:
      return {
        headers,
        statusCode: 500 as const,
        body: {
          message: 'Unknown error',
          ...extras
        }
      };
  }
}

/**
 * Helper function to get a reasonable default error response from a valibot parse result
 * @param res - The output from calling safeParse on the input
 * @param headers - The headers to return in the response
 */
export function valibotErrorResponse(res: Extract<SafeParseResult<any>, { success: false }>, headers: any) {
  const issue = res.issues[0];

  return errorResponse(error_lambda_badRequest('Invalid parameters', issue.path[0].key, issue.message), headers);
}

export function response_ok<Body extends { message: string }>(body: Body, headers: any) {
  return {
    headers,
    statusCode: 200 as const,
    body
  };
}
