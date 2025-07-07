import type {
  AdminGetUserCommandOutput,
  AttributeType,
  CognitoIdentityProviderServiceException
} from '@aws-sdk/client-cognito-identity-provider';
import { AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { getCognitoClient } from './client.js';
import { ok, ResultAsync } from 'neverthrow';
import type { type_error_cognito } from './errors.js';
import { cognitoErrorFromName } from './errors.js';

export type UserRes = Omit<AdminGetUserCommandOutput, 'UserAttributes'> & { UserAttributes: Record<string, string> };

/**
 * Gets the user details for a given username
 */
export function getUserDetails(username: string): ResultAsync<UserRes, type_error_cognito> {
  const UserPoolId = process.env.COGNITO_USER_POOL_ID;

  const cognitoClient = getCognitoClient();

  return ResultAsync.fromThrowable(
    () => cognitoClient.send(new AdminGetUserCommand({ UserPoolId, Username: username })),
    (e) => cognitoErrorFromName((e as CognitoIdentityProviderServiceException).name)
  )().andThen((res) => ok({ ...res, UserAttributes: extractAttributes(res.UserAttributes) }));
}

/**
 * @returns An object of attributes with their names as keys and values as values.
 */
export function extractAttributes(attrs: AttributeType[] | undefined) {
  const attributes: Record<string, string> = {};
  if (attrs) {
    for (const attr of attrs) {
      if (attr.Name && attr.Value) {
        attributes[attr.Name] = attr.Value;
      }
    }
  }
  return attributes;
}
