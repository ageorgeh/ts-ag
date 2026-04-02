import console from 'console';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('tsc-alias', () => ({ replaceTscAliasPaths: vi.fn() }));

import { replaceTscAliasPaths } from 'tsc-alias';

import {
  discoverAliasTargets,
  isAliasOutputFile,
  isWithinDir,
  processAliasTarget,
  resolveOutDir,
  resolveTsConfigPath,
  syncWatcherPaths
} from './ts-alias.js';

const mockedReplaceTscAliasPaths = vi.mocked(replaceTscAliasPaths);

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe('ts-alias helpers', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    mockedReplaceTscAliasPaths.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('resolves tsconfig paths and output locations', () => {
    expect(resolveTsConfigPath('/repo/pkg')).toBe('/repo/pkg/tsconfig.json');
    expect(resolveTsConfigPath('/repo/pkg/custom.json')).toBe('/repo/pkg/custom.json');
    expect(resolveOutDir('/repo/pkg/tsconfig.json', 'dist')).toBe('/repo/pkg/dist');
    expect(resolveOutDir('/repo/pkg/tsconfig.json', '/tmp/dist')).toBe('/tmp/dist');
  });

  it('matches relevant output files and directory membership', () => {
    expect(isAliasOutputFile('/repo/dist/index.js')).toBe(true);
    expect(isAliasOutputFile('/repo/dist/index.d.ts')).toBe(true);
    expect(isAliasOutputFile('/repo/src/index.ts')).toBe(false);

    expect(isWithinDir('/repo/dist/nested/index.js', '/repo/dist')).toBe(true);
    expect(isWithinDir('/repo/dist', '/repo/dist')).toBe(true);
    expect(isWithinDir('/repo/other/index.js', '/repo/dist')).toBe(false);
  });

  it('discovers referenced configs and only returns ones with outDir', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ts-alias-'));
    tempDirs.push(root);

    const entry = join(root, 'tsconfig.json');
    const packageAConfig = join(root, 'packages/a/tsconfig.json');
    const noOutDirConfig = join(root, 'packages/no-out/tsconfig.json');
    const missingConfig = join(root, 'packages/missing/tsconfig.json');

    writeJson(entry, {
      compilerOptions: { outDir: 'dist/root' },
      references: [{ path: './packages/a' }, { path: './packages/no-out' }, { path: './packages/missing' }]
    });
    writeJson(packageAConfig, { compilerOptions: { outDir: 'lib' } });
    writeJson(noOutDirConfig, { compilerOptions: {} });

    const result = await discoverAliasTargets(entry, false);

    expect(result.targets).toEqual(
      expect.arrayContaining([
        { configPath: entry, outDir: join(root, 'dist/root') },
        { configPath: packageAConfig, outDir: join(root, 'packages/a/lib') }
      ])
    );
    expect(result.targets).toHaveLength(2);
    expect(result.visitedConfigs).toEqual(
      expect.arrayContaining([entry, packageAConfig, noOutDirConfig, missingConfig])
    );
  });

  it('processes alias targets only when the output directory exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ts-alias-'));
    tempDirs.push(root);

    const configPath = join(root, 'pkg/tsconfig.json');
    const outDir = join(root, 'pkg/dist');
    mkdirSync(outDir, { recursive: true });

    await processAliasTarget({ configPath, outDir });
    expect(mockedReplaceTscAliasPaths).toHaveBeenCalledWith({ configFile: configPath, outDir });

    mockedReplaceTscAliasPaths.mockClear();
    await processAliasTarget({ configPath, outDir: join(root, 'pkg/missing') });
    expect(mockedReplaceTscAliasPaths).not.toHaveBeenCalled();
  });

  it('syncs watcher paths by adding and removing only changed entries', async () => {
    const watcher = { add: vi.fn(), unwatch: vi.fn(async () => undefined) };

    const next = await syncWatcherPaths(
      watcher as any,
      new Set(['/repo/one', '/repo/two']),
      new Set(['/repo/two', '/repo/three'])
    );

    expect(watcher.unwatch).toHaveBeenCalledWith(['/repo/one']);
    expect(watcher.add).toHaveBeenCalledWith(['/repo/three']);
    expect(Array.from(next)).toEqual(['/repo/two', '/repo/three']);
  });
});
