import {
  error_lambda_badRequest,
  error_lambda_conflict,
  error_lambda_forbidden,
  error_lambda_internal,
  error_lambda_notFound,
  error_lambda_unauthorized,
  type type_error_lambda
} from '$lambda/errors.js';

/** Error wrapper for failures that happen while doing SES SDK work. */
export type type_error_ses = { type: 'ses'; error: unknown };

/** Internal reason used before converting SES errors into public lambda errors. */
export type type_error_lambda_fromSes_reason =
  | 'invalidInput'
  | 'messageRejected'
  | 'identityNotVerified'
  | 'notFound'
  | 'alreadyExists'
  | 'conflict'
  | 'throttled'
  | 'accessDenied'
  | 'internal';

/** Per-reason public response override for endpoint-specific privacy and status choices. */
type type_error_lambda_fromSes_override = { message?: string } | Partial<type_error_lambda>;

/** Options for converting SES errors to lambda errors. */
export type type_error_lambda_fromSes_options = Partial<
  Record<type_error_lambda_fromSes_reason, type_error_lambda_fromSes_override>
>;

const defaultErrors = {
  invalidInput: { type: 'badRequest', message: 'Invalid SES request' },
  messageRejected: { type: 'badRequest', message: 'Email message was rejected' },
  identityNotVerified: { type: 'internal', message: 'Internal server error' },
  notFound: { type: 'internal', message: 'Internal server error' },
  alreadyExists: { type: 'conflict', message: 'SES resource already exists' },
  conflict: { type: 'conflict', message: 'The request conflicts with the current SES resource state' },
  throttled: { type: 'internal', message: 'Internal server error' },
  accessDenied: { type: 'internal', message: 'Internal server error' },
  internal: { type: 'internal', message: 'Internal server error' }
} satisfies Record<type_error_lambda_fromSes_reason, type_error_lambda>;

/** Wrap an unknown caught value as an SES-domain error for neverthrow flows. */
export function error_ses(error: unknown): type_error_ses {
  return { type: 'ses', error };
}

/** Convert AWS SDK SES errors into a safe lambda error for API responses. */
export function error_lambda_fromSes(
  e: type_error_ses,
  options: type_error_lambda_fromSes_options = {}
): type_error_lambda {
  return fromReason(getSesReason(e.error), options);
}

/** Apply endpoint overrides and build the concrete lambda error object. */
function fromReason(reason: type_error_lambda_fromSes_reason, options: type_error_lambda_fromSes_options) {
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

/** Classify AWS SDK / SES service errors. */
function getSesReason(error: unknown): type_error_lambda_fromSes_reason {
  switch (getErrorName(error)) {
    case 'BadRequestException':
    case 'CustomVerificationEmailInvalidContentException':
    case 'InvalidParameterValue':
    case 'InvalidPolicyException':
    case 'InvalidRenderingParameterException':
    case 'InvalidSnsTopic':
    case 'InvalidSnsTopicException':
    case 'InvalidTemplateException':
    case 'InvalidTrackingOptionsException':
    case 'MissingRenderingAttributeException':
      return 'invalidInput';

    case 'MessageRejected':
    case 'MessageRejectedException':
      return 'messageRejected';

    case 'ConfigurationSetDoesNotExist':
    case 'ConfigurationSetDoesNotExistException':
    case 'NotFoundException':
    case 'RuleSetDoesNotExist':
    case 'TemplateDoesNotExist':
    case 'TemplateDoesNotExistException':
      return 'notFound';

    case 'AlreadyExistsException':
    case 'ConfigurationSetAlreadyExists':
    case 'RuleSetNameAlreadyExists':
    case 'TemplateNameAlreadyExists':
      return 'alreadyExists';

    case 'AccountSendingPausedException':
    case 'ConfigurationSetSendingPausedException':
    case 'ConcurrentModificationException':
    case 'ConflictException':
    case 'MailFromDomainNotVerified':
    case 'MailFromDomainNotVerifiedException':
    case 'SendingPausedException':
      return 'conflict';

    case 'FromEmailAddressNotVerified':
    case 'IdentityNotVerifiedException':
      return 'identityNotVerified';

    case 'LimitExceededException':
    case 'Throttling':
    case 'ThrottlingException':
    case 'TooManyRequestsException':
      return 'throttled';

    case 'AccessDeniedException':
    case 'AccountSuspendedException':
    case 'ExpiredTokenException':
    case 'InvalidClientTokenId':
    case 'InvalidSignatureException':
    case 'ProductionAccessNotGrantedException':
    case 'SignatureDoesNotMatch':
    case 'UnauthorizedException':
      return 'accessDenied';

    case 'InternalFailure':
    case 'InternalServerError':
    case 'InternalServiceError':
    case 'ServiceUnavailable':
      return 'internal';

    default:
      return getHttpStatusReason(error);
  }
}

function getHttpStatusReason(error: unknown): type_error_lambda_fromSes_reason {
  const status = getHttpStatusCode(error);

  if (status === 400) return 'invalidInput';
  if (status === 401) return 'accessDenied';
  if (status === 403) return 'accessDenied';
  if (status === 404) return 'notFound';
  if (status === 409 || status === 412) return 'conflict';
  if (status === 429) return 'throttled';

  return 'internal';
}

function getErrorName(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;

  const name = error.name;
  if (typeof name === 'string') return name;

  const code = error.code ?? error.Code;
  if (typeof code === 'string') return code;

  return undefined;
}

function getHttpStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const metadata = error.$metadata;
  if (!isRecord(metadata)) return undefined;
  return typeof metadata.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
