import { styleText } from 'node:util';

export const colorText = (format: Parameters<typeof styleText>[0], text: unknown) =>
  styleText(format, String(text), { validateStream: false });

export function ensureDotRelative(filePath: string): string {
  if (filePath.startsWith('.')) return filePath;
  return `./${filePath}`;
}
