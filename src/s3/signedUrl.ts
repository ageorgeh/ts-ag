import { ResultAsync } from 'neverthrow';
import { getSignedUrl as baseGetSignedUrl } from '@aws-sdk/s3-request-presigner';

export const getSignedUrl = ResultAsync.fromThrowable(baseGetSignedUrl, (e) => e);
