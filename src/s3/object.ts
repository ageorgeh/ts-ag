import {
  HeadObjectCommand,
  GetObjectCommand,
  type GetObjectCommandInput,
  type S3ClientConfig
} from '@aws-sdk/client-s3';
import { ResultAsync } from 'neverthrow';

import { getS3 } from './client.js';
import { error_s3, is_s3_notFound } from './errors.js';

/**
 * Retrieves an object from an S3 bucket.
 *
 * @param {string} bucketName - The name of the S3 bucket.
 * @param {string} key - The key of the object to retrieve.
 */
export const getObject = /* @__PURE__ */ ResultAsync.fromThrowable(
  async (input: GetObjectCommandInput, args?: S3ClientConfig): Promise<Buffer> => {
    const s3 = getS3(args);
    const res = await s3.send(new GetObjectCommand(input));
    if (!res.Body) return Buffer.alloc(0);
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  },
  (e) => {
    console.error('getObject: Error getting object from S3:', e);
    return error_s3(e);
  }
);

/**
 * Convenience function to get an object from S3 and return it as a string.
 *
 * @param {string} bucketName - The name of the S3 bucket.
 * @param {string} key - The key of the object to retrieve.
 */
export const getObjectString = /* @__PURE__ */ ResultAsync.fromThrowable(
  async (input: GetObjectCommandInput, args?: S3ClientConfig): Promise<string> => {
    const s3 = getS3(args);
    const res = await s3.send(new GetObjectCommand(input));
    if (!res.Body) return '';
    return await res.Body.transformToString('utf-8');
  },
  (e) => {
    console.error('getObjectString: Error getting object from S3:', e);
    return error_s3(e);
  }
);

const objectExistsResult = /* @__PURE__ */ ResultAsync.fromThrowable(
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

/**
 * Checks if an object exists in an s3 bucket by retrieving the HEAD data
 *
 * @param {string} bucketName - The name of the S3 bucket.
 * @param {string} key - The key of the object to retrieve.
 * @returns {Promise<Buffer>} A promise that resolves to a boolean.
 */
export function objectExists(bucketName: string, key: string) {
  return objectExistsResult(bucketName, key);
}
