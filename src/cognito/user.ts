import type {
  AdminGetUserCommandOutput,
  AttributeType,
  CognitoIdentityProviderServiceException
} from '@aws-sdk/client-cognito-identity-provider';
import { AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { getCognitoClient } from './client.js';
import { ResultAsync } from 'neverthrow';
import { error_cognito } from './errors.js';

export type UserRes = Omit<AdminGetUserCommandOutput, 'UserAttributes'> & { UserAttributes: Record<string, string> };

/**
 * Performs an AdminGetUserCommand and extracts the user attributes into an object
 */
export const getUserDetails = ResultAsync.fromThrowable(
  async (username: string) => {
    const UserPoolId = process.env.COGNITO_USER_POOL_ID;
    const cognitoClient = getCognitoClient();
    const res = await cognitoClient.send(new AdminGetUserCommand({ UserPoolId, Username: username }));
    return {
      ...res,
      UserAttributes: extractAttributes(res.UserAttributes)
    } as UserRes;
  },
  (e) => error_cognito((e as CognitoIdentityProviderServiceException).name)
);

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
