import { describe, expect, it } from 'vitest';

import { deepDiff, getByPath, pruneToShape, setByPath } from './object.js';

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

describe('pruneToShape', () => {
  it('drops top-level keys not in shape', () => {
    const source = { a: 1, b: 2, c: 3 };
    const shape = { a: 0, c: 0 };
    expect(pruneToShape(source, shape)).toEqual({ a: 1, c: 3 });
  });

  it('prunes deeply nested objects', () => {
    const source = { a: { b: { c: 1, d: 2 }, e: 3 }, f: 9 };
    const shape = { a: { b: { c: 0 } } };
    expect(pruneToShape(source, shape)).toEqual({ a: { b: { c: 1 } } });
  });

  it('keeps keys present in shape even if source value is undefined', () => {
    const source = { a: 1 };
    const shape = { a: 0, b: 0 };
    expect(pruneToShape(source, shape)).toEqual({ a: 1, b: undefined });
  });

  it('arrays: prunes each element using first shape element', () => {
    const source = {
      items: [
        { x: 1, y: 2, z: 3 },
        { x: 4, y: 5, extra: true }
      ],
      extra: 'drop'
    };
    const shape = { items: [{ x: 0, y: 0 }] };

    expect(pruneToShape(source, shape)).toEqual({
      items: [
        { x: 1, y: 2 },
        { x: 4, y: 5 }
      ]
    });
  });

  it('arrays: empty shape array returns empty array (drops all elements)', () => {
    const source = { items: [{ x: 1 }, { x: 2 }] };
    const shape = { items: [] as unknown[] };
    expect(pruneToShape(source, shape)).toEqual({ items: [] });
  });

  it('arrays: if source is not an array, returns empty array for that field', () => {
    const source = { items: { x: 1 } as unknown };
    const shape = { items: [{ x: 0 }] };
    expect(pruneToShape(source, shape)).toEqual({ items: [] });
  });

  it('object expected but source has non-object: returns empty object of that shape', () => {
    const source = { a: 123 as unknown };
    const shape = { a: { b: 0, c: { d: 0 } } };
    expect(pruneToShape(source, shape)).toEqual({ a: { b: undefined, c: { d: undefined } } });
  });

  it('keeps leaf values as-is (no coercion) when key exists in shape', () => {
    const source = { a: '1', b: { c: '2' } };
    const shape = { a: 0, b: { c: 0 } };
    expect(pruneToShape(source, shape)).toEqual({ a: '1', b: { c: '2' } });
  });

  it('does not mutate source or shape', () => {
    const source = { a: { b: 1, drop: 2 }, arr: [{ x: 1, y: 2 }] };
    const shape = { a: { b: 0 }, arr: [{ x: 0 }] };

    const sourceBefore = structuredClone(source);
    const shapeBefore = structuredClone(shape);

    pruneToShape(source, shape);

    expect(source).toEqual(sourceBefore);
    expect(shape).toEqual(shapeBefore);
  });

  it('treats non-plain objects in shape as leaf (e.g. Date)', () => {
    const source = { a: { b: 1, c: 2 } };
    const shape = { a: new Date(0) }; // leaf => keep source.a as-is (even though it's an object)
    expect(pruneToShape(source, shape)).toEqual({ a: { b: 1, c: 2 } });
  });

  it('treats non-plain objects in source as incompatible when shape expects plain object', () => {
    class Foo {
      constructor(
        public x: number,
        public y: number
      ) {}
    }
    const source = { a: new Foo(1, 2) as unknown };
    const shape = { a: { x: 0 } };

    // Foo isn't "plain", so it's treated as incompatible => build object using shape keys with undefined leaves
    expect(pruneToShape(source, shape)).toEqual({ a: { x: undefined } });
  });

  it('handles mixed nesting of objects and arrays', () => {
    const source = { a: [{ b: { c: 1, d: 2 }, drop: true }], dropTop: 1 };
    const shape = { a: [{ b: { c: 0 } }] };

    expect(pruneToShape(source, shape)).toEqual({ a: [{ b: { c: 1 } }] });
  });
});
