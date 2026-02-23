import type { BaseIssue, SafeParseResult } from 'valibot';

import { error_lambda_badRequest, type type_error_lambda } from './errors.js';
import type { ErrorRawProxyResultV2, OkRawProxyResultV2 } from './handlerUtils.js';

function field(obj: { fieldName?: string; fieldValue?: string }) {
  return obj.fieldName === undefined || obj.fieldValue === undefined
    ? {}
    : { field: { name: obj.fieldName, value: obj.fieldValue } };
}

export type type_error_response = Omit<ErrorRawProxyResultV2, 'headers' | 'body'> & {
  headers: NonNullable<ErrorRawProxyResultV2['headers']>;
  body: NonNullable<ErrorRawProxyResultV2['body']>;
};

export type LambdaErrorResponse<Type extends string = '', Extras extends object = {}> =
  | {
      headers: Record<string, string>;
      statusCode: 400;
      body: { message: string; type: Type } & ReturnType<typeof field> & Extras;
    }
  | { headers: Record<string, string>; statusCode: 401; body: { message: string; type: Type } & Extras }
  | { headers: Record<string, string>; statusCode: 403; body: { message: string; type: Type } & Extras }
  | {
      headers: Record<string, string>;
      statusCode: 404;
      body: { message: string; type: Type } & ReturnType<typeof field> & Extras;
    }
  | {
      headers: Record<string, string>;
      statusCode: 409;
      body: { message: string; type: Type } & ReturnType<typeof field> & Extras;
    }
  | { headers: Record<string, string>; statusCode: 500; body: { message: string; type: Type } & Extras };

export function response_error<Type extends string = '', Extras extends object = {}>(
  e: type_error_lambda,
  headers: Record<string, string>,
  type: Type = '' as Type,
  extras: Extras = {} as Extras
): LambdaErrorResponse<Type, Extras> {
  switch (e.type) {
    case 'lambda_badRequest':
      return { headers, statusCode: 400, body: { message: e.message, type: type, ...field(e), ...extras } };

    case 'lambda_unauthorized':
      return { headers, statusCode: 401, body: { message: e.message, type: type, ...extras } };

    case 'lambda_forbidden':
      return { headers, statusCode: 403, body: { message: e.message, type: type, ...extras } };

    case 'lambda_notFound':
      return { headers, statusCode: 404, body: { message: e.message, type: type, ...field(e), ...extras } };

    case 'lambda_conflict':
      return { headers, statusCode: 409, body: { message: e.message, type: type, ...field(e), ...extras } };

    default:
      return { headers, statusCode: 500, body: { message: 'Unknown error', type: type, ...extras } };
  }
}

/**
 * Helper function to get a reasonable default error response from a valibot parse result
 * @param res - The output from calling safeParse on the input
 * @param headers - The headers to return in the response
 */
export function response_valibotError(res: Extract<SafeParseResult<any>, { success: false }>, headers: any) {
  const issue = res.issues[0] as BaseIssue<any>;

  if (issue.path && issue.path[0] && typeof issue.path[0].key === 'string') {
    return response_error(error_lambda_badRequest('Invalid input', issue.path[0].key, issue.message), headers);
  } else {
    return response_error(error_lambda_badRequest(`Invalid input: ${issue.message}`), headers);
  }
}

export function response_ok<Body extends { message: string }>(
  body: Body,
  headers: any,
  cookies?: string[] | undefined
) {
  return { headers, cookies, statusCode: 200 as const, body } satisfies OkRawProxyResultV2;
}
