import type {
  AdminGetUserCommandOutput,
  AttributeType,
  CognitoIdentityProviderServiceException
} from '@aws-sdk/client-cognito-identity-provider';
import { AdminGetUserCommand, AdminListGroupsForUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { ResultAsync } from 'neverthrow';

import { getCognitoClient } from './client.js';
import { error_cognito } from './errors.js';

export type type_userResponse = Omit<AdminGetUserCommandOutput, 'UserAttributes'> & {
  UserAttributes: Record<string, string>;
};

/**
 * Performs an AdminGetUserCommand and extracts the user attributes into an object
 */
export const getUserDetails = ResultAsync.fromThrowable(
  async (a: { username: string; userPoolId: string }) => {
    console.log('getUserDetails: Getting details for user: ', a.username);
    const cognitoClient = getCognitoClient();
    const res = await cognitoClient.send(new AdminGetUserCommand({ UserPoolId: a.userPoolId, Username: a.username }));
    return { ...res, UserAttributes: extractAttributes(res.UserAttributes) } as type_userResponse;
  },
  (e) => {
    console.error('getUserDetails:error:', e);
    return error_cognito(e as CognitoIdentityProviderServiceException);
  }
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

/**
 * Performs an AdminGetUserCommand and extracts the user attributes into an object
 */
export const getUserGroups = ResultAsync.fromThrowable(
  async (a: { username: string; userPoolId: string }) => {
    console.log('getUserGroups: Getting groups for user: ', a.username);
    const cognitoClient = getCognitoClient();
    const res = await cognitoClient.send(
      new AdminListGroupsForUserCommand({ UserPoolId: a.userPoolId, Username: a.username })
    );
    return res;
  },
  (e) => {
    console.error('getUserGroups:error:', e);
    return error_cognito(e as CognitoIdentityProviderServiceException);
  }
);
