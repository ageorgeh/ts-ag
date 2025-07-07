import {
  badRequestError,
  conflictError,
  internalServerError,
  unauthorizedError,
  forbiddenError as lambdaForbiddenError,
  notFoundError as lambdaNotFoundError
} from '$lambda/errors.js';

export const error_cognito_forbidden = {
  type: 'cognito_forbidden' as const
};
export const error_cognito_internal = {
  type: 'cognito_internal' as const
};
export const error_cognito_input = (field: string, value: string) => ({
  type: 'cognito_input' as const,
  fieldName: field,
  fieldValue: value
});
export const error_cognito_auth = {
  type: 'cognito_auth' as const
};
export const error_cognito_notFound = {
  type: 'cognito_notFound' as const
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

export type type_error_cognito_forbidden = typeof error_cognito_forbidden;
export type type_error_cognito_internal = typeof error_cognito_internal;
export type type_error_cognito_input = ReturnType<typeof error_cognito_input>;
export type type_error_cognito_auth = typeof error_cognito_auth;
export type type_error_cognito_notFound = typeof error_cognito_notFound;
export type type_error_cognito_tooManyRequests = typeof error_cognito_tooManyRequests;
export type type_error_cognito_passwordPolicy = typeof error_cognito_passwordPolicy;
export type type_error_cognito_passwordHistory = typeof error_cognito_passwordHistory;
export type type_error_cognito_passwordResetRequired = typeof error_cognito_passwordResetRequired;

export type type_error_cognito =
  | type_error_cognito_forbidden
  | type_error_cognito_internal
  | type_error_cognito_input
  | type_error_cognito_auth
  | type_error_cognito_notFound
  | type_error_cognito_tooManyRequests
  | type_error_cognito_passwordPolicy
  | type_error_cognito_passwordHistory
  | type_error_cognito_passwordResetRequired;

const awsToCognitoErrorMap = {
  ForbiddenException: error_cognito_forbidden,
  NotAuthorizedException: error_cognito_auth,
  UserNotConfirmedException: error_cognito_auth,
  UserNotFoundException: error_cognito_notFound,
  ResourceNotFoundException: error_cognito_notFound,
  InvalidParameterException: error_cognito_input('test', 'testingValue'),
  InvalidPasswordException: error_cognito_passwordPolicy,
  PasswordHistoryPolicyViolationException: error_cognito_passwordHistory,
  PasswordResetRequiredException: error_cognito_passwordResetRequired,
  LimitExceededException: error_cognito_tooManyRequests,
  TooManyRequestsException: error_cognito_tooManyRequests,
  InternalErrorException: error_cognito_internal
};
/**
 * Gets a generic error from the name of the aws error
 */
export function cognitoErrorFromName(type: string) {
  if (awsToCognitoErrorMap[type as keyof typeof awsToCognitoErrorMap] === undefined)
    console.warn(`${type} is not present in the cognito error map`);

  return awsToCognitoErrorMap[type as keyof typeof awsToCognitoErrorMap] || error_cognito_internal;
}

/**
 * Converts a cognito error to a lambda error.
 * Basically just for narrowing it down a bit
 */
export function cognitoToLambdaError(e: type_error_cognito) {
  switch (e.type) {
    case 'cognito_auth':
      return unauthorizedError('Not authorized');
    case 'cognito_forbidden':
      return lambdaForbiddenError('Forbidden');
    case 'cognito_internal':
      return internalServerError('Internal server error');
    case 'cognito_input':
      return badRequestError(`Invalid input for field ${e.fieldName}`, e.fieldName, e.fieldValue);
    case 'cognito_notFound':
      return lambdaNotFoundError('Resource not found');
    case 'cognito_tooManyRequests':
      return badRequestError('Too many requests');
    case 'cognito_passwordPolicy':
      return badRequestError('Password does not meet policy requirements');
    case 'cognito_passwordHistory':
      return conflictError('Password was used recently');
    case 'cognito_passwordResetRequired':
      return badRequestError('Password reset required');
    default:
      return internalServerError('Unknown error');
  }
}
