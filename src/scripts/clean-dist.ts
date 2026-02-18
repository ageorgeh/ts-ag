#!/usr/bin/env node

import { rmSync } from 'fs';
import { resolve, dirname, join } from 'path';

import { getTsconfig } from 'get-tsconfig';

async function listReferences(tsconfigPath: string, visited = new Set<string>()) {
  // console.log(`Processing: ${tsconfigPath}`);
  tsconfigPath = resolve(tsconfigPath);
  if (visited.has(tsconfigPath)) return;
  visited.add(tsconfigPath);

  const tsconfig = getTsconfig(tsconfigPath);
  if (tsconfig === null) return;
  const dir = dirname(tsconfigPath);

  // console.log(`Found tsconfig: ${tsconfigPath}`, tsconfig);

  if (tsconfig.config.references && Array.isArray(tsconfig.config.references)) {
    for (const ref of tsconfig.config.references) {
      if (typeof ref.path === 'string') {
        const dirPath = ref.path.split('/').slice(0, -1).join('/');
        const configFilename = ref.path.endsWith('.json') ? ref.path.split('/').pop()! : 'tsconfig.json';

        await listReferences(resolve(dir, dirPath, configFilename), visited);
      }
    }
  }
}

const configs = new Set<string>();
await listReferences(process.argv[2] || 'tsconfig.json', configs);
console.log('Referenced tsconfig files:');
for (const conf of configs) {
  const dir = dirname(conf);
  const configName = conf.split('/').pop()?.slice(0, -5) || 'tsconfig';

  rmSync(join(dir, 'dist'), { recursive: true, force: true });
  rmSync(join(dir, configName + '.tsbuildinfo'), { recursive: true, force: true });
  console.log('Removed dist and tsbuildinfo for:', conf);
  // console.log('  Dist: ', join(dir, 'dist'));
  // console.log('  tsbuildinfo: ', join(dir, configName + '.tsbuildinfo'));
}
