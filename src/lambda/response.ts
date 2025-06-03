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
export function errorResponse(e: LambdaError) {
  switch (e.type) {
    case 'BadRequest':
      return {
        statusCode: 400 as const,
        body: {
          message: e.message,
          ...field(e)
        }
      };
    case 'Unauthorized':
      return {
        statusCode: 401 as const,
        body: {
          message: e.message
        }
      };
    case 'Forbidden':
      return {
        statusCode: 403 as const,
        body: {
          message: e.message
        }
      };
    case 'NotFound':
      return {
        statusCode: 404 as const,
        body: {
          message: e.message,
          ...field(e)
        }
      };
    case 'Conflict':
      return {
        statusCode: 409 as const,
        body: {
          message: e.message,
          ...field(e)
        }
      };
    default:
      return {
        statusCode: 500 as const,
        body: {
          message: 'Unknown error'
        }
      };
  }
}

/**
 * Helper function to get a reasonable default error response from a valibot parse result
 */
export function valibotErrorResponse(res: Extract<SafeParseResult<any>, { success: false }>) {
  const issue = res.issues[0];

  return errorResponse(badRequestError('Invalid parameters', issue.path[0].key, issue.message));
}
