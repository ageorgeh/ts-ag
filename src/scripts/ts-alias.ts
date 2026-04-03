#!/usr/bin/env bun

import console from 'console';
// NOTE: dont use aliases here cause this file needs to be compiled first
import { existsSync } from 'fs';
import { dirname, isAbsolute, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

import type { FSWatcher } from 'chokidar';
import { watch } from 'chokidar';
import { type TsConfigResult, parseTsconfig } from 'get-tsconfig';
import { replaceTscAliasPaths } from 'tsc-alias';

import { colorText } from '../utils/cli.js';

const RELEVANT_OUTPUT_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.d.ts', '.d.mts', '.d.cts'];

const LABEL = colorText('cyan', '[ts-alias]');
const formatPath = (filePath: string): string => colorText('dim', relative(process.cwd(), filePath));
const logInfo = (message: string): void => console.log(`${LABEL} ${message}`);
const logWarn = (message: string): void => console.warn(`${LABEL} ${colorText('yellow', message)}`);
const logError = (message: string): void => console.error(`${LABEL} ${colorText('red', message)}`);

export type AliasTarget = { configPath: string; outDir: string };

export function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

/**
 * If the path refers to a file then it returns it otherwise joins tsconfig.json
 */
export function resolveTsConfigPath(refAbsPath: string): string {
  if (refAbsPath.endsWith('.json')) return refAbsPath;
  return resolve(refAbsPath, 'tsconfig.json');
}

export function resolveOutDir(tsconfigPath: string, outDir: string): string {
  if (isAbsolute(outDir)) return outDir;
  return resolve(dirname(tsconfigPath), outDir);
}

export function isAliasOutputFile(filePath: string): boolean {
  return RELEVANT_OUTPUT_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

export function isWithinDir(filePath: string, dirPath: string): boolean {
  const relPath = relative(dirPath, filePath);
  return relPath === '' || (!relPath.startsWith('..') && !isAbsolute(relPath));
}

export async function discoverAliasTargets(
  entry: string,
  verbose: boolean
): Promise<{ targets: AliasTarget[]; visitedConfigs: string[] }> {
  const loadedConfigs = new Map<string, TsConfigResult>();
  const visited = new Set<string>();
  const queue: string[] = [entry];

  while (queue.length) {
    const tsconfigPath = queue.shift()!;
    if (visited.has(tsconfigPath)) continue;
    visited.add(tsconfigPath);

    let res: TsConfigResult;

    try {
      const config = parseTsconfig(tsconfigPath);
      if (config) res = { path: tsconfigPath, config };
      else throw new Error('Null returned from getTsConfig');
    } catch (error) {
      logWarn(`Skipping unreadable config: ${formatPath(tsconfigPath)}`);
      if (verbose) console.warn(error);
      continue;
    }

    loadedConfigs.set(res.path, res);

    const refs = unique(
      (res.config.references ?? []).map((ref) => {
        const absPath = resolve(dirname(res.path), ref.path);
        return resolveTsConfigPath(absPath);
      })
    );

    for (const refPath of refs) queue.push(refPath);
  }

  const targets = Array.from(loadedConfigs.values())
    .map((res): AliasTarget | undefined => {
      const outDir = res.config.compilerOptions?.outDir;
      if (typeof outDir !== 'string' || outDir.length === 0) {
        if (verbose) logWarn(`Skipping ${formatPath(res.path)} (compilerOptions.outDir is not set)`);
        return undefined;
      }

      return { configPath: res.path, outDir: resolveOutDir(res.path, outDir) };
    })
    .filter((target): target is AliasTarget => target !== undefined);

  return { targets, visitedConfigs: Array.from(visited) };
}

export async function processAliasTarget(target: AliasTarget): Promise<void> {
  if (!existsSync(target.outDir)) {
    logWarn(`Skipping ${formatPath(target.configPath)} (missing outDir ${formatPath(target.outDir)})`);
    return;
  }

  try {
    await replaceTscAliasPaths({ configFile: target.configPath, outDir: target.outDir });
    logInfo(`${colorText('green', 'updated')} ${formatPath(target.outDir)} <- ${formatPath(target.configPath)}`);
  } catch (error) {
    logError(`Failed processing ${formatPath(target.configPath)}`);
    console.error(error);
  }
}

export function syncWatcherPaths(watcher: FSWatcher, currentPaths: Set<string>, nextPaths: Set<string>): Set<string> {
  const toUnwatch = Array.from(currentPaths).filter((filePath) => !nextPaths.has(filePath));
  if (toUnwatch.length > 0) watcher.unwatch(toUnwatch);

  const toWatch = Array.from(nextPaths).filter((filePath) => !currentPaths.has(filePath));
  if (toWatch.length > 0) watcher.add(toWatch);

  return new Set(nextPaths);
}

export function createRegenerator(
  entry: string,
  verbose: boolean
): {
  run: (reason?: string) => Promise<void>;
  syncConfigWatcher: (watcher: FSWatcher) => void;
  syncOutputWatcher: (watcher: FSWatcher) => void;
  getTargets: () => AliasTarget[];
} {
  let isRunning = false;
  let rerunRequested = false;
  let watchedConfigs = new Set<string>();
  let watchedOutputDirs = new Set<string>();
  let syncedConfigPaths = new Set<string>();
  let syncedOutputDirs = new Set<string>();
  let targets: AliasTarget[] = [];

  const run = async (reason?: string): Promise<void> => {
    if (isRunning) {
      rerunRequested = true;
      return;
    }
    isRunning = true;

    try {
      do {
        rerunRequested = false;
        if (reason) {
          logInfo(`${colorText('cyan', 'regenerate')} (${reason})`);
          reason = undefined;
        }

        const result = await discoverAliasTargets(entry, verbose);
        targets = result.targets;
        watchedConfigs = new Set(result.visitedConfigs);
        watchedOutputDirs = new Set(unique(result.targets.map((target) => target.outDir)));

        if (targets.length === 0) {
          logWarn('No tsconfig files with compilerOptions.outDir were found');
        } else {
          await Promise.all(targets.map((target) => processAliasTarget(target)));
        }
      } while (rerunRequested);
    } finally {
      isRunning = false;
    }
  };

  const syncConfigWatcher = (watcher: FSWatcher): void => {
    syncedConfigPaths = syncWatcherPaths(watcher, syncedConfigPaths, watchedConfigs);
  };

  const syncOutputWatcher = (watcher: FSWatcher): void => {
    syncedOutputDirs = syncWatcherPaths(watcher, syncedOutputDirs, watchedOutputDirs);
  };

  return { run, syncConfigWatcher, syncOutputWatcher, getTargets: () => targets };
}

// Main function
export async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      config: { type: 'string', short: 'c' },
      watch: { type: 'boolean', short: 'w' },
      verbose: { type: 'boolean', short: 'v' }
    }
  });

  const entry = values.config ? resolve(values.config) : null;
  if (!entry) {
    logError('Missing required flag: --config <path/to/tsconfig.json>');
    process.exit(1);
  }
  if (!existsSync(entry)) {
    logError(`Config file not found: ${formatPath(entry)}`);
    process.exit(1);
  }

  const watchMode = values.watch === true;
  const verbose = values.verbose === true;
  const regenerator = createRegenerator(entry, verbose);

  await regenerator.run('initial run');

  if (!watchMode) return;

  logInfo('watch mode enabled');
  const configWatcher = watch([], {
    persistent: true,
    ignoreInitial: true,
    ignored: ['**/node_modules/**'],
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  });
  const outputWatcher = watch([], {
    persistent: true,
    ignoreInitial: true,
    ignored: ['**/node_modules/**'],
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  });

  regenerator.syncConfigWatcher(configWatcher);
  regenerator.syncOutputWatcher(outputWatcher);

  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduleTarget = (target: AliasTarget, reason: string): void => {
    const key = `${target.configPath}::${target.outDir}`;
    const existing = pending.get(key);
    if (existing) clearTimeout(existing);

    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        void processAliasTarget(target);
        if (verbose) logInfo(`${colorText('cyan', 'reprocess')} (${reason})`);
      }, 200)
    );
  };

  const scheduleTargetsForPath = (filePath: string, reason: string): void => {
    const resolvedPath = resolve(filePath);

    for (const target of regenerator.getTargets()) {
      if (resolvedPath === target.outDir) {
        scheduleTarget(target, reason);
        continue;
      }
      if (isAliasOutputFile(resolvedPath) && isWithinDir(resolvedPath, target.outDir)) {
        scheduleTarget(target, reason);
      }
    }
  };

  configWatcher.on('change', async (filePath) => {
    logInfo(`${colorText('cyan', 'change')} ${formatPath(filePath)}`);
    await regenerator.run(`changed ${relative(process.cwd(), filePath)}`);
    regenerator.syncConfigWatcher(configWatcher);
    regenerator.syncOutputWatcher(outputWatcher);
  });

  configWatcher.on('add', async (filePath) => {
    logInfo(`${colorText('cyan', 'add')} ${formatPath(filePath)}`);
    await regenerator.run(`added ${relative(process.cwd(), filePath)}`);
    regenerator.syncConfigWatcher(configWatcher);
    regenerator.syncOutputWatcher(outputWatcher);
  });

  configWatcher.on('unlink', async (filePath) => {
    logInfo(`${colorText('yellow', 'remove')} ${formatPath(filePath)}`);
    await regenerator.run(`removed ${relative(process.cwd(), filePath)}`);
    regenerator.syncConfigWatcher(configWatcher);
    regenerator.syncOutputWatcher(outputWatcher);
  });

  outputWatcher.on('addDir', (dirPath) => {
    scheduleTargetsForPath(dirPath, `created ${relative(process.cwd(), dirPath)}`);
  });

  outputWatcher.on('add', (filePath) => {
    scheduleTargetsForPath(filePath, `added ${relative(process.cwd(), filePath)}`);
  });

  outputWatcher.on('change', (filePath) => {
    scheduleTargetsForPath(filePath, `changed ${relative(process.cwd(), filePath)}`);
  });
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  main().catch((error) => {
    logError('Unhandled error in ts-alias script');
    console.error(error);
    process.exit(1);
  });
}
