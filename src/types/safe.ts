export type SafeOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
