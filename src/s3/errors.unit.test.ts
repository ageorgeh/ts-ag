import { describe, expect, it } from 'vitest';

import { error_lambda_fromS3, error_s3, is_s3_notFound } from './errors.js';

describe('s3 errors', () => {
  it('wraps unknown errors as s3 errors', () => {
    const error = new Error('boom');

    expect(error_s3(error)).toEqual({ type: 's3', error });
  });

  it('maps missing S3 objects to not found by default', () => {
    expect(error_lambda_fromS3(error_s3({ name: 'NoSuchKey' }))).toEqual({
      type: 'notFound',
      message: 'S3 object not found',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(error_lambda_fromS3(error_s3({ name: 'NotFound' }))).toEqual({
      type: 'notFound',
      message: 'S3 object not found',
      fieldName: undefined,
      fieldValue: undefined
    });
  });

  it('keeps missing buckets and access errors private by default', () => {
    expect(error_lambda_fromS3(error_s3({ name: 'NoSuchBucket' }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });

    expect(error_lambda_fromS3(error_s3({ name: 'AccessDenied' }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });
  });

  it('maps S3 validation and state errors to public bad request or conflict responses', () => {
    expect(error_lambda_fromS3(error_s3({ name: 'InvalidRequest' }))).toEqual({
      type: 'badRequest',
      message: 'Invalid S3 request',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(error_lambda_fromS3(error_s3({ name: 'InvalidObjectState' }))).toEqual({
      type: 'conflict',
      message: 'The request conflicts with the current S3 resource state',
      fieldName: undefined,
      fieldValue: undefined
    });
  });

  it('uses HTTP status metadata when S3 does not provide a known error name', () => {
    expect(error_lambda_fromS3(error_s3({ $metadata: { httpStatusCode: 404 } }))).toEqual({
      type: 'notFound',
      message: 'S3 object not found',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(error_lambda_fromS3(error_s3({ $metadata: { httpStatusCode: 503 } }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });
  });

  it('allows endpoint-specific overrides', () => {
    expect(
      error_lambda_fromS3(error_s3({ name: 'AccessDenied' }), {
        accessDenied: { type: 'forbidden', message: 'Forbidden' }
      })
    ).toEqual({ type: 'forbidden', message: 'Forbidden' });

    expect(
      error_lambda_fromS3(error_s3({ name: 'NoSuchKey' }), {
        objectNotFound: { message: 'Avatar not found', fieldName: 'key', fieldValue: 'avatars/user-1.png' }
      })
    ).toEqual({ type: 'notFound', message: 'Avatar not found', fieldName: 'key', fieldValue: 'avatars/user-1.png' });
  });

  it('detects normal object-not-found errors for existence checks', () => {
    expect(is_s3_notFound({ name: 'NoSuchKey' })).toBe(true);
    expect(is_s3_notFound({ $metadata: { httpStatusCode: 404 } })).toBe(true);
    expect(is_s3_notFound({ name: 'NoSuchBucket' })).toBe(false);
    expect(is_s3_notFound({ name: 'AccessDenied' })).toBe(false);
  });
});
