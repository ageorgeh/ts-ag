import { describe, expect, it } from 'vitest';

import { error_lambda_fromSes, error_ses } from './errors.js';

describe('ses errors', () => {
  it('wraps unknown errors as ses errors', () => {
    const error = new Error('boom');

    expect(error_ses(error)).toEqual({ type: 'ses', error });
  });

  it('maps SES validation and rejection errors to public bad requests', () => {
    expect(error_lambda_fromSes(error_ses({ name: 'BadRequestException' }))).toEqual({
      type: 'badRequest',
      message: 'Invalid SES request',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(error_lambda_fromSes(error_ses({ name: 'MessageRejected' }))).toEqual({
      type: 'badRequest',
      message: 'Email message was rejected',
      fieldName: undefined,
      fieldValue: undefined
    });
  });

  it('keeps SES identity, missing resource, access, and throttling details private by default', () => {
    expect(error_lambda_fromSes(error_ses({ name: 'IdentityNotVerifiedException' }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });

    expect(error_lambda_fromSes(error_ses({ name: 'TemplateDoesNotExistException' }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });

    expect(error_lambda_fromSes(error_ses({ name: 'AccessDeniedException' }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });

    expect(error_lambda_fromSes(error_ses({ name: 'TooManyRequestsException' }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });
  });

  it('maps SES conflict and already-exists errors', () => {
    expect(error_lambda_fromSes(error_ses({ name: 'AlreadyExistsException' }))).toEqual({
      type: 'conflict',
      message: 'SES resource already exists',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(error_lambda_fromSes(error_ses({ name: 'SendingPausedException' }))).toEqual({
      type: 'conflict',
      message: 'The request conflicts with the current SES resource state',
      fieldName: undefined,
      fieldValue: undefined
    });
  });

  it('uses HTTP status metadata when SES does not provide a known error name', () => {
    expect(error_lambda_fromSes(error_ses({ $metadata: { httpStatusCode: 400 } }))).toEqual({
      type: 'badRequest',
      message: 'Invalid SES request',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(error_lambda_fromSes(error_ses({ $metadata: { httpStatusCode: 403 } }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });
  });

  it('allows endpoint-specific overrides', () => {
    expect(
      error_lambda_fromSes(error_ses({ name: 'TemplateDoesNotExistException' }), {
        notFound: {
          type: 'notFound',
          message: 'Email template not found',
          fieldName: 'template',
          fieldValue: 'welcome'
        }
      })
    ).toEqual({ type: 'notFound', message: 'Email template not found', fieldName: 'template', fieldValue: 'welcome' });

    expect(
      error_lambda_fromSes(error_ses({ name: 'AccessDeniedException' }), {
        accessDenied: { type: 'forbidden', message: 'Forbidden' }
      })
    ).toEqual({ type: 'forbidden', message: 'Forbidden' });
  });
});
