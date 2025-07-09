/**
 * These are the various errors that should be returned from anything called by a lambda function.
 *
 * Pass a lambda error to the errorResponse function to get a suitable response to return from the lambda handler.
 *
 * The separation means that they can be returned from functions that are certainly run inside a lambda fucntion but theyre not the actual return of the lambda.
 * Im not sure it this is optimal behaviour and if not we will migrate to only using the errorResponse function
 */

export const error_lambda_badRequest = (message: string, fieldName?: string, fieldValue?: string) => ({
  type: 'lambda_badRequest' as const,
  message,
  fieldName,
  fieldValue
});
export const error_lambda_unauthorized = (message: string) => ({
  type: 'lambda_unauthorized' as const,
  message
});

export const error_lambda_forbidden = (message: string) => ({
  type: 'lambda_forbidden' as const,
  message
});

export const error_lambda_notFound = (message: string, fieldName?: string, fieldValue?: string) => ({
  type: 'lambda_notFound' as const,
  message,
  fieldName,
  fieldValue
});

export const error_lambda_conflict = (message: string, fieldName?: string, fieldValue?: string) => ({
  type: 'lambda_conflict' as const,
  message,
  fieldName,
  fieldValue
});

export const error_lambda_internal = (message: string) => ({
  type: 'lambda_internal' as const,
  message
});

export type type_error_lambda_badRequest = ReturnType<typeof error_lambda_badRequest>;
export type type_error_lambda_unauthorized = ReturnType<typeof error_lambda_unauthorized>;
export type type_error_lambda_forbidden = ReturnType<typeof error_lambda_forbidden>;
export type type_error_lambda_notFound = ReturnType<typeof error_lambda_notFound>;
export type type_error_lambda_conflict = ReturnType<typeof error_lambda_conflict>;
export type type_error_lambda_internal = ReturnType<typeof error_lambda_internal>;

export type type_error_lambda =
  | type_error_lambda_badRequest
  | type_error_lambda_unauthorized
  | type_error_lambda_forbidden
  | type_error_lambda_notFound
  | type_error_lambda_conflict
  | type_error_lambda_internal;
