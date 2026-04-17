import {
  error_lambda_badRequest,
  error_lambda_conflict,
  error_lambda_forbidden,
  error_lambda_internal,
  error_lambda_notFound,
  error_lambda_unauthorized,
  type type_error_lambda
} from '$lambda/errors.js';

/** Error wrapper for failures that happen while doing Cognito SDK work. */
export type type_error_cognito = { type: 'cognito'; error: unknown };

/** Internal reason used before converting Cognito errors into public lambda errors. */
export type type_error_lambda_fromCognito_reason =
  | 'auth'
  | 'forbidden'
  | 'invalidInput'
  | 'userNotFound'
  | 'resourceNotFound'
  | 'tooManyRequests'
  | 'passwordPolicy'
  | 'passwordHistory'
  | 'passwordResetRequired'
  | 'codeExpired'
  | 'codeMismatch'
  | 'delivery'
  | 'userExists'
  | 'conflict'
  | 'internal';

/** Per-reason public response override for endpoint-specific privacy and status choices. */
type type_error_lambda_fromCognito_override = { message?: string } | Partial<type_error_lambda>;

/** Options for converting Cognito errors to lambda errors. */
export type type_error_lambda_fromCognito_options = Partial<
  Record<type_error_lambda_fromCognito_reason, type_error_lambda_fromCognito_override>
>;

const defaultErrors = {
  auth: { type: 'unauthorized', message: 'Not authorized' },
  forbidden: { type: 'forbidden', message: 'Forbidden' },
  invalidInput: { type: 'badRequest', message: 'There is an issue with your request' },
  userNotFound: { type: 'notFound', message: 'User not found' },
  resourceNotFound: { type: 'notFound', message: 'Resource not found' },
  tooManyRequests: { type: 'badRequest', message: 'Too many requests' },
  passwordPolicy: { type: 'badRequest', message: 'Password does not meet policy requirements' },
  passwordHistory: { type: 'conflict', message: 'Password was used recently' },
  passwordResetRequired: { type: 'badRequest', message: 'Password reset required' },
  codeExpired: { type: 'badRequest', message: 'Code expired' },
  codeMismatch: { type: 'badRequest', message: 'Invalid code' },
  delivery: { type: 'internal', message: 'Internal server error' },
  userExists: { type: 'conflict', message: 'User already exists' },
  conflict: { type: 'conflict', message: 'The request conflicts with the current Cognito resource state' },
  internal: { type: 'internal', message: 'Internal server error' }
} satisfies Record<type_error_lambda_fromCognito_reason, type_error_lambda>;

/** Wrap an unknown caught value as a Cognito-domain error for neverthrow flows. */
export function error_cognito(error: unknown): type_error_cognito {
  return { type: 'cognito', error };
}

/** Convert AWS SDK Cognito errors into a safe lambda error for API responses. */
export function error_lambda_fromCognito(
  e: type_error_cognito,
  options: type_error_lambda_fromCognito_options = {}
): type_error_lambda {
  return fromReason(getCognitoReason(e.error), options);
}

/** Apply endpoint overrides and build the concrete lambda error object. */
function fromReason(
  reason: type_error_lambda_fromCognito_reason,
  options: type_error_lambda_fromCognito_options
): type_error_lambda {
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

/** Classify AWS SDK / Cognito service errors. */
function getCognitoReason(error: unknown): type_error_lambda_fromCognito_reason {
  switch (getErrorName(error)) {
    case 'NotAuthorizedException':
    case 'UnauthorizedException':
    case 'UserNotConfirmedException':
    case 'RefreshTokenReuseException':
      return 'auth';

    case 'AccessDeniedException':
    case 'ForbiddenException':
      return 'forbidden';

    case 'InvalidParameterException':
    case 'InvalidOAuthFlowException':
    case 'ScopeDoesNotExistException':
    case 'UnsupportedIdentityProviderException':
    case 'UnsupportedTokenTypeException':
      return 'invalidInput';

    case 'UserNotFoundException':
      return 'userNotFound';

    case 'ResourceNotFoundException':
    case 'MFAMethodNotFoundException':
    case 'SoftwareTokenMFANotFoundException':
    case 'WebAuthnChallengeNotFoundException':
      return 'resourceNotFound';

    case 'LimitExceededException':
    case 'TooManyFailedAttemptsException':
    case 'TooManyRequestsException':
      return 'tooManyRequests';

    case 'InvalidPasswordException':
      return 'passwordPolicy';

    case 'PasswordHistoryPolicyViolationException':
      return 'passwordHistory';

    case 'PasswordResetRequiredException':
      return 'passwordResetRequired';

    case 'ExpiredCodeException':
      return 'codeExpired';

    case 'CodeMismatchException':
      return 'codeMismatch';

    case 'CodeDeliveryFailureException':
      return 'delivery';

    case 'AliasExistsException':
    case 'DeviceKeyExistsException':
    case 'DuplicateProviderException':
    case 'GroupExistsException':
    case 'ManagedLoginBrandingExistsException':
    case 'TermsExistsException':
    case 'UsernameExistsException':
      return 'userExists';

    case 'ConcurrentModificationException':
    case 'PreconditionNotMetException':
    case 'UnsupportedUserStateException':
      return 'conflict';

    case 'EnableSoftwareTokenMFAException':
    case 'FeatureUnavailableInTierException':
    case 'InternalErrorException':
    case 'InternalServerException':
    case 'InvalidEmailRoleAccessPolicyException':
    case 'InvalidLambdaResponseException':
    case 'InvalidSmsRoleAccessPolicyException':
    case 'InvalidSmsRoleTrustRelationshipException':
    case 'InvalidUserPoolConfigurationException':
    case 'TierChangeNotAllowedException':
    case 'UnexpectedLambdaException':
    case 'UnsupportedOperationException':
    case 'UserImportInProgressException':
    case 'UserLambdaValidationException':
    case 'UserPoolAddOnNotEnabledException':
    case 'UserPoolTaggingException':
    case 'WebAuthnClientMismatchException':
    case 'WebAuthnConfigurationMissingException':
    case 'WebAuthnCredentialNotSupportedException':
    case 'WebAuthnNotEnabledException':
    case 'WebAuthnOriginNotAllowedException':
    case 'WebAuthnRelyingPartyMismatchException':
      return 'internal';

    default:
      return getHttpStatusReason(error);
  }
}

function getHttpStatusReason(error: unknown): type_error_lambda_fromCognito_reason {
  const status = getHttpStatusCode(error);

  if (status === 400) return 'invalidInput';
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'resourceNotFound';
  if (status === 409 || status === 412) return 'conflict';
  if (status === 429) return 'tooManyRequests';

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
