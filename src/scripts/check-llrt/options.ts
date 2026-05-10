import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { glob } from 'glob';
import { unique } from 'radash';

import { type CheckOptions, DEFAULT_LLRT_API_URL, type PackageInfo, type PackageJson } from './types.js';

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export async function parseCliOptions(): Promise<CheckOptions> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'api-url': { type: 'string' },
      filter: { type: 'string', short: 'f', multiple: true },
      package: { type: 'string', short: 'p', multiple: true },
      verbose: { type: 'boolean', short: 'v' },
      workspace: { type: 'string', short: 'w', multiple: true }
    }
  });

  const apiUrl = values['api-url'] ?? process.env.LLRT_API_URL ?? DEFAULT_LLRT_API_URL;
  const { packages, availablePackages } = await selectPackages(
    toArray(values.package).map((packagePath) => path.resolve(packagePath)),
    toArray(values.workspace).map((workspacePath) => path.resolve(workspacePath)),
    toArray(values.filter)
  );

  return {
    apiUrl,
    packages,
    availablePackages,
    verbose: values.verbose === true,
    llrtApiMarkdown: parseLlrtApi(await fetchLlrtApiMarkdown(apiUrl))
  };
}

// llrt spec
async function fetchLlrtApiMarkdown(apiUrl: string): Promise<string> {
  const apiResponse = await fetch(apiUrl);
  if (!apiResponse.ok) throw new Error(`Failed to fetch LLRT API docs from ${apiUrl}: ${apiResponse.status}`);
  return apiResponse.text();
}

export function parseLlrtApi(markdown: string): Map<string, Set<string>> {
  const support = new Map<string, Set<string>>();
  let currentModule: string | undefined;

  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    const moduleMatch = /^##\s+([a-z_]+(?:\/[a-z_-]+)*)$/.exec(trimmed);
    if (moduleMatch) {
      currentModule = moduleMatch[1];
      support.set(currentModule, new Set());
      continue;
    }

    if (trimmed.startsWith('## ')) currentModule = undefined;
    if (!currentModule) continue;

    const memberMatch = /^\[([^\]]+)\]\(/.exec(trimmed);
    if (memberMatch) support.get(currentModule)?.add(memberMatch[1]);
  }

  return support;
}

// packages
async function selectPackages(
  packagePaths: string[],
  workspacePaths: string[],
  filters: string[]
): Promise<{ packages: PackageInfo[]; availablePackages: PackageInfo[] }> {
  const explicitPaths = packagePaths.length > 0 ? packagePaths : workspacePaths.length === 0 ? [process.cwd()] : [];
  const packageMap = new Map<string, PackageInfo>();

  for (const packagePath of explicitPaths) {
    const pkg = await readPackage(packagePath);
    packageMap.set(pkg.dir, pkg);
  }

  for (const workspacePath of workspacePaths) {
    for (const pkg of await discoverWorkspacePackages(workspacePath)) packageMap.set(pkg.dir, pkg);
  }

  const availablePackages = [...packageMap.values()].sort((a, b) => a.dir.localeCompare(b.dir));
  if (filters.length === 0) return { packages: availablePackages, availablePackages };

  return {
    packages: availablePackages.filter((pkg) => filters.some((filter) => matchesPackageFilter(pkg, filter))),
    availablePackages
  };
}

export async function readPackage(packagePath: string): Promise<PackageInfo> {
  const resolvedPath = path.resolve(packagePath);
  const packageJsonPath = resolvedPath.endsWith('package.json')
    ? resolvedPath
    : path.join(resolvedPath, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as PackageJson;
  const dir = path.dirname(packageJsonPath);

  return { name: packageJson.name ?? path.basename(dir), dir, packageJsonPath, packageJson };
}

export async function discoverWorkspacePackages(workspacePath: string): Promise<PackageInfo[]> {
  const root = path.resolve(workspacePath);
  const patterns = await readWorkspacePackagePatterns(root);

  if (patterns.length === 0) {
    const rootPackageJson = path.join(root, 'package.json');
    return existsSync(rootPackageJson) ? [await readPackage(rootPackageJson)] : [];
  }

  const includePatterns = patterns.filter((pattern) => !pattern.startsWith('!'));
  const excludePatterns = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => path.posix.join(pattern.slice(1).replace(/\\/g, '/'), 'package.json'));

  const packageJsonPaths = await glob(
    includePatterns.map((pattern) => path.posix.join(pattern.replace(/\\/g, '/'), 'package.json')),
    { absolute: true, cwd: root, ignore: ['**/node_modules/**', ...excludePatterns], nodir: true }
  );

  const packages = await Promise.all(packageJsonPaths.map((packageJsonPath) => readPackage(packageJsonPath)));
  return packages.sort((a, b) => a.dir.localeCompare(b.dir));
}

async function readWorkspacePackagePatterns(root: string): Promise<string[]> {
  const rootPackageJsonPath = path.join(root, 'package.json');
  const pnpmWorkspacePath = path.join(root, 'pnpm-workspace.yaml');
  const patterns: string[] = [];

  if (existsSync(rootPackageJsonPath)) {
    const rootPackage = JSON.parse(await readFile(rootPackageJsonPath, 'utf8')) as PackageJson;
    if (Array.isArray(rootPackage.workspaces)) patterns.push(...rootPackage.workspaces);
    else if (Array.isArray(rootPackage.workspaces?.packages)) patterns.push(...rootPackage.workspaces.packages);
  }

  if (existsSync(pnpmWorkspacePath))
    patterns.push(...parsePnpmWorkspacePackages(await readFile(pnpmWorkspacePath, 'utf8')));

  return unique(patterns);
}

export function parsePnpmWorkspacePackages(yaml: string): string[] {
  const patterns: string[] = [];
  let inPackages = false;
  let packageIndent = -1;

  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    if (trimmed === 'packages:') {
      inPackages = true;
      packageIndent = line.search(/\S/);
      continue;
    }

    if (!inPackages) continue;

    const indent = line.search(/\S/);
    if (indent <= packageIndent) break;

    const match = /^-\s+(.+)$/.exec(trimmed);
    if (match) patterns.push(stripYamlString(match[1]));
  }

  return patterns;
}

function stripYamlString(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function matchesPackageFilter(pkg: PackageInfo, filter: string, root = process.cwd()): boolean {
  const normalizedFilter = filter.replace(/\\/g, '/');
  const relativeDir = path.relative(root, pkg.dir).replace(/\\/g, '/');

  // has glob or not
  if (/[*?[\]{}]/.test(normalizedFilter)) {
    const regex = globPatternToRegex(normalizedFilter);
    return regex.test(pkg.name) || regex.test(relativeDir);
  }

  return (
    pkg.name === normalizedFilter || relativeDir === normalizedFilter || relativeDir.startsWith(`${normalizedFilter}/`)
  );
}

function globPatternToRegex(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const nextChar = pattern[index + 1];

    if (char === '*' && nextChar === '*') {
      source += '.*';
      index++;
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }

  return new RegExp(`^${source}$`);
}
