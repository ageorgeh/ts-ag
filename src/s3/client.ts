import { S3Client } from '@aws-sdk/client-s3';

/**
 * Convenience function for S3Client when process.env.REGION is set
 */
export function getS3() {
  return new S3Client({ endpoint: `https://s3.${process.env.REGION}.amazonaws.com`, region: process.env.REGION });
}
