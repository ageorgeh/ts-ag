import {
  error_lambda_badRequest,
  error_lambda_conflict,
  error_lambda_forbidden,
  error_lambda_internal,
  error_lambda_notFound,
  error_lambda_unauthorized,
  type type_error_lambda
} from '$lambda/errors.js';
import { DynamoDBToolboxError } from 'dynamodb-toolbox';

import { getErrorName, isRecord } from '../utils/errors.js';

/** Error wrapper for failures that happen while doing DynamoDB or DynamoDB Toolbox work. */
export type type_error_dynamo = { type: 'dynamo'; error: DynamoDBToolboxError | unknown };

/** Internal reason used before converting Dynamo-related errors into public lambda errors. */
export type type_error_lambda_fromDynamo_reason =
  | 'invalidInput'
  | 'conditionalCheckFailed'
  | 'transactionConflict'
  | 'resourceNotFound'
  | 'throttled'
  | 'accessDenied'
  | 'internal';

/** Per-reason public response override for endpoint-specific privacy and status choices. */
type type_error_lambda_fromDynamo_override = { message?: string } | Partial<type_error_lambda>;

/** Options for converting Dynamo errors to lambda errors. */
export type type_error_lambda_fromDynamo_options = Partial<
  Record<type_error_lambda_fromDynamo_reason, type_error_lambda_fromDynamo_override>
> & {
  /**
   * By default DynamoDB and DynamoDB Toolbox details are not returned to clients.
   * Set this to true only when the Toolbox path is already a public input field.
   */
  includeToolboxPath?: boolean;
};

const defaultErrors = {
  invalidInput: { type: 'badRequest', message: 'Invalid request' },
  conditionalCheckFailed: { type: 'conflict', message: 'The request conflicts with the current resource state' },
  transactionConflict: { type: 'conflict', message: 'The request conflicts with the current resource state' },
  resourceNotFound: { type: 'internal', message: 'Internal server error' },
  throttled: { type: 'internal', message: 'Internal server error' },
  accessDenied: { type: 'internal', message: 'Internal server error' },
  internal: { type: 'internal', message: 'Internal server error' }
} satisfies Record<type_error_lambda_fromDynamo_reason, type_error_lambda>;

/** Wrap an unknown caught value as a Dynamo-domain error for neverthrow flows. */
export function error_dynamo(error: unknown): type_error_dynamo {
  return { type: 'dynamo', error };
}

/** Convert DynamoDB Toolbox or AWS SDK errors into a safe lambda error for API responses. */
export function error_lambda_fromDynamo(
  e: type_error_dynamo,
  options: type_error_lambda_fromDynamo_options = {}
): type_error_lambda {
  if (e.error instanceof DynamoDBToolboxError) {
    return fromReason(getToolboxReason(e.error), options, toolboxField(e.error, options.includeToolboxPath));
  }
  return fromReason(getAwsReason(e.error), options);
}

/** Apply endpoint overrides and build the concrete lambda error object. */
function fromReason(
  reason: type_error_lambda_fromDynamo_reason,
  options: type_error_lambda_fromDynamo_options,
  defaults: Partial<type_error_lambda> = {}
): type_error_lambda {
  const base = { ...defaultErrors[reason], ...defaults };
  const override = options[reason];

  const args: type_error_lambda = { ...base, ...override };

  switch (args.type) {
    case 'badRequest':
      return error_lambda_badRequest(args.message, args.fieldName, args.fieldValue);
    case 'unauthorized':
      return error_lambda_unauthorized(args.message);
    case 'forbidden':
      return error_lambda_forbidden(args.message);
    case 'notFound':
      return error_lambda_notFound(args.message, args.fieldName, args.fieldValue);
    case 'conflict':
      return error_lambda_conflict(args.message, args.fieldName, args.fieldValue);
    default:
      return error_lambda_internal(args.message);
  }
}

/** Classify errors produced by Toolbox before sending, or while formatting returned items. */
function getToolboxReason(error: DynamoDBToolboxError): type_error_lambda_fromDynamo_reason {
  if (error.code.startsWith('parsing.') || error.code === 'actions.parsePrimaryKey.invalidKeyPart') {
    return 'invalidInput';
  }

  if (error.code.startsWith('formatter.') || error.code.startsWith('schema.') || error.code.startsWith('entity.')) {
    return 'internal';
  }

  switch (error.code) {
    case 'actions.invalidCondition':
    case 'actions.invalidExpressionAttributePath':
    case 'queryCommand.invalidIndex':
    case 'queryCommand.invalidPartition':
    case 'queryCommand.invalidProjectionExpression':
    case 'queryCommand.invalidRange':
    case 'queryCommand.invalidReverseOption':
    case 'scanCommand.invalidProjectionExpression':
    case 'scanCommand.invalidSegmentOption':
    case 'batchGetCommand.invalidProjectionExpression':
    case 'options.invalidCapacityOption':
    case 'options.invalidClientRequestToken':
    case 'options.invalidConsistentOption':
    case 'options.invalidIndexOption':
    case 'options.invalidLimitOption':
    case 'options.invalidMaxPagesOption':
    case 'options.invalidMetricsOption':
    case 'options.invalidReturnValuesOption':
    case 'options.invalidReturnValuesOnConditionFalseOption':
    case 'options.invalidSelectOption':
      return 'invalidInput';

    case 'actions.incompleteAction':
    case 'actions.invalidAction':
    case 'actions.missingDocumentClient':
    case 'queryCommand.invalidTagEntitiesOption':
    case 'queryCommand.noEntityMatched':
    case 'scanCommand.noEntityMatched':
    case 'options.invalidEntityAttrFilterOption':
    case 'options.invalidNoEntityMatchBehaviorOption':
    case 'options.invalidShowEntityAttrOption':
    case 'options.invalidTableNameOption':
    case 'options.unknownOption':
    case 'table.missingTableName':
      return 'internal';

    default:
      return 'internal';
  }
}

function toolboxField(error: DynamoDBToolboxError, includeToolboxPath: boolean | undefined) {
  if (!includeToolboxPath || typeof error.path !== 'string') return {};
  return { fieldName: error.path, fieldValue: error.message };
}

// ---- AWS ---- //
/** Classify AWS SDK / DynamoDB service errors that bubble out of Toolbox send calls. */
function getAwsReason(error: unknown): type_error_lambda_fromDynamo_reason {
  switch (getErrorName(error)) {
    case 'ConditionalCheckFailedException':
      return 'conditionalCheckFailed';
    case 'TransactionCanceledException':
      return getTransactionReason(error);
    case 'TransactionConflictException':
    case 'ReplicatedWriteConflictException':
    case 'IdempotentParameterMismatchException':
    case 'ItemCollectionSizeLimitExceededException':
      return 'transactionConflict';
    case 'ValidationException':
      return 'invalidInput';
    case 'ResourceNotFoundException':
      return 'resourceNotFound';
    case 'ProvisionedThroughputExceededException':
    case 'RequestLimitExceeded':
    case 'ThrottlingException':
    case 'ThrottlingError':
      return 'throttled';
    case 'AccessDeniedException':
    case 'ExpiredTokenException':
    case 'IncompleteSignatureException':
    case 'InvalidSignatureException':
    case 'UnrecognizedClientException':
      return 'accessDenied';
    default:
      return 'internal';
  }
}

/** Pick the most useful public reason from DynamoDB transaction cancellation details. */
function getTransactionReason(error: unknown): type_error_lambda_fromDynamo_reason {
  const cancellationReasons = getCancellationReasons(error);

  if (cancellationReasons.some((reason) => reason === 'ConditionalCheckFailed')) {
    return 'conditionalCheckFailed';
  }

  if (cancellationReasons.some((reason) => reason === 'TransactionConflict')) {
    return 'transactionConflict';
  }

  if (cancellationReasons.some((reason) => reason === 'ValidationError')) {
    return 'invalidInput';
  }

  if (
    cancellationReasons.some((reason) =>
      ['ProvisionedThroughputExceeded', 'RequestLimitExceeded', 'ThrottlingError'].includes(reason)
    )
  ) {
    return 'throttled';
  }

  return 'internal';
}

function getCancellationReasons(error: unknown): string[] {
  if (!isRecord(error)) return [];
  const cancellationReasons = error.CancellationReasons ?? error.cancellationReasons;
  if (!Array.isArray(cancellationReasons)) return [];

  return cancellationReasons
    .map((reason) => (isRecord(reason) && typeof reason.Code === 'string' ? reason.Code : undefined))
    .filter((reason) => reason !== undefined);
}
