import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkLlrtWorker, extractWorkerExportTargets } from './index.js';
import {
  discoverWorkspacePackages,
  matchesPackageFilter,
  parseLlrtApi,
  parsePnpmWorkspacePackages,
  readPackage
} from './options.js';
import type { PackageInfo } from './types.js';

const LLRT_API = [
  '## crypto',
  '[createHmac](#createhmac)',
  '',
  '## fs/promises',
  '[readFile](#readfile)',
  '',
  '## path',
  '[dirname](#dirname)'
].join('\n');

const llrtApiMarkdown = parseLlrtApi(LLRT_API);

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath: string, value: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
}

async function runCheck(packages: PackageInfo[], availablePackages = packages): ReturnType<typeof checkLlrtWorker> {
  return checkLlrtWorker({ apiUrl: 'test://llrt', packages, availablePackages, verbose: false, llrtApiMarkdown });
}

describe('check-llrt-worker helpers', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('resolves worker export targets from nested package exports', async () => {
    const root = mkdtempSync(join(tmpdir(), 'check-llrt-worker-'));
    tempDirs.push(root);

    writeJson(join(root, 'package.json'), {
      name: 'pkg',
      exports: {
        '.': { worker: { types: './dist/worker.d.ts', default: './dist/worker.mjs' }, default: './dist/index.mjs' },
        './alt': { worker: { import: './dist/alt.js' } }
      }
    });

    const pkg = await readPackage(root);
    expect(extractWorkerExportTargets(pkg).map((target) => [target.exportKey, target.filePath])).toEqual([
      ['.', join(root, 'dist/worker.mjs')],
      ['./alt', join(root, 'dist/alt.js')]
    ]);
  });

  it('fails clearly when a worker export built file is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'check-llrt-worker-'));
    tempDirs.push(root);

    writeJson(join(root, 'package.json'), {
      name: 'missing-dist',
      exports: { '.': { worker: { default: './dist/worker.mjs' } } }
    });

    const result = await runCheck([await readPackage(root)]);

    expect(result.diagnostics).toEqual([
      {
        filePath: join(root, 'dist/worker.mjs'),
        message: 'worker export `.` points to missing built file',
        packageName: 'missing-dist'
      }
    ]);
  });

  it('detects supported and unsupported builtin members in built JS', async () => {
    const root = mkdtempSync(join(tmpdir(), 'check-llrt-worker-'));
    tempDirs.push(root);

    writeJson(join(root, 'package.json'), {
      name: 'built-js',
      exports: { '.': { worker: { default: './dist/worker.mjs' } } }
    });
    writeText(
      join(root, 'dist/worker.mjs'),
      "import { createHmac, randomUUID } from 'node:crypto';\ncreateHmac('sha256', 'secret');\nrandomUUID();\n"
    );

    const result = await runCheck([await readPackage(root)]);

    expect(result.usageByModule.get('crypto')).toEqual(new Set(['createHmac', 'randomUUID']));
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'imports `randomUUID` from `crypto`, but LLRT API.md does not list it',
      'uses `randomUUID` from `crypto`, but LLRT API.md does not list it'
    ]);
  });

  it('follows relative JS imports', async () => {
    const root = mkdtempSync(join(tmpdir(), 'check-llrt-worker-'));
    tempDirs.push(root);

    writeJson(join(root, 'package.json'), {
      name: 'relative-imports',
      exports: { '.': { worker: { default: './dist/worker.mjs' } } }
    });
    writeText(join(root, 'dist/worker.mjs'), "import './helper.js';\n");
    writeText(join(root, 'dist/helper.js'), "import { dirname } from 'node:path';\ndirname('/tmp/file');\n");

    const result = await runCheck([await readPackage(root)]);

    expect(result.diagnostics).toEqual([]);
    expect(result.visitedFiles).toEqual([join(root, 'dist/helper.js'), join(root, 'dist/worker.mjs')]);
  });

  it('checks CommonJS require bindings in built JS', async () => {
    const root = mkdtempSync(join(tmpdir(), 'check-llrt-worker-'));
    tempDirs.push(root);

    writeJson(join(root, 'package.json'), {
      name: 'commonjs',
      exports: { '.': { worker: { default: './dist/worker.cjs' } } }
    });
    writeText(join(root, 'dist/worker.cjs'), "const path = require('node:path');\npath.dirname('/tmp/file');\n");

    const result = await runCheck([await readPackage(root)]);

    expect(result.diagnostics).toEqual([]);
    expect(result.usageByModule.get('path')).toEqual(new Set(['dirname']));
  });

  it('resolves imports to discovered workspace packages', async () => {
    const root = mkdtempSync(join(tmpdir(), 'check-llrt-worker-'));
    tempDirs.push(root);

    writeJson(join(root, 'package.json'), { private: true, workspaces: ['packages/*'] });
    writeJson(join(root, 'packages/a/package.json'), {
      name: '@repo/a',
      exports: { '.': { worker: { default: './dist/worker.mjs' } } }
    });
    writeJson(join(root, 'packages/b/package.json'), {
      name: '@repo/b',
      exports: { '.': { worker: { default: './dist/worker.mjs' } } }
    });
    writeText(join(root, 'packages/a/dist/worker.mjs'), "import '@repo/b';\n");
    writeText(
      join(root, 'packages/b/dist/worker.mjs'),
      "import { readFile } from 'node:fs/promises';\nreadFile('/tmp/x');\n"
    );

    const availablePackages = await discoverWorkspacePackages(root);
    const packages = availablePackages.filter((pkg) => matchesPackageFilter(pkg, '@repo/a'));
    const result = await runCheck(packages, availablePackages);

    expect(result.diagnostics).toEqual([]);
    expect(result.visitedFiles).toEqual([
      join(root, 'packages/a/dist/worker.mjs'),
      join(root, 'packages/b/dist/worker.mjs')
    ]);
  });

  it('discovers npm workspaces and filters by name or path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'check-llrt-worker-'));
    tempDirs.push(root);

    writeJson(join(root, 'package.json'), { private: true, workspaces: ['packages/*'] });
    writeJson(join(root, 'packages/alpha/package.json'), { name: '@repo/alpha' });
    writeJson(join(root, 'packages/beta/package.json'), { name: '@repo/beta' });

    const packages = await discoverWorkspacePackages(root);
    expect(packages.map((pkg) => pkg.name)).toEqual(['@repo/alpha', '@repo/beta']);
    expect(packages.filter((pkg) => matchesPackageFilter(pkg, '@repo/alpha', root)).map((pkg) => pkg.name)).toEqual([
      '@repo/alpha'
    ]);
    expect(packages.filter((pkg) => matchesPackageFilter(pkg, 'packages/b*', root)).map((pkg) => pkg.name)).toEqual([
      '@repo/beta'
    ]);
  });

  it('discovers pnpm workspaces with exclusions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'check-llrt-worker-'));
    tempDirs.push(root);

    writeText(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n  - '!packages/ignored'\n");
    writeJson(join(root, 'packages/alpha/package.json'), { name: '@repo/alpha' });
    writeJson(join(root, 'packages/ignored/package.json'), { name: '@repo/ignored' });

    expect(parsePnpmWorkspacePackages('packages:\n  - \'packages/*\'\n  - "!packages/ignored"\n')).toEqual([
      'packages/*',
      '!packages/ignored'
    ]);
    expect((await discoverWorkspacePackages(root)).map((pkg) => pkg.name)).toEqual(['@repo/alpha']);
  });
});
