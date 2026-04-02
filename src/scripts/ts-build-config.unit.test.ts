import console from 'console';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GENERATED_FILE_HEADER,
  computeExtraExcludes,
  generateBuildConfigs,
  isGeneratedByThisScript,
  replaceRefsWithBuildConfigs,
  shouldUseBuildConfig,
  writeBuildTsconfig
} from './ts-build-config.js';

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readGeneratedJson(filePath: string): Record<string, unknown> {
  const contents = readFileSync(filePath, 'utf8');
  expect(contents.startsWith(`${GENERATED_FILE_HEADER}\n`)).toBe(true);
  return JSON.parse(contents.slice(`${GENERATED_FILE_HEADER}\n`.length)) as Record<string, unknown>;
}

describe('ts-build-config helpers', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('adds default test excludes and an explicit tests directory exclude when needed', () => {
    expect(computeExtraExcludes({ include: ['src', './tests/helpers'] })).toEqual(
      expect.arrayContaining(['**/*.test.ts', '**/*.spec.tsx', './tests/**'])
    );
  });

  it('detects generated build configs and respects force for manual files', () => {
    const root = mkdtempSync(join(tmpdir(), 'ts-build-config-'));
    tempDirs.push(root);

    const tsconfigPath = join(root, 'pkg/tsconfig.json');
    const buildPath = join(root, 'pkg/tsconfig.build.json');

    writeJson(tsconfigPath, {});
    expect(shouldUseBuildConfig(tsconfigPath, false)).toBe(true);

    writeFileSync(buildPath, '{"manual":true}\n');
    expect(isGeneratedByThisScript(buildPath)).toBe(false);
    expect(shouldUseBuildConfig(tsconfigPath, false)).toBe(false);
    expect(shouldUseBuildConfig(tsconfigPath, true)).toBe(true);

    writeFileSync(buildPath, `${GENERATED_FILE_HEADER}\n{"generated":true}\n`);
    expect(isGeneratedByThisScript(buildPath)).toBe(true);
    expect(shouldUseBuildConfig(tsconfigPath, false)).toBe(true);
  });

  it('rewrites references to generated build configs and removes requested refs', () => {
    const rootConfigPath = '/repo/tsconfig.json';
    const alphaPath = '/repo/packages/alpha/tsconfig.json';
    const betaPath = '/repo/packages/beta/tsconfig.json';
    const gammaPath = '/repo/packages/gamma/tsconfig.json';

    const result = replaceRefsWithBuildConfigs(
      {
        path: rootConfigPath,
        config: { references: [{ path: 'packages/alpha' }, { path: './packages/beta' }, { path: 'packages/gamma' }] }
      },
      new Set([alphaPath, betaPath]),
      [betaPath]
    );

    expect(result.references).toEqual([{ path: './packages/alpha/tsconfig.build.json' }, { path: './packages/gamma' }]);
  });

  it('writes a build config with header, excludes, and noEmit override', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ts-build-config-'));
    tempDirs.push(root);

    const tsconfigPath = join(root, 'pkg/tsconfig.json');
    writeJson(tsconfigPath, {});

    const outPath = await writeBuildTsconfig(
      tsconfigPath,
      {
        compilerOptions: { noEmit: true },
        exclude: ['custom-ignore'],
        include: ['src', 'tests'],
        references: [{ path: './packages/a' }]
      },
      false
    );

    const written = readGeneratedJson(outPath);
    expect(written.extends).toBe('./tsconfig.json');
    expect(written.compilerOptions).toEqual({ noEmit: false });
    expect(written.references).toEqual([{ path: './packages/a' }]);
    expect(written.exclude).toEqual(
      expect.arrayContaining(['custom-ignore', '**/*.test.ts', '**/tests/**', './tests/**'])
    );
  });

  it('generates build configs across a reference graph and preserves manual build files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ts-build-config-'));
    tempDirs.push(root);

    const entry = join(root, 'tsconfig.json');
    const alphaConfig = join(root, 'packages/alpha/tsconfig.json');
    const manualConfig = join(root, 'packages/manual/tsconfig.json');
    const removedConfig = join(root, 'packages/removed/tsconfig.json');
    const manualBuildPath = join(root, 'packages/manual/tsconfig.build.json');

    writeJson(entry, {
      compilerOptions: { noEmit: true, outDir: 'dist' },
      references: [{ path: 'packages/alpha' }, { path: 'packages/manual' }, { path: 'packages/removed' }]
    });
    writeJson(alphaConfig, { compilerOptions: { outDir: 'dist' } });
    writeJson(manualConfig, { compilerOptions: { outDir: 'dist' } });
    writeJson(removedConfig, { compilerOptions: { outDir: 'dist' } });
    writeFileSync(manualBuildPath, '{"manual":true}\n');

    const result = await generateBuildConfigs(entry, {
      dryRun: false,
      force: false,
      verbose: false,
      remove: [removedConfig]
    });

    expect(result.created.map(({ src }) => src).sort()).toEqual([alphaConfig, entry, removedConfig].sort());
    expect(result.visitedConfigs).toEqual(expect.arrayContaining([entry, alphaConfig, manualConfig, removedConfig]));
    expect(readFileSync(manualBuildPath, 'utf8')).toBe('{"manual":true}\n');

    const rootBuild = readGeneratedJson(join(root, 'tsconfig.build.json'));
    expect(rootBuild.references).toEqual([
      { path: './packages/alpha/tsconfig.build.json' },
      { path: './packages/manual' }
    ]);
    expect(rootBuild.compilerOptions).toEqual({ noEmit: false });

    const alphaBuild = readGeneratedJson(join(root, 'packages/alpha/tsconfig.build.json'));
    expect(alphaBuild.extends).toBe('./tsconfig.json');
  });
});
