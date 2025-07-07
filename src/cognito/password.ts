import { ChangePasswordCommand } from '@aws-sdk/client-cognito-identity-provider';
import type {
  type_error_cognito_auth,
  type_error_cognito_forbidden,
  type_error_cognito_input,
  type_error_cognito_internal,
  type_error_cognito_notFound,
  type_error_cognito_passwordPolicy,
  type_error_cognito_tooManyRequests
} from './errors.js';
import { cognitoErrorFromName, error_cognito_input } from './errors.js';
import { getCognitoClient } from './client.js';
import { ResultAsync } from 'neverthrow';

export type error_cognito_changePassword =
  | type_error_cognito_forbidden
  | type_error_cognito_internal
  | type_error_cognito_input
  | type_error_cognito_auth
  | type_error_cognito_notFound
  | type_error_cognito_tooManyRequests
  | type_error_cognito_passwordPolicy;

/**
 * Changes a users password
 * Wraps the cognito sdk to use neverthrow
 */
export const changePassword = ResultAsync.fromThrowable(
  async (accessToken: string, oldPassword: string, newPassword: string) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: oldPassword,
        ProposedPassword: newPassword
      })
    );
  },
  (e) => {
    console.error('AWS error with change password', e);
    switch ((e as { name: string }).name) {
      case 'NotAuthorizedException':
        return error_cognito_input('oldPassword', 'Incorrect password');
      default:
        return cognitoErrorFromName((e as { name: string }).name) as error_cognito_changePassword;
    }
  }
);
