import { HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { ResultAsync } from 'neverthrow';

import { getS3 } from './client.js';
import { error_s3, is_s3_notFound, type type_error_s3 } from './errors.js';

/**
 * Retrieves an object from an S3 bucket.
 *
 * @param {string} bucketName - The name of the S3 bucket.
 * @param {string} key - The key of the object to retrieve.
 * @returns {Promise<Buffer>} A promise that resolves to the object data as a Buffer.
 */
export const getObject = ResultAsync.fromThrowable(
  async (bucketName: string, key: string) => {
    const s3 = getS3();
    const cmd = new GetObjectCommand({ Bucket: bucketName, Key: key });
    const res = await s3.send(cmd);
    const stream = res.Body as any;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  },
  (e) => {
    console.error(`getObjectt: Error getting object from S3: ${e}`);
    return error_s3(e);
  }
);

/**
 * Convenience function to get an object from S3 and return it as a string.
 */
export function getObjectString(bucketName: string, key: string): ResultAsync<string, type_error_s3> {
  return getObject(bucketName, key).map((buffer) => buffer.toString('utf-8'));
}

/**
 * Checks if an object exists in an s3 bucket by retrieving the HEAD data
 *
 * @param {string} bucketName - The name of the S3 bucket.
 * @param {string} key - The key of the object to retrieve.
 * @returns {Promise<Buffer>} A promise that resolves to a boolean.
 */
export const objectExists = ResultAsync.fromThrowable(
  async (bucketName: string, key: string) => {
    const s3 = getS3();

    try {
      const cmd = new HeadObjectCommand({ Bucket: bucketName, Key: key });
      const res = await s3.send(cmd);
      return res.$metadata.httpStatusCode === 200;
    } catch (e) {
      if (is_s3_notFound(e)) return false;
      throw e;
    }
  },
  (e) => {
    console.error(`objectExists: Error getting object head from S3: ${e}`);
    return error_s3(e);
  }
);
