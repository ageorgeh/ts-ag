import { DynamoDBToolboxError } from 'dynamodb-toolbox';
import { describe, expect, it } from 'vitest';

import { error_dynamo, error_lambda_fromDynamo } from './errors.js';

describe('dynamo errors', () => {
  it('wraps unknown errors as dynamo errors', () => {
    const error = new Error('boom');

    expect(error_dynamo(error)).toEqual({ type: 'dynamo', error });
  });

  it('maps unknown errors to a generic internal lambda error', () => {
    expect(error_lambda_fromDynamo(error_dynamo(new Error('boom')))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });
  });

  it('maps DynamoDB Toolbox parsing errors to generic bad requests by default', () => {
    const error = new DynamoDBToolboxError('parsing.invalidAttributeInput', {
      message: 'Invalid attribute at userId',
      path: 'userId',
      payload: { received: 1, expected: 'string' }
    });

    expect(error_lambda_fromDynamo(error_dynamo(error))).toEqual({
      type: 'badRequest',
      message: 'Invalid request',
      fieldName: undefined,
      fieldValue: undefined
    });
  });

  it('can include Toolbox path details when the path is safe to expose', () => {
    const error = new DynamoDBToolboxError('parsing.attributeRequired', {
      message: 'Missing required attribute',
      path: 'paymentId'
    });

    expect(error_lambda_fromDynamo(error_dynamo(error), { includeToolboxPath: true })).toEqual({
      type: 'badRequest',
      message: 'Invalid request',
      fieldName: 'paymentId',
      fieldValue: 'Missing required attribute'
    });
  });

  it('maps Toolbox request option, projection, and condition errors to bad requests', () => {
    const toolboxErrors = [
      new DynamoDBToolboxError('options.invalidLimitOption', {
        message: 'Invalid limit option',
        payload: { limit: 0 }
      }),
      new DynamoDBToolboxError('queryCommand.invalidProjectionExpression', {
        message: 'Invalid projection',
        payload: { entity: 'Payment' }
      }),
      new DynamoDBToolboxError('actions.invalidExpressionAttributePath', {
        message: 'Invalid expression attribute path',
        payload: { attributePath: 'items..price' }
      })
    ];

    for (const error of toolboxErrors) {
      expect(error_lambda_fromDynamo(error_dynamo(error))).toEqual({
        type: 'badRequest',
        message: 'Invalid request',
        fieldName: undefined,
        fieldValue: undefined
      });
    }
  });

  it('keeps Toolbox schema, formatter, setup, and no-entity-match errors private', () => {
    const toolboxErrors = [
      new DynamoDBToolboxError('formatter.invalidItem', {
        message: 'Invalid item detected while formatting',
        payload: { received: null, expected: 'Object' }
      }),
      new DynamoDBToolboxError('table.missingTableName', { message: 'Please specify a table name' }),
      new DynamoDBToolboxError('queryCommand.noEntityMatched', {
        message: 'Unable to match item to an entity',
        payload: { item: { pk: 'payment#1' } }
      })
    ];

    for (const error of toolboxErrors) {
      expect(error_lambda_fromDynamo(error_dynamo(error))).toEqual({
        type: 'internal',
        message: 'Internal server error'
      });
    }
  });

  it('maps DynamoDB conditional check failures to conflicts by default', () => {
    expect(error_lambda_fromDynamo(error_dynamo({ name: 'ConditionalCheckFailedException' }))).toEqual({
      type: 'conflict',
      message: 'The request conflicts with the current resource state',
      fieldName: undefined,
      fieldValue: undefined
    });
  });

  it('allows conditional check failures to be exposed as endpoint-specific not found errors', () => {
    expect(
      error_lambda_fromDynamo(error_dynamo({ name: 'ConditionalCheckFailedException' }), {
        conditionalCheckFailed: {
          type: 'notFound',
          message: 'Custom payment not found',
          fieldName: 'customPaymentId',
          fieldValue: 'pay_123'
        }
      })
    ).toEqual({
      type: 'notFound',
      message: 'Custom payment not found',
      fieldName: 'customPaymentId',
      fieldValue: 'pay_123'
    });
  });

  it('allows Dynamo validation failures to be hidden behind an auth-safe response', () => {
    expect(
      error_lambda_fromDynamo(error_dynamo({ name: 'ValidationException' }), {
        invalidInput: { type: 'unauthorized', message: 'Invalid email or password' }
      })
    ).toEqual({ type: 'unauthorized', message: 'Invalid email or password' });
  });

  it('maps transaction cancellation reasons to the most relevant public error', () => {
    expect(
      error_lambda_fromDynamo(
        error_dynamo({
          name: 'TransactionCanceledException',
          CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }]
        })
      )
    ).toEqual({
      type: 'conflict',
      message: 'The request conflicts with the current resource state',
      fieldName: undefined,
      fieldValue: undefined
    });

    expect(
      error_lambda_fromDynamo(
        error_dynamo({ name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ValidationError' }] })
      )
    ).toEqual({ type: 'badRequest', message: 'Invalid request', fieldName: undefined, fieldValue: undefined });
  });

  it('keeps DynamoDB table and permission errors private', () => {
    expect(error_lambda_fromDynamo(error_dynamo({ name: 'ResourceNotFoundException' }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });

    expect(error_lambda_fromDynamo(error_dynamo({ name: 'AccessDeniedException' }))).toEqual({
      type: 'internal',
      message: 'Internal server error'
    });
  });
});
