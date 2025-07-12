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

/**
 *
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      T[P] extends Function
      ? T[P]
      : DeepPartial<T[P]>
    : T[P];
};

export type DeepRequired<T> = {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  [P in keyof T]-?: NonNullable<T[P] extends object ? (T[P] extends Function ? T[P] : DeepRequired<T[P]>) : T[P]>;
};
