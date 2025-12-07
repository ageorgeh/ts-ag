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

const clientId = process.env.COGNITO_CLIENT_ID!;
const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
const userPoolId = process.env.COGNITO_USER_POOL_ID!;

export function computeSecretHash(username: string, clientId: string, clientSecret: string): string {
  return createHmac('SHA256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

// ---- Change password ---- //

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
    console.error('ChangePasswordCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Confirm Forgot password ---- //

/**
 * Changes the password with the confirmation code sent to the email.
 * Assumes the existence of process.env.COGNITO_CLIENT_ID and COGNITO_CLIENT_SECRET
 * @param username - username or any of their alias attributes
 * @param confirmationCode
 * @param newPassword
 */
export const confirmForgotPassword = ResultAsync.fromThrowable(
  (data: { username: string; confirmationCode: string; newPassword: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new ConfirmForgotPasswordCommand({
        ClientId: clientId,
        Username: data.username,
        ConfirmationCode: data.confirmationCode,
        Password: data.newPassword,
        SecretHash: computeSecretHash(data.username, clientId!, clientSecret!)
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
 * Confirms signup
 * @param username - username or any alias attribute
 */
export const confirmSignup = ResultAsync.fromThrowable(
  (data: { username: string; confirmationCode: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: data.username,
        ConfirmationCode: data.confirmationCode,
        SecretHash: computeSecretHash(data.username, clientId, clientSecret)
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
 * Sends an email for you to reset your password
 */
export const forgotPassword = ResultAsync.fromThrowable(
  (data: { username: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new ForgotPasswordCommand({
        ClientId: clientId,
        Username: data.username,
        SecretHash: computeSecretHash(data.username, clientId, clientSecret)
      })
    );
  },
  (e) => {
    console.error('ForgotPasswordCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Login ---- //

export const login = ResultAsync.fromThrowable(
  (data: { username: string; password: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new AdminInitiateAuthCommand({
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        ClientId: clientId,
        UserPoolId: userPoolId,
        AuthParameters: {
          USERNAME: data.username,
          PASSWORD: data.password,
          SECRET_HASH: computeSecretHash(data.username, clientId, clientSecret)
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

export const refreshTokens = ResultAsync.fromThrowable(
  (data: { username: string; refreshToken: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new AdminInitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: clientId,
        UserPoolId: userPoolId,
        AuthParameters: {
          REFRESH_TOKEN: data.refreshToken,
          SECRET_HASH: computeSecretHash(data.username, clientId, clientSecret)
        }
      })
    );
  },
  (e) => {
    console.error('AdminInitiateAuthCommand error', e);
    return error_cognito(e as Error) as type_error_cognito;
  }
);

// ---- Logout ---- //
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

export const resetPassword = ResultAsync.fromThrowable(
  (data: { session: string; newPassword: string; username: string }) => {
    const cognitoClient = getCognitoClient();
    return cognitoClient.send(
      new RespondToAuthChallengeCommand({
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        ClientId: clientId,
        Session: data.session,
        ChallengeResponses: {
          SECRET_HASH: computeSecretHash(data.username, clientId, clientSecret),
          NEW_PASSWORD: data.newPassword,
          USERNAME: data.username
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
export const signUp = ResultAsync.fromThrowable(
  (data: { username: string; password: string } & Record<string, unknown>) => {
    const cognitoClient = getCognitoClient();
    const secretHash = computeSecretHash(data.username, clientId, clientSecret);

    return cognitoClient.send(
      new SignUpCommand({
        ClientId: clientId,
        Username: data.username,
        Password: data.password,
        SecretHash: secretHash,
        UserAttributes: Object.entries(data)
          .filter(([key]) => key !== 'username' && key !== 'password')
          .map(([key, value]) => ({
            Name: key,
            Value: value as string
          }))
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
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`
      },
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
