import {
  error_lambda_badRequest,
  error_lambda_conflict,
  error_lambda_forbidden,
  error_lambda_internal,
  error_lambda_notFound,
  error_lambda_unauthorized,
  type type_error_lambda
} from '$lambda/errors.js';

import { getErrorName, isRecord } from '../utils/errors.js';

/** Error wrapper for failures that happen while doing S3 SDK work. */
export type type_error_s3 = { type: 's3'; error: unknown };

/** Internal reason used before converting S3 errors into public lambda errors. */
export type type_error_lambda_fromS3_reason =
  | 'invalidInput'
  | 'objectNotFound'
  | 'bucketNotFound'
  | 'conflict'
  | 'throttled'
  | 'accessDenied'
  | 'internal';

/** Per-reason public response override for endpoint-specific privacy and status choices. */
type type_error_lambda_fromS3_override = { message?: string } | Partial<type_error_lambda>;

/** Options for converting S3 errors to lambda errors. */
export type type_error_lambda_fromS3_options = Partial<
  Record<type_error_lambda_fromS3_reason, type_error_lambda_fromS3_override>
>;

const defaultErrors = {
  invalidInput: { type: 'badRequest', message: 'Invalid S3 request' },
  objectNotFound: { type: 'notFound', message: 'S3 object not found' },
  bucketNotFound: { type: 'internal', message: 'Internal server error' },
  conflict: { type: 'conflict', message: 'The request conflicts with the current S3 resource state' },
  throttled: { type: 'internal', message: 'Internal server error' },
  accessDenied: { type: 'internal', message: 'Internal server error' },
  internal: { type: 'internal', message: 'Internal server error' }
} satisfies Record<type_error_lambda_fromS3_reason, type_error_lambda>;

/** Wrap an unknown caught value as an S3-domain error for neverthrow flows. */
export function error_s3(error: unknown): type_error_s3 {
  return { type: 's3', error };
}

/** Convert AWS SDK S3 errors into a safe lambda error for API responses. */
export function error_lambda_fromS3(
  e: type_error_s3,
  options: type_error_lambda_fromS3_options = {}
): type_error_lambda {
  const reason = getS3Reason(e.error);

  const base = defaultErrors[reason];
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

/** Returns true for normal S3 object-missing responses. */
export function is_s3_notFound(error: unknown): boolean {
  return getS3Reason(error) === 'objectNotFound';
}

/** Classify AWS SDK / S3 service errors. */
function getS3Reason(error: unknown): type_error_lambda_fromS3_reason {
  switch (getErrorName(error)) {
    case 'NoSuchKey':
    case 'NotFound':
    case 'NoSuchVersion':
      return 'objectNotFound';

    case 'NoSuchBucket':
    case 'NoSuchBucketPolicy':
    case 'NoSuchLifecycleConfiguration':
    case 'NoLoggingStatusForKey':
      return 'bucketNotFound';

    case 'AmbiguousGrantByEmailAddress':
    case 'BadDigest':
    case 'EntityTooLarge':
    case 'EntityTooSmall':
    case 'IncompleteBody':
    case 'IncorrectNumberOfFilesInPostRequest':
    case 'InlineDataTooLarge':
    case 'InvalidAddressingHeader':
    case 'InvalidArgument':
    case 'InvalidBucketName':
    case 'InvalidDigest':
    case 'InvalidLocationConstraint':
    case 'InvalidPart':
    case 'InvalidPartOrder':
    case 'InvalidPayer':
    case 'InvalidPolicyDocument':
    case 'InvalidRange':
    case 'InvalidRequest':
    case 'InvalidSOAPRequest':
    case 'InvalidStorageClass':
    case 'InvalidTargetBucketForLogging':
    case 'InvalidURI':
    case 'KeyTooLongError':
    case 'MalformedACLError':
    case 'MalformedPOSTRequest':
    case 'MalformedXML':
    case 'MaxMessageLengthExceeded':
    case 'MaxPostPreDataLengthExceededError':
    case 'MetadataTooLarge':
    case 'MissingAttachment':
    case 'MissingContentLength':
    case 'MissingRequestBodyError':
    case 'RequestIsNotMultiPartContent':
    case 'RequestTorrentOfBucketError':
    case 'NoSuchUpload':
      return 'invalidInput';

    case 'BucketAlreadyExists':
    case 'BucketAlreadyOwnedByYou':
    case 'BucketNotEmpty':
    case 'EncryptionTypeMismatch':
    case 'IdempotencyParameterMismatch':
    case 'IllegalVersioningConfigurationException':
    case 'InvalidBucketState':
    case 'InvalidEncryptionAlgorithmError':
    case 'InvalidObjectState':
    case 'InvalidWriteOffset':
    case 'ObjectAlreadyInActiveTierError':
    case 'ObjectNotInActiveTierError':
    case 'OperationAborted':
    case 'PreconditionFailed':
    case 'RestoreAlreadyInProgress':
    case 'TooManyParts':
      return 'conflict';

    case 'RequestLimitExceeded':
    case 'RequestTimeout':
    case 'ServiceUnavailable':
    case 'SlowDown':
    case 'Throttling':
    case 'ThrottlingException':
      return 'throttled';

    case 'AccessDenied':
    case 'AccountProblem':
    case 'AllAccessDisabled':
    case 'CredentialsNotSupported':
    case 'CrossLocationLoggingProhibited':
    case 'ExpiredToken':
    case 'InvalidAccessKeyId':
    case 'InvalidSecurity':
    case 'InvalidToken':
    case 'MethodNotAllowed':
    case 'MissingSecurityElement':
    case 'MissingSecurityHeader':
    case 'NotSignedUp':
    case 'SignatureDoesNotMatch':
      return 'accessDenied';

    case 'AuthorizationHeaderMalformed':
    case 'InternalError':
    case 'NotImplemented':
    case 'PermanentRedirect':
    case 'Redirect':
    case 'RequestTimeTooSkewed':
    case 'TemporaryRedirect':
      return 'internal';

    default:
      return getHttpStatusReason(error);
  }
}

function getHttpStatusReason(error: unknown): type_error_lambda_fromS3_reason {
  const status = getHttpStatusCode(error);

  if (status === 400) return 'invalidInput';
  if (status === 404) return 'objectNotFound';
  if (status === 409 || status === 412) return 'conflict';
  if (status === 429 || status === 503) return 'throttled';
  if (status === 401 || status === 403) return 'accessDenied';

  return 'internal';
}

function getHttpStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const metadata = error.$metadata;
  if (!isRecord(metadata)) return undefined;
  return typeof metadata.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined;
}
