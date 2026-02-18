import { describe, expect, it } from 'vitest';

import { error_dynamo, error_lambda_fromDynamo } from './errors.js';

describe('dynamo errors', () => {
  it('exports the dynamo error constant and maps it to a lambda internal error', () => {
    expect(error_dynamo).toEqual({ type: 'dynamo' });
    expect(error_lambda_fromDynamo(error_dynamo)).toEqual({
      type: 'lambda_internal',
      message: 'Internal server error'
    });
  });
});
