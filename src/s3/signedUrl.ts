import { getSignedUrl as baseGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ResultAsync } from 'neverthrow';

import { error_s3 } from './errors.js';

export const getSignedUrl = ResultAsync.fromThrowable(baseGetSignedUrl, (e) => {
  console.error('getSignedUrl: Failed to get signed url', e);
  error_s3(e);
});
