import { describe, expect, it } from 'vitest';
import { deepDiff, getByPath, setByPath } from './object.js';

describe('deepDiff', () => {
  it('returns an empty object when values are deeply equal', () => {
    const a = { id: 1, nested: { enabled: true, label: 'a' } };
    const b = { id: 1, nested: { enabled: true, label: 'a' } };

    expect(deepDiff(a, b)).toEqual({});
  });

  it('includes new keys that exist only in the updated object', () => {
    const a = { id: 1 };
    const b = { id: 1, createdBy: 'alex' };

    expect(deepDiff(a, b)).toEqual({ createdBy: 'alex' });
  });

  it('returns only changed nested fields for plain objects', () => {
    const a = { profile: { name: 'Alex', age: 30, flags: { admin: false, beta: false } } };
    const b = { profile: { name: 'Alex', age: 31, flags: { admin: true, beta: false } } };

    expect(deepDiff(a, b)).toEqual({ profile: { age: 31, flags: { admin: true } } });
  });

  it('treats arrays as atomic and returns full replacement when changed', () => {
    const a = { tags: ['a', 'b'] };
    const b = { tags: ['a', 'c'] };

    expect(deepDiff(a, b)).toEqual({ tags: ['a', 'c'] });
  });

  it('does not include keys that only exist on the base object', () => {
    const a = { keepInAOnly: true, nested: { removed: 'x' } };
    const b = { nested: {} };

    expect(deepDiff(a, b)).toEqual({});
  });
});

describe('setByPath/getByPath', () => {
  it('sets and reads nested object values', () => {
    const target = {} as { user?: { profile?: { name?: string } } };

    setByPath(target, 'user.profile.name', 'Alex');

    expect(target).toEqual({ user: { profile: { name: 'Alex' } } });
    expect(getByPath(target, 'user.profile.name')).toBe('Alex');
  });

  it('handles array-style path segments and missing values', () => {
    const target = {} as { rows?: Array<{ value?: number }> };

    setByPath(target, 'rows.0.value', 42);

    expect(target).toEqual({ rows: [{ value: 42 }] });
    expect(getByPath(target, 'rows.0.value')).toBe(42);
    expect(getByPath(target, 'rows.1.value')).toBeUndefined();
  });
});
