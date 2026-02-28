#!/usr/bin/env bun

import console from 'console';
// NOTE: dont use aliases here cause this file needs to be compiled first
import { existsSync } from 'fs';
import { dirname, join, basename, relative } from 'path';

import type { FSWatcher } from 'chokidar';
import { watch } from 'chokidar';
import { glob } from 'glob';
import { replaceTscAliasPaths } from 'tsc-alias';

import { colorText } from '../utils/cli.js';

// Parse command-line arguments
const args = process.argv.slice(2);
const watchMode = args.includes('-w') || args.includes('--watch');
const LABEL = colorText('cyan', '[ts-alias]');

const formatPath = (filePath: string): string => colorText('dim', relative(process.cwd(), filePath));
const logInfo = (message: string): void => console.log(`${LABEL} ${message}`);
const logWarn = (message: string): void => console.warn(`${LABEL} ${colorText('yellow', message)}`);
const logError = (message: string): void => console.error(`${LABEL} ${colorText('red', message)}`);

/**
 * Find all dist folders in the project directory, excluding certain patterns.
 */
async function findDistFolders(baseDir: string): Promise<string[]> {
  const ignorePatterns = [
    '**/node_modules/**',
    '**/\\.git/**',
    '**/\\.vscode/**',
    '**/\\.idea/**',
    '**/coverage/**',
    '**/build/**',
    '**/cdk.out/**'
  ];

  const distFolders = await glob('**/dist', { cwd: baseDir, ignore: ignorePatterns, absolute: true });

  return distFolders;
}

/**
 * Process the dist folder by replacing TypeScript alias paths with relative paths.
 */
async function processDistFolder(distFolder: string): Promise<void> {
  const projectRoot = dirname(distFolder);
  const tsconfigPath = join(projectRoot, 'tsconfig.json');

  if (!existsSync(tsconfigPath)) {
    logWarn(`No tsconfig.json at ${formatPath(tsconfigPath)}`);
    return;
  }

  try {
    await replaceTscAliasPaths({ configFile: tsconfigPath, outDir: distFolder });
    logInfo(`${colorText('green', 'updated')} ${formatPath(distFolder)}`);
  } catch (error) {
    logError(`Failed processing ${formatPath(distFolder)}`);
    console.error(error);
  }
}

/**
 * Watch the dist folder for changes and process it when files are added or changed.
 */
function watchDistFolder(distFolder: string): FSWatcher {
  let pending: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(distFolder, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  });

  const scheduleProcess = (): void => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      void processDistFolder(distFolder);
    }, 200);
  };

  watcher.on('add', (filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      scheduleProcess();
    }
  });

  watcher.on('change', (filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      scheduleProcess();
    }
  });

  return watcher;
}

// Main function
async function main(): Promise<void> {
  const baseDir = process.cwd();
  logInfo(`searching ${colorText('cyan', 'dist')} folders in ${formatPath(baseDir)}`);

  const distFolders = await findDistFolders(baseDir);

  // Process all folders initially if any exist
  if (distFolders.length > 0) {
    logInfo(`found ${distFolders.length} dist folder(s)`);

    await Promise.all(
      distFolders.map(async (folder) => {
        return await processDistFolder(folder);
      })
    );
  } else {
    logInfo('no dist folders found');
  }

  // Set up watchers if in watch mode
  if (watchMode) {
    logInfo('watch mode enabled');

    // Set up watchers for existing dist folders
    distFolders.forEach(watchDistFolder);

    // Watch for new dist folders being created
    logInfo('watching for new dist folders...');
    const dirWatcher = watch(baseDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 5, // Adjust depth as needed for your project structure
      ignored: [
        '**/node_modules/**',
        '**/\\.git/**',
        '**/\\.vscode/**',
        '**/\\.idea/**',
        '**/coverage/**',
        '**/build/**',
        '**/cdk.out/**',
        // Don't watch the contents of existing dist folders (they'll be watched separately)
        ...distFolders.map((folder) => `${folder}/**`)
      ]
    });

    // Handle directory creation events
    dirWatcher.on('addDir', async (dirPath) => {
      if (basename(dirPath) === 'dist') {
        // Make sure it's not already being watched
        if (!distFolders.includes(dirPath)) {
          logInfo(`${colorText('cyan', 'new dist')} ${formatPath(dirPath)}`);
          distFolders.push(dirPath);
          await processDistFolder(dirPath);
          watchDistFolder(dirPath);
        }
      }
    });
  }
}

main().catch((error) => {
  logError('Unhandled error in ts-alias script');
  console.error(error);
  process.exit(1);
});
