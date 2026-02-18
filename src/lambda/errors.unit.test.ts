import { describe, expect, it } from 'vitest';
import {
  error_lambda_badRequest,
  error_lambda_conflict,
  error_lambda_forbidden,
  error_lambda_internal,
  error_lambda_notFound,
  error_lambda_unauthorized
} from './errors.js';

describe('lambda error factories', () => {
  it('creates bad request errors with optional field metadata', () => {
    expect(error_lambda_badRequest('Invalid', 'email', 'bad@value')).toEqual({
      type: 'lambda_badRequest',
      message: 'Invalid',
      fieldName: 'email',
      fieldValue: 'bad@value'
    });
  });

  it('creates remaining lambda error types with expected shape', () => {
    expect(error_lambda_unauthorized('No auth')).toEqual({ type: 'lambda_unauthorized', message: 'No auth' });
    expect(error_lambda_forbidden('No access')).toEqual({ type: 'lambda_forbidden', message: 'No access' });
    expect(error_lambda_notFound('Missing', 'id', '123')).toEqual({
      type: 'lambda_notFound',
      message: 'Missing',
      fieldName: 'id',
      fieldValue: '123'
    });
    expect(error_lambda_conflict('Conflict', 'id', '123')).toEqual({
      type: 'lambda_conflict',
      message: 'Conflict',
      fieldName: 'id',
      fieldValue: '123'
    });
    expect(error_lambda_internal('Oops')).toEqual({ type: 'lambda_internal', message: 'Oops' });
  });
});
