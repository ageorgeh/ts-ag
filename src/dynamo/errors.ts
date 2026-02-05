import { error_lambda_internal } from '$lambda/errors.js';

export const error_dynamo = { type: 'dynamo' as const };

export type type_error_dynamo = typeof error_dynamo;

export function error_lambda_fromDynamo(e: type_error_dynamo) {
  return error_lambda_internal('Internal server error');
}
