import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

/**
 * Convenience function for S3Client when process.env.REGION is set
 */
export function getS3(args?: S3ClientConfig) {
  return new S3Client({
    ...args
    // endpoint: `https://s3.${process.env.REGION}.amazonaws.com`,
    // region: process.env.REGION
  });
}
