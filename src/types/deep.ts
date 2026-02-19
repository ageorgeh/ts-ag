/**
 * @example
 * type HomeOverridden = DeepOverride<Home, {
 *   test: {
 *     featuredImages: never; // Removing the property
 *     meta: {
 *       updatedAt: string; // Changing the type
 *     };
 *   };
 * }>;
 */
export type DeepOverride<T, R> = {
  [K in keyof T]: K extends keyof R
    ? R[K] extends infer RK // Get override type
      ? RK extends Record<string, any> // If override is an object
        ? T[K] extends Record<string, any> // If original is an object
          ? DeepOverride<T[K], RK> // Recursively override
          : RK // Replace value
        : RK extends Array<infer RU> // If override is an array
          ? T[K] extends Array<infer TU> // If original is also an array
            ? Array<DeepOverride<TU, RU>> // Recursively apply to array items
            : RK // Direct replacement
          : RK // Direct replacement
      : never
    : T[K]; // Keep original type if not overridden
};

// oxlint-disable-next-line @typescript-eslint/no-unsafe-function-type
type Primitive = string | number | boolean | bigint | symbol | null | undefined | Date | RegExp | Function;

export type DeepPartial<T> = T extends Primitive
  ? T
  : T extends readonly (infer U)[]
    ? readonly U[] // treat arrays as atomic values
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export type DeepRequired<T> = {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-function-type
  [P in keyof T]-?: NonNullable<T[P] extends object ? (T[P] extends Function ? T[P] : DeepRequired<T[P]>) : T[P]>;
};
