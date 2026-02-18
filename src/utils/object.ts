import { isEqual, isObject } from 'radash';

import type { DeepPartial } from '../types/deep.js';

/**
 * Sets the value for an object by its dot path
 * @param obj - any object
 * @param path - the dot path eg. key1.0.1.key2
 * @param value - any value
 * @returns - the modified object
 */
export function setByPath<T extends object>(obj: T, path: string, value: any): T {
  const keys = path.split('.');
  let curr: any = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = keys[i + 1];
    // handle array indices like '0'
    if (Number.isInteger(Number(next))) {
      curr[k] ??= [];
    } else {
      curr[k] ??= {};
    }
    curr = curr[k];
  }

  curr[keys[keys.length - 1]] = value;
  return obj;
}

/**
 * Gets the value from an object by its dot path
 * @param obj - any object
 * @param path - the dot path eg. key1.0.1.key2
 * @returns - the value at the given path or undefined
 */
export function getByPath<T extends object>(obj: T, path: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  const keys = path.split('.');
  let curr: any = obj;

  for (const k of keys) {
    if (curr == null) return undefined;
    curr = curr[k];
  }

  return curr;
}

const isPlainRecord = (v: unknown): v is Record<string, unknown> => isObject(v) && !Array.isArray(v);

/**
 * Returns a deep "patch" object containing only the fields from `b`
 * that are different from `a`.
 *
 * Behavior:
 * - Only keys from `b` can appear in the result.
 * - New keys in `b` are included.
 * - Changed primitive/array values are included as the value from `b`.
 * - For nested plain objects, it recurses and returns only the differing nested fields.
 * - Arrays are treated as atomic (if different, the whole array from `b` is returned).
 *
 * Typing:
 * - Output is `DeepPartial<B>` because only a subset of `b`'s shape is returned.
 *
 * @template A
 * @template B
 * @param {A} a - Base/original object (can be a different shape than `b`).
 * @param {B} b - Updated object; output keys come from this object.
 * @returns {DeepPartial<B>} Deep partial of `b` containing only differences vs `a`.
 */
export const deepDiff = <A extends object, B extends object>(a: A, b: B): DeepPartial<B> => {
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(b) as Array<keyof B>) {
    const aVal = (a as any)?.[key];
    const bVal = (b as any)[key];

    if (!((key as any) in (a as any))) {
      out[key as any] = bVal;
      continue;
    }

    if (isPlainRecord(aVal) && isPlainRecord(bVal)) {
      const nested = deepDiff(aVal, bVal);
      if (Object.keys(nested as any).length) out[key as any] = nested;
      continue;
    }

    if (!isEqual(aVal, bVal)) out[key as any] = bVal;
  }

  return out as DeepPartial<B>;
};
