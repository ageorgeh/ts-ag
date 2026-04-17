export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
export function getErrorName(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;

  const name = error.name;
  if (typeof name === 'string') return name;

  const code = error.code ?? error.Code;
  if (typeof code === 'string') return code;

  return undefined;
}
