import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'scripts/ts-alias': 'src/scripts/ts-alias.ts',
      'scripts/ts-build-config': 'src/scripts/ts-build-config.ts'
    },
    deps: { onlyBundle: ['@types/unist', '@types/hast'] },
    dts: { tsgo: true },
    platform: 'node'
  },
  {
    entry: { browser: 'src/browser.ts' },
    deps: { onlyBundle: ['@types/unist', '@types/hast'] },
    dts: { tsgo: true },
    platform: 'browser'
  }
]);
