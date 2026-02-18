import { error_lambda_unauthorized } from '$lambda/errors.js';
import type { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';
import { parse } from 'cookie';
import { Result } from 'neverthrow';

/**
 * Wraps cookies parse along with the api gateway event with neverthrow
 */
export const getCookies = Result.fromThrowable(
  (event: APIGatewayProxyEventV2WithLambdaAuthorizer<any> | APIGatewayRequestAuthorizerEventV2) => {
    if (!('headers' in event) || !event.headers) {
      throw new Error('No headers in event');
    }

    // First try to get cookies from the cookies array (API Gateway v2 format)
    const cookieString =
      Array.isArray(event.cookies) && event.cookies.length > 0
        ? event.cookies.join('; ')
        : event.headers.Cookie || event.headers.cookie;

    if (!cookieString) {
      throw new Error('No cookies found in event');
    }

    const res = parse(cookieString);
    return res;
  },
  (e) => {
    if (e instanceof Error) return error_lambda_unauthorized(e.message);
    return error_lambda_unauthorized('Invalid Cookies');
  }
);
