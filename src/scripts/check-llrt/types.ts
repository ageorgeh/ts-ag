import { styleText } from 'node:util';

import type { Node } from 'acorn';

export type AnyNode = Node & Record<string, any>;
export type Binding = { moduleName: string; importedPath: string; kind: 'default' | 'named' | 'namespace' };
export type Diagnostic = { packageName: string; filePath: string; message: string };
export type PackageJson = { name?: string; exports?: unknown; workspaces?: string[] | { packages?: string[] } };
export type PackageInfo = { name: string; dir: string; packageJsonPath: string; packageJson: PackageJson };
export type WorkerTarget = { packageName: string; exportKey: string; filePath: string };
export type CheckOptions = {
  apiUrl: string;
  packages: PackageInfo[];
  availablePackages: PackageInfo[];
  verbose: boolean;
  /** For automated tests */
  llrtApiMarkdown: Map<string, Set<string>>;
};
export type CheckResult = {
  checkedApiUrl: string;
  diagnostics: Diagnostic[];
  packages: PackageInfo[];
  targets: WorkerTarget[];
  usageByModule: Map<string, Set<string>>;
  visitedFiles: string[];
};

export const DEFAULT_LLRT_API_URL = 'https://raw.githubusercontent.com/awslabs/llrt/main/API.md';
export const JS_EXTENSIONS = ['.mjs', '.js', '.cjs'];
export const EXPORT_CONDITION_KEYS = new Set([
  'browser',
  'default',
  'deno',
  'development',
  'import',
  'node',
  'production',
  'require',
  'worker'
]);

export const LABEL = styleText('cyan', '[check-llrt-worker]');
