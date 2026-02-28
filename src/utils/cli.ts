import { styleText } from 'util';

export const colorText = (format: Parameters<typeof styleText>[0], text: unknown) =>
  styleText(format, String(text), { validateStream: false });
