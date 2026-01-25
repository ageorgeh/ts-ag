#!/usr/bin/env node

import { existsSync, statSync, readFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import type { FSWatcher } from 'chokidar';
import { watch } from 'chokidar';
import { replaceTscAliasPaths } from 'tsc-alias';
import { glob } from 'glob';
import console from 'console';

// Cache for tsconfig.json files
const tsconfigCache: Map<string, { config: any; mtime: number }> = new Map();

// Parse command-line arguments
const args = process.argv.slice(2);
const watchMode = args.includes('-w') || args.includes('--watch');

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
 * Get the tsconfig.json file for a given dist folder.
 * This function caches the tsconfig file to avoid reading it multiple times.
 */
function getTsconfig(distFolder: string): any {
  const projectRoot = dirname(distFolder);
  const tsconfigPath = join(projectRoot, 'tsconfig.json');

  try {
    const stats = statSync(tsconfigPath);
    const mtime = stats.mtimeMs;

    // Check cache
    const cached = tsconfigCache.get(tsconfigPath);
    if (cached && cached.mtime === mtime) {
      return cached.config;
    }

    // Read and cache the config
    const config = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
    tsconfigCache.set(tsconfigPath, { config, mtime });

    return config;
  } catch (error) {
    console.error(`Error reading tsconfig at ${tsconfigPath}:`, error);
    return null;
  }
}

/**
 * Process the dist folder by replacing TypeScript alias paths with relative paths.
 */
async function processDistFolder(distFolder: string): Promise<void> {
  const projectRoot = dirname(distFolder);
  const tsconfigPath = join(projectRoot, 'tsconfig.json');

  if (!existsSync(tsconfigPath)) {
    console.warn(`No tsconfig.json found at ${tsconfigPath}`);
    return;
  }

  const tsconfig = getTsconfig(distFolder);

  if (!tsconfig) {
    console.warn(`Invalid tsconfig.json found for ${distFolder}`);
    return;
  }

  try {
    await replaceTscAliasPaths({ configFile: tsconfigPath, outDir: distFolder });
    console.log(`Successfully processed aliases in ${distFolder}`);
  } catch (error) {
    console.error(`Error processing aliases in ${distFolder}:`, error);
  }
}

/**
 * Watch the dist folder for changes and process it when files are added or changed.
 */
function watchDistFolder(distFolder: string): FSWatcher {
  console.log(`Setting up watcher for: ${distFolder}`);

  const watcher = watch(distFolder, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  });

  watcher.on('add', (filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      console.log(`File added: ${filePath}`);
      processDistFolder(distFolder);
    }
  });

  watcher.on('change', (filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      console.log(`File changed: ${filePath}`);
      processDistFolder(distFolder);
    }
  });

  return watcher;
}

// Main function
async function main(): Promise<void> {
  const baseDir = process.cwd();
  console.log(`Searching for dist folders in: ${baseDir}`);

  const distFolders = await findDistFolders(baseDir);

  // Process all folders initially if any exist
  if (distFolders.length > 0) {
    console.log(`Found ${distFolders.length} dist folders:`);
    distFolders.forEach((folder) => console.log(` - ${folder}`));

    for (const folder of distFolders) {
      await processDistFolder(folder);
    }
  } else {
    console.log('No dist folders found initially');
  }

  // Set up watchers if in watch mode
  if (watchMode) {
    console.log('Watch mode enabled, monitoring for changes...');

    // Set up watchers for existing dist folders
    distFolders.forEach(watchDistFolder);

    // Watch for new dist folders being created
    console.log('Watching for new dist folders...');
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
          console.log(`New dist folder detected: ${dirPath}`);
          distFolders.push(dirPath);
          await processDistFolder(dirPath);
          watchDistFolder(dirPath);
        }
      }
    });
  }
}

main().catch((error) => {
  console.error('Error in ts-alias script:', error);
  process.exit(1);
});
