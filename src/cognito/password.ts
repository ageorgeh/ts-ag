import {
  AdminInitiateAuthCommand,
  ChangePasswordCommand,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  GlobalSignOutCommand,
  RespondToAuthChallengeCommand,
  SignUpCommand
} from '@aws-sdk/client-cognito-identity-provider';
import type { type_error_cognito } from './errors.js';
import { error_cognito, error_cognito_auth } from './errors.js';
import { getCognitoClient } from './client.js';
import { ResultAsync } from 'neverthrow';
import { createHmac } from 'crypto';

/**
 * Computes Cognito secret hash used for client-side authentication flows.
 *
 * @param username - Cognito username or alias.
 * @param clientId - Cognito app client ID.
 * @param clientSecret - Cognito app client secret.
 */
export function computeSecretHash(username: string, clientId: string, clientSecret: string): string {
  console.log('computeSecretHash: ', username, clientId, clientSecret);
  return createHmac('SHA256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

// ---- Change password ---- //

/**
 * Changes a user's password given a valid access token.
 *
 * @param accessToken - Access token for the authenticated user.
 * @param oldPassword - Current password.
 * @param newPassword - New password to set.
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
    console.error('ChangePasswordCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Confirm Forgot password ---- //

/**
 * Completes a forgot-password flow by submitting the confirmation code and new password.
 *
 * @param a.username - Cognito username or alias.
 * @param a.confirmationCode - Code sent by Cognito to the user.
 * @param a.newPassword - New password to set.
 * @param a.clientId - Cognito app client ID.
 * @param a.clientSecret - Cognito app client secret.
 */
export const confirmForgotPassword = ResultAsync.fromThrowable(
  (a: { username: string; confirmationCode: string; newPassword: string; clientId: string; clientSecret: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new ConfirmForgotPasswordCommand({
        ClientId: a.clientId,
        Username: a.username,
        ConfirmationCode: a.confirmationCode,
        Password: a.newPassword,
        SecretHash: computeSecretHash(a.username, a.clientId, a.clientSecret)
      })
    );
  },
  (e) => {
    console.error('ConfirmForgotPasswordCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Confirm Signup ---- //

/**
 * Confirms a user's signup using the confirmation code sent by Cognito.
 *
 * @param a.username - Cognito username or alias.
 * @param a.confirmationCode - Code sent to the user after signup.
 * @param a.clientId - Cognito app client ID.
 * @param a.clientSecret - Cognito app client secret.
 */
export const confirmSignup = ResultAsync.fromThrowable(
  (a: { username: string; confirmationCode: string; clientId: string; clientSecret: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new ConfirmSignUpCommand({
        ClientId: a.clientId,
        Username: a.username,
        ConfirmationCode: a.confirmationCode,
        SecretHash: computeSecretHash(a.username, a.clientId, a.clientSecret)
      })
    );
  },
  (e) => {
    console.error('ConfirmSignUpCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Forgot password ---- //

/**
 * Starts a forgot-password flow by sending a reset code to the user.
 *
 * @param a.username - Cognito username or alias.
 * @param a.clientId - Cognito app client ID.
 * @param a.clientSecret - Cognito app client secret.
 */
export const forgotPassword = ResultAsync.fromThrowable(
  (a: { username: string; clientId: string; clientSecret: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new ForgotPasswordCommand({
        ClientId: a.clientId,
        Username: a.username,
        SecretHash: computeSecretHash(a.username, a.clientId, a.clientSecret)
      })
    );
  },
  (e) => {
    console.error('ForgotPasswordCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Login ---- //

/**
 * Signs a user in with ADMIN_USER_PASSWORD_AUTH.
 *
 * @param a.username - Cognito username or alias.
 * @param a.password - User password.
 * @param a.clientId - Cognito app client ID.
 * @param a.clientSecret - Cognito app client secret.
 * @param a.userPoolId - Cognito user pool ID.
 */
export const login = ResultAsync.fromThrowable(
  (a: { username: string; password: string; clientId: string; clientSecret: string; userPoolId: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new AdminInitiateAuthCommand({
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        ClientId: a.clientId,
        UserPoolId: a.userPoolId,
        AuthParameters: {
          USERNAME: a.username,
          PASSWORD: a.password,
          SECRET_HASH: computeSecretHash(a.username, a.clientId, a.clientSecret)
        }
      })
    );
  },
  (e) => {
    console.error('AdminInitiateAuthCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Refresh token ---- //

/**
 * Exchanges a refresh token for new tokens.
 *
 * @param a.username - Cognito username or alias used to compute secret hash.
 * @param a.refreshToken - Refresh token to exchange.
 * @param a.clientId - Cognito app client ID.
 * @param a.clientSecret - Cognito app client secret.
 * @param a.userPoolId - Cognito user pool ID.
 */
export const refreshTokens = ResultAsync.fromThrowable(
  (a: { username: string; refreshToken: string; clientId: string; clientSecret: string; userPoolId: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new AdminInitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: a.clientId,
        UserPoolId: a.userPoolId,
        AuthParameters: {
          REFRESH_TOKEN: a.refreshToken,
          SECRET_HASH: computeSecretHash(a.username, a.clientId, a.clientSecret)
        }
      })
    );
  },
  (e) => {
    console.error('refreshTokens: AdminInitiateAuthCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Logout ---- //
/**
 * Globally signs out a user by invalidating all refresh tokens.
 *
 * @param accessToken - Access token for the authenticated user.
 */
export const logout = ResultAsync.fromThrowable(
  (accessToken: string) => {
    const cognitoClient = getCognitoClient();
    // GlobalSignOut invalidates all refresh tokens associated with user
    return cognitoClient.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
  },
  (e) => {
    console.error('GlobalSignOutCommand error', e);
    return error_cognito(e as Error);
  }
);

// ---- Reset password ---- //
/**
 * Completes a NEW_PASSWORD_REQUIRED challenge for users who must set a new password.
 *
 * @param a.session - Session returned from the auth challenge.
 * @param a.newPassword - New password to set.
 * @param a.username - Cognito username or alias.
 * @param a.clientId - Cognito app client ID.
 * @param a.clientSecret - Cognito app client secret.
 */
export const resetPassword = ResultAsync.fromThrowable(
  (a: { session: string; newPassword: string; username: string; clientId: string; clientSecret: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new RespondToAuthChallengeCommand({
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        ClientId: a.clientId,
        Session: a.session,
        ChallengeResponses: {
          SECRET_HASH: computeSecretHash(a.username, a.clientId, a.clientSecret),
          NEW_PASSWORD: a.newPassword,
          USERNAME: a.username
        }
      })
    );
  },
  (e) => {
    console.error('RespondToAuthChallengeCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Sign up ---- //
/**
 * Registers a new user with Cognito and optional custom attributes.
 *
 * @param a.username - Cognito username.
 * @param a.password - User password.
 * @param a.clientId - Cognito app client ID.
 * @param a.clientSecret - Cognito app client secret.
 * @param a.<attribute> - Any additional user attributes to set.
 */
export const signUp = ResultAsync.fromThrowable(
  (a: { username: string; password: string; clientId: string; clientSecret: string } & Record<string, unknown>) => {
    const cognitoClient = getCognitoClient();
    const secretHash = computeSecretHash(a.username, a.clientId, a.clientSecret);

    return cognitoClient.send(
      new SignUpCommand({
        ClientId: a.clientId,
        Username: a.username,
        Password: a.password,
        SecretHash: secretHash,
        UserAttributes: Object.entries(a)
          .filter(([key]) => !['username', 'password', 'clientId', 'clientSecret'].includes(key))
          .map(([key, value]) => ({ Name: key, Value: value as string }))
      })
    );
  },
  (e) => {
    console.error('SignUpCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Federated ---- //
/**
 * Exchanges an OAuth2 authorization code for Cognito tokens using the token endpoint.
 * See https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html for request/response fields and grant details.
 *
 * @param a.code - Authorization code returned by the hosted UI.
 * @param a.redirectUri - Redirect URI registered with the app client.
 * @param a.clientId - Cognito app client ID.
 * @param a.clientSecret - Cognito app client secret used for Basic Auth.
 * @param a.cognitoDomain - Cognito domain URL (e.g., your-domain.auth.region.amazoncognito.com).
 * @returns Parsed token payload containing `access_token`, `id_token`, `refresh_token`, token type, and expiry.
 */
export const verifyOAuthToken = ResultAsync.fromThrowable(
  async (a: { code: string; redirectUri: string; clientId: string; clientSecret: string; cognitoDomain: string }) => {
    const basicAuth = Buffer.from(`${a.clientId}:${a.clientSecret}`).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', a.code);
    params.append('redirect_uri', a.redirectUri);

    // params.append('client_id', a.clientId);

    console.log('verifyOAuthToken: params', params.toString());

    const tokenRes = await fetch(`https://${a.cognitoDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: params.toString()
    });
    if (!tokenRes.ok) {
      console.error('verifyOAuthToken: token exchange failed', await tokenRes.text());
      throw new Error('');
    }

    return (await tokenRes.json()) as {
      access_token: string;
      id_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
    };
  },
  (e) => {
    console.error('verifyOAuthToken:error', e);
    return error_cognito_auth;
  }
);

/**
 * Exchanges an OAuth2 refresh token for Cognito tokens using the oauth token endpoint.
 * See https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html for request/response fields and grant details.
 *
 * @param a.redirectUri - Redirect URI registered with the app client.
 * @param a.clientId - Cognito app client ID.
 * @param a.clientSecret - Cognito app client secret used for Basic Auth.
 * @param a.cognitoDomain - Cognito domain URL (e.g., your-domain.auth.region.amazoncognito.com).
 * @returns Parsed token payload containing `access_token`, `id_token`, `refresh_token`, token type, and expiry.
 */
export const refreshOAuthToken = ResultAsync.fromThrowable(
  async (a: { clientId: string; clientSecret: string; cognitoDomain: string; refreshToken: string }) => {
    const basicAuth = Buffer.from(`${a.clientId}:${a.clientSecret}`).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', a.refreshToken);

    console.log('refreshOAuthToken: params', params.toString());

    const tokenRes = await fetch(`https://${a.cognitoDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
      body: params.toString()
    });
    if (!tokenRes.ok) {
      console.error('refreshOAuthToken: token exchange failed', await tokenRes.text());
      throw new Error('');
    }

    return (await tokenRes.json()) as {
      access_token: string;
      id_token: string;
      refresh_token: string | undefined;
      token_type: string;
      expires_in: number;
    };
  },
  (e) => {
    console.error('refreshOAuthToken:error', e);
    return error_cognito_auth;
  }
);
