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
