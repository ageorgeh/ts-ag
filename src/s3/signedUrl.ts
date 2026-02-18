import { getSignedUrl as baseGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ResultAsync } from 'neverthrow';

export const getSignedUrl = ResultAsync.fromThrowable(baseGetSignedUrl, (e) => e);
