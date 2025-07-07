import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

/**
 * Convenience function if process.env.REGION is set
 */
export function getCognitoClient() {
  return new CognitoIdentityProviderClient({
    region: process.env.REGION,
    endpoint: `https://cognito-idp.${process.env.REGION}.amazonaws.com`
  });
}
