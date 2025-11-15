export const error_s3_internal = {
  type: 's3_internal' as const
};
export const error_s3_get = {
  type: 's3_get' as const
};

export type type_error_s3_internal = typeof error_s3_internal;
export type type_error_s3_get = typeof error_s3_get;
