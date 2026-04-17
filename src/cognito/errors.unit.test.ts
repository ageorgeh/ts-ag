import { describe, expect, it } from 'vitest';

import { error_cognito, error_lambda_fromCognito } from './errors.js';

describe('cognito errors', () => {
  it('wraps unknown errors as cognito errors', () => {
    const error = new Error('boom');

    expect(error_cognito(error)).toEqual({ type: 'cognito', error });
  });

  it('maps authentication and authorization errors to public auth responses', () => {
    expect(error_lambda_fromCognito(error_cognito({ name: 'NotAuthorizedException' }))).toEqual({
      type: 'unauthorized',
      message: 'Not authorized'
    });

    expect(error_lambda_fromCognito(error_cognito({ name: 'ForbiddenException' }))).toEqual({
      type: 'forbidden',
      message: 'Forbidden'
    });
  });

  it('maps user-facing validation and password errors', () => {
    expect(error_lambda_fromCognito(error_cognito({ name: 'InvalidParameterException' }))).toEqual({
      type: 'badRequest',
      message: 'There is an issue with your request',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(error_lambda_fromCognito(error_cognito({ name: 'InvalidPasswordException' }))).toEqual({
      type: 'badRequest',
      message: 'Password does not meet policy requirements',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(error_lambda_fromCognito(error_cognito({ name: 'PasswordHistoryPolicyViolationException' }))).toEqual({
      type: 'conflict',
      message: 'Password was used recently',
      fieldName: undefined,
      fieldValue: undefined
    });
  });

  it('maps lookup, code, and existing-user errors', () => {
    expect(error_lambda_fromCognito(error_cognito({ name: 'UserNotFoundException' }))).toEqual({
      type: 'notFound',
      message: 'User not found',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(error_lambda_fromCognito(error_cognito({ name: 'CodeMismatchException' }))).toEqual({
      type: 'badRequest',
      message: 'Invalid code',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(error_lambda_fromCognito(error_cognito({ name: 'UsernameExistsException' }))).toEqual({
      type: 'conflict',
      message: 'User already exists',
      fieldName: undefined,
      fieldValue: undefined
    });
  });

  it('keeps infrastructure and delivery failures private by default', () => {
    expect(error_lambda_fromCognito(error_cognito({ name: 'InvalidSmsRoleTrustRelationshipException' }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });

    expect(error_lambda_fromCognito(error_cognito({ name: 'CodeDeliveryFailureException' }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });
  });

  it('uses HTTP status metadata when Cognito does not provide a known error name', () => {
    expect(error_lambda_fromCognito(error_cognito({ $metadata: { httpStatusCode: 401 } }))).toEqual({
      type: 'unauthorized',
      message: 'Not authorized'
    });

    expect(error_lambda_fromCognito(error_cognito({ $metadata: { httpStatusCode: 429 } }))).toEqual({
      type: 'badRequest',
      message: 'Too many requests',
      fieldName: undefined,
      fieldValue: undefined
    });
  });

  it('allows endpoint-specific overrides', () => {
    expect(
      error_lambda_fromCognito(error_cognito({ name: 'UserNotFoundException' }), {
        userNotFound: { type: 'unauthorized', message: 'Invalid email or password' }
      })
    ).toEqual({ type: 'unauthorized', message: 'Invalid email or password' });

    expect(
      error_lambda_fromCognito(error_cognito({ name: 'UsernameExistsException' }), {
        userExists: { message: 'Email already registered', fieldName: 'email', fieldValue: 'person@example.com' }
      })
    ).toEqual({
      type: 'conflict',
      message: 'Email already registered',
      fieldName: 'email',
      fieldValue: 'person@example.com'
    });
  });
});
