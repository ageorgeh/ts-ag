import {
  error_lambda_badRequest,
  error_lambda_conflict,
  error_lambda_internal,
  error_lambda_unauthorized,
  error_lambda_forbidden,
  error_lambda_notFound
} from '$lambda/errors.js';

export const error_cognito_forbidden = {
  type: 'cognito_forbidden' as const
};
export const error_cognito_internal = {
  type: 'cognito_internal' as const
};
export const error_cognito_role = {
  type: 'cognito_role' as const
};
export const error_cognito_input = {
  type: 'cognito_input' as const
};
export const error_cognito_auth = {
  type: 'cognito_auth' as const
};
export const error_cognito_notFound = {
  type: 'cognito_notFound' as const
};
export const error_cognito_userNotFound = {
  type: 'cognito_userNotFound' as const
};
export const error_cognito_tooManyRequests = {
  type: 'cognito_tooManyRequests' as const
};
export const error_cognito_passwordPolicy = {
  type: 'cognito_passwordPolicy' as const
};
export const error_cognito_passwordHistory = {
  type: 'cognito_passwordHistory' as const
};
export const error_cognito_passwordResetRequired = {
  type: 'cognito_passwordResetRequired' as const
};

// Confirm forgot password
export const error_cognito_codeExpired = {
  type: 'cognito_codeExpired' as const
};
export const error_cognito_codeMismatch = {
  type: 'cognito_codeMismatch' as const
};

// Forgot password
export const error_cognito_delivery = {
  type: 'cognito_delivery' as const
};
// Confirm signup
export const error_cognito_userExists = {
  type: 'cognito_userExists' as const
};

export type type_error_cognito_forbidden = typeof error_cognito_forbidden;
export type type_error_cognito_internal = typeof error_cognito_internal;
export type type_error_cognito_role = typeof error_cognito_role;
export type type_error_cognito_input = typeof error_cognito_input;
export type type_error_cognito_auth = typeof error_cognito_auth;
export type type_error_cognito_notFound = typeof error_cognito_notFound;
export type type_error_cognito_userNotFound = typeof error_cognito_userNotFound;
export type type_error_cognito_tooManyRequests = typeof error_cognito_tooManyRequests;
export type type_error_cognito_passwordPolicy = typeof error_cognito_passwordPolicy;
export type type_error_cognito_passwordHistory = typeof error_cognito_passwordHistory;
export type type_error_cognito_passwordResetRequired = typeof error_cognito_passwordResetRequired;
export type type_error_cognito_codeExpired = typeof error_cognito_codeExpired;
export type type_error_cognito_codeMismatch = typeof error_cognito_codeMismatch;
export type type_error_cognito_delivery = typeof error_cognito_delivery;
export type type_error_cognito_userExists = typeof error_cognito_userExists;

export type type_error_cognito =
  | type_error_cognito_forbidden
  | type_error_cognito_internal
  | type_error_cognito_role
  | type_error_cognito_input
  | type_error_cognito_auth
  | type_error_cognito_notFound
  | type_error_cognito_userNotFound
  | type_error_cognito_tooManyRequests
  | type_error_cognito_passwordPolicy
  | type_error_cognito_passwordHistory
  | type_error_cognito_passwordResetRequired
  | type_error_cognito_codeExpired
  | type_error_cognito_codeMismatch
  | type_error_cognito_delivery
  | type_error_cognito_userExists;

const awsToCognitoErrorMap = {
  ForbiddenException: error_cognito_forbidden,
  NotAuthorizedException: error_cognito_auth,
  UserNotConfirmedException: error_cognito_auth,
  UserNotFoundException: error_cognito_userNotFound,
  ResourceNotFoundException: error_cognito_notFound,
  InvalidParameterException: error_cognito_input,
  InvalidPasswordException: error_cognito_passwordPolicy,
  PasswordHistoryPolicyViolationException: error_cognito_passwordHistory,
  PasswordResetRequiredException: error_cognito_passwordResetRequired,
  LimitExceededException: error_cognito_tooManyRequests,
  TooManyRequestsException: error_cognito_tooManyRequests,
  InternalErrorException: error_cognito_internal,
  // Confirm forgot password
  CodeMismatchException: error_cognito_codeMismatch,
  ExpiredCodeException: error_cognito_codeExpired,
  TooManyFailedAttemptsException: error_cognito_tooManyRequests,
  UnexpectedLambdaException: error_cognito_internal,
  InvalidLambdaResponseException: error_cognito_internal,
  UserLambdaValidationException: error_cognito_internal,
  // Forgot password
  InvalidEmailRoleAccessPolicyException: error_cognito_role,
  InvalidSmsRoleAccessPolicyException: error_cognito_role,
  InvalidSmsRoleTrustRelationshipException: error_cognito_role,
  CodeDelliveryFailureException: error_cognito_delivery,
  // Confirm signup
  AliasExistsException: error_cognito_userExists,
  // Login
  InvalidUserPoolConfigurationException: error_cognito_internal,
  MFAMethodNotFoundException: error_cognito_notFound,
  UnsupportedOperationException: error_cognito_internal,
  // Reset password
  SoftwareTokenMFANotFoundException: error_cognito_notFound,
  // Sign up
  UsernameExistsException: error_cognito_userExists
} as const;

/**
 * Gets a generic error from the name of the aws error
 */
export function error_cognito(error: Error): type_error_cognito {
  const type = error.name as keyof typeof awsToCognitoErrorMap;
  if (awsToCognitoErrorMap[type] === undefined) console.warn(`${type} is not present in the cognito error map`);

  console.error(`Cognito error: ${type}`, error);

  return awsToCognitoErrorMap[type] || error_cognito_internal;
}

/**
 * Converts a cognito error to a lambda error.
 * Basically just for narrowing it down a bit
 */
export function error_lambda_fromCognito(e: type_error_cognito) {
  switch (e.type) {
    case 'cognito_auth':
      return error_lambda_unauthorized('Not authorized');
    case 'cognito_forbidden':
      return error_lambda_forbidden('Forbidden');
    case 'cognito_internal':
    case 'cognito_role':
      return error_lambda_internal('Internal server error');
    case 'cognito_input':
      return error_lambda_badRequest('There is an issue with your request');
    case 'cognito_notFound':
      return error_lambda_notFound('Resource not found');
    case 'cognito_userNotFound':
      return error_lambda_notFound('User not found');
    case 'cognito_tooManyRequests':
      return error_lambda_badRequest('Too many requests');
    case 'cognito_passwordPolicy':
      return error_lambda_badRequest('Password does not meet policy requirements');
    case 'cognito_passwordHistory':
      return error_lambda_conflict('Password was used recently');
    case 'cognito_passwordResetRequired':
      return error_lambda_badRequest('Password reset required');
    case 'cognito_delivery':
      return error_lambda_internal('Delivery failed for the provided email or phone number');
    default:
      return error_lambda_internal('Unknown error');
  }
}
