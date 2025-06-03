export const badRequestError = (message: string, fieldName?: string, fieldValue?: string) => ({
  type: 'BadRequest' as const,
  message,
  fieldName,
  fieldValue
});
export const unauthorizedError = (message: string) => ({
  type: 'Unauthorized' as const,
  message
});

export const forbiddenError = (message: string) => ({
  type: 'Forbidden' as const,
  message
});

export const notFoundError = (message: string, fieldName?: string, fieldValue?: string) => ({
  type: 'NotFound' as const,
  message,
  fieldName,
  fieldValue
});

export const conflictError = (message: string, fieldName?: string, fieldValue?: string) => ({
  type: 'Conflict' as const,
  message,
  fieldName,
  fieldValue
});

export const internalServerError = (message: string) => ({
  type: 'InternalServerError' as const,
  message
});

export type BadRequestError = ReturnType<typeof badRequestError>;
export type UnauthorizedError = ReturnType<typeof unauthorizedError>;
export type ForbiddenError = ReturnType<typeof forbiddenError>;
export type NotFoundError = ReturnType<typeof notFoundError>;
export type ConflictError = ReturnType<typeof conflictError>;
export type InternalServerError = ReturnType<typeof internalServerError>;

export type LambdaError =
  | BadRequestError
  | UnauthorizedError
  | ForbiddenError
  | NotFoundError
  | ConflictError
  | InternalServerError;
