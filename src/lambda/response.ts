import type { SafeParseResult } from 'valibot';
import { badRequestError, type LambdaError } from './errors.js';

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
export function errorResponse(e: LambdaError, headers: any, extras?: any) {
  switch (e.type) {
    case 'BadRequest':
      return {
        headers,
        statusCode: 400 as const,
        body: {
          message: e.message,
          ...field(e),
          ...extras
        }
      };
    case 'Unauthorized':
      return {
        headers,
        statusCode: 401 as const,
        body: {
          message: e.message,
          ...extras
        }
      };
    case 'Forbidden':
      return {
        headers,
        statusCode: 403 as const,
        body: {
          message: e.message,
          ...extras
        }
      };
    case 'NotFound':
      return {
        headers,
        statusCode: 404 as const,
        body: {
          message: e.message,
          ...field(e),
          ...extras
        }
      };
    case 'Conflict':
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
 */
export function valibotErrorResponse(res: Extract<SafeParseResult<any>, { success: false }>, headers: any) {
  const issue = res.issues[0];

  return errorResponse(badRequestError('Invalid parameters', issue.path[0].key, issue.message), headers);
}
