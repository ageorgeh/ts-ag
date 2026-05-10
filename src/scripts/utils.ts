import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isDirectExecution(importMetaUrl: string, argv: string[] = process.argv): boolean {
  const entrypoint = argv[1];
  if (!entrypoint) return false;

  try {
    const executedPath = realpathSync.native(resolve(entrypoint));
    const modulePath = realpathSync.native(fileURLToPath(importMetaUrl));

    return executedPath === modulePath;
  } catch {
    return false;
  }
}
