#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

interface Args {
  dirExcludes: string[];
  dirIncludes: string[];
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dirExcludes: string[] = [];
  const dirIncludes: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir-excludes' && args[i + 1]) {
      dirExcludes.push(args[i + 1]);
      i++;
    } else if (args[i] === '--dir-includes' && args[i + 1]) {
      dirIncludes.push(args[i + 1]);
      i++;
    }
  }
  return { dirExcludes, dirIncludes };
}

function shouldExclude(dir: string, excludes: string[]): boolean {
  return excludes.some((ex) => path.basename(dir) === ex);
}

function shouldInclude(dir: string, includes: string[]): boolean {
  if (includes.length === 0) return true;
  return includes.some((inc) => dir.includes(inc));
}

function removeDir(targetPath: string) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    console.log(`Removed: ${targetPath}`);
  }
}

function clean(root: string, args: Args) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      if (entry.name === 'dist') {
        const distParentDir = path.dirname(fullPath);
        const siblingDirs = fs
          .readdirSync(distParentDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);

        const shouldExcludeSibling = args.dirExcludes.some((ex) => siblingDirs.includes(ex));
        const shouldIncludeSibling =
          args.dirIncludes.length === 0 || args.dirIncludes.some((inc) => siblingDirs.includes(inc));

        if (!shouldExcludeSibling && shouldIncludeSibling) {
          removeDir(fullPath);
        }
        continue;
      }
      if (!shouldExclude(fullPath, args.dirExcludes)) {
        clean(fullPath, args);
      }
    } else if (entry.name === 'tsconfig.tsbuildinfo') {
      removeDir(fullPath);
    }
  }
}

const args = parseArgs();
clean(process.cwd(), args);
