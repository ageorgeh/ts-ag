import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

/**
 * Convenience function if process.env.AWS_REGION is set
 */
export function getCognitoClient() {
  return new CognitoIdentityProviderClient({
    // region: process.env.AWS_REGION
    // endpoint: `https://cognito-idp.${process.env.REGION}.amazonaws.com`
  });
}
