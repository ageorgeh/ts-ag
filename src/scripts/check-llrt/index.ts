#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { styleText } from 'node:util';

import { parse } from 'acorn';
import { ancestor } from 'acorn-walk';

import { isDirectExecution } from '../utils.js';
import { parseCliOptions } from './options.js';
import {
  type CheckOptions,
  type CheckResult,
  type PackageInfo,
  type Binding,
  type WorkerTarget,
  EXPORT_CONDITION_KEYS,
  type AnyNode,
  JS_EXTENSIONS,
  LABEL,
  type Diagnostic
} from './types.js';

const nodeBuiltinModules = new Set(
  builtinModules
    .filter((moduleName) => !moduleName.startsWith('_'))
    .map((moduleName) => moduleName.replace(/^node:/, ''))
);

const formatPath = (filePath: string): string => styleText('dim', path.relative(process.cwd(), filePath));
const logInfo = (message: string): void => console.log(`${LABEL} ${message}`);
const logWarn = (message: string): void => console.warn(`${LABEL} ${styleText('yellow', message)}`);
const logError = (message: string): void => console.error(`${LABEL} ${styleText('red', message)}`);

export async function checkLlrtWorker(options: CheckOptions): Promise<CheckResult> {
  const llrtSupport = options.llrtApiMarkdown;
  const { packages, availablePackages } = options;
  const packageByName = new Map(availablePackages.map((pkg) => [pkg.name, pkg]));
  const diagnostics: Diagnostic[] = [];
  const usageByModule = new Map<string, Set<string>>();
  const visitedFiles = new Set<string>();

  const targets = packages.flatMap((pkg) => {
    const packageTargets = extractWorkerExportTargets(pkg);
    for (const target of packageTargets) {
      if (!existsSync(target.filePath)) {
        diagnostics.push({
          packageName: pkg.name,
          filePath: target.filePath,
          message: `worker export \`${target.exportKey}\` points to missing built file`
        });
      }
    }
    return packageTargets;
  });

  const visitFile = async (pkg: PackageInfo, filePath: string): Promise<void> => {
    const normalizedPath = path.resolve(filePath);
    const visitKey = `${pkg.name}:${normalizedPath}`;
    if (visitedFiles.has(visitKey)) return;
    visitedFiles.add(visitKey);

    const sourceText = await readFile(normalizedPath, 'utf8');
    const sourceFile = parseJs(sourceText);
    const bindings = new Map<string, Binding>();
    const pendingImports: string[] = [];

    collectImports(sourceFile, bindings, pendingImports, diagnostics, pkg.name, normalizedPath, llrtSupport);
    walkValueReferences(sourceFile, bindings, diagnostics, usageByModule, pkg.name, normalizedPath, llrtSupport);

    for (const specifier of pendingImports) {
      const resolved = resolveImportSpecifier(specifier, normalizedPath, packageByName, diagnostics, pkg.name);
      if (resolved) await visitFile(resolved.pkg, resolved.filePath);
    }
  };

  for (const target of targets) {
    const pkg = packageByName.get(target.packageName);
    if (pkg && existsSync(target.filePath)) await visitFile(pkg, target.filePath);
  }

  if (options.verbose && packages.length === 0) logWarn('No packages were selected');

  return {
    checkedApiUrl: options.apiUrl,
    diagnostics,
    packages,
    targets,
    usageByModule,
    visitedFiles: [...visitedFiles].map((key) => key.slice(key.indexOf(':') + 1)).sort()
  };
}

export function extractWorkerExportTargets(pkg: PackageInfo): WorkerTarget[] {
  const exportsValue = pkg.packageJson.exports;
  if (exportsValue === undefined) return [];

  const entries: [string, unknown][] = isExportMap(exportsValue) ? Object.entries(exportsValue) : [['.', exportsValue]];
  const targets: WorkerTarget[] = [];

  for (const [exportKey, exportValue] of entries) {
    for (const target of collectWorkerTargets(exportValue, false)) {
      if (isJsFile(target)) {
        targets.push({ packageName: pkg.name, exportKey, filePath: path.resolve(pkg.dir, target) });
      }
    }
  }

  return uniqueTargets(targets);
}

function collectWorkerTargets(value: unknown, inWorkerBranch: boolean): string[] {
  if (typeof value === 'string') return inWorkerBranch ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectWorkerTargets(item, inWorkerBranch));
  if (!isPlainObject(value)) return [];

  const targets: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === 'types') continue;
    if (key === 'worker') targets.push(...collectWorkerTargets(child, true));
    else if (inWorkerBranch) targets.push(...collectWorkerTargets(child, true));
  }
  return targets;
}

function resolveImportSpecifier(
  specifier: string,
  containingFile: string,
  packageByName: Map<string, PackageInfo>,
  diagnostics: Diagnostic[],
  packageName: string
): { pkg: PackageInfo; filePath: string } | undefined {
  if (isRelativeSpecifier(specifier)) {
    const filePath = resolveJsPath(path.resolve(path.dirname(containingFile), specifier));
    return filePath
      ? { pkg: findPackageForFile(filePath, packageByName) ?? packageByName.get(packageName)!, filePath }
      : undefined;
  }

  const parsedPackageSpecifier = parsePackageSpecifier(specifier);
  const pkg = packageByName.get(parsedPackageSpecifier.name);
  if (!pkg) return undefined;

  const exportKey = parsedPackageSpecifier.subpath ? `.${parsedPackageSpecifier.subpath}` : '.';
  const target = resolvePackageExportTarget(pkg.packageJson.exports, exportKey, ['worker', 'import', 'default']);
  if (!target) return undefined;

  const filePath = path.resolve(pkg.dir, target);
  if (!existsSync(filePath)) {
    diagnostics.push({
      packageName,
      filePath,
      message: `workspace import \`${specifier}\` resolves to missing built file`
    });
    return undefined;
  }

  return { pkg, filePath };
}

function resolvePackageExportTarget(
  exportsValue: unknown,
  exportKey: string,
  conditions: string[]
): string | undefined {
  if (exportsValue === undefined) return undefined;
  if (!isExportMap(exportsValue))
    return exportKey === '.' ? selectConditionalTarget(exportsValue, conditions) : undefined;
  return selectConditionalTarget(exportsValue[exportKey], conditions);
}

function selectConditionalTarget(value: unknown, conditions: string[]): string | undefined {
  if (typeof value === 'string') return isJsFile(value) ? value : undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = selectConditionalTarget(item, conditions);
      if (target) return target;
    }
    return undefined;
  }
  if (!isPlainObject(value)) return undefined;

  for (const condition of conditions) {
    const target = selectConditionalTarget(value[condition], conditions);
    if (target) return target;
  }

  return undefined;
}

function collectImports(
  sourceFile: AnyNode,
  bindings: Map<string, Binding>,
  pendingImports: string[],
  diagnostics: Diagnostic[],
  packageName: string,
  filePath: string,
  support: Map<string, Set<string>>
): void {
  ancestor(sourceFile, {
    ImportDeclaration(node: AnyNode): void {
      const specifier = getLiteralString(node.source);
      if (!specifier) return;
      if (isBuiltinModule(specifier)) {
        collectBuiltinImportSpecifiers(
          node.specifiers ?? [],
          specifier,
          bindings,
          diagnostics,
          packageName,
          filePath,
          support
        );
      } else {
        pendingImports.push(specifier);
      }
    },
    ExportNamedDeclaration(node: AnyNode): void {
      const specifier = getLiteralString(node.source);
      if (!specifier) return;
      if (isBuiltinModule(specifier)) {
        validateBuiltinModule(specifier, diagnostics, packageName, filePath, support);
        for (const spec of node.specifiers ?? []) {
          const importedName = getExportedImportName(spec);
          if (importedName)
            validatePath(
              packageName,
              filePath,
              normalizeBuiltinName(specifier),
              importedName,
              support,
              diagnostics,
              'imports'
            );
        }
      } else {
        pendingImports.push(specifier);
      }
    },
    ExportAllDeclaration(node: AnyNode): void {
      const specifier = getLiteralString(node.source);
      if (!specifier) return;
      if (isBuiltinModule(specifier)) {
        const moduleName = normalizeBuiltinName(specifier);
        validateBuiltinModule(specifier, diagnostics, packageName, filePath, support);
        diagnostics.push({
          packageName,
          filePath,
          message: `re-exports entire builtin module \`${moduleName}\`, which cannot be validated against LLRT's partial API surface`
        });
      } else {
        pendingImports.push(specifier);
      }
    },
    ImportExpression(node: AnyNode): void {
      const specifier = getLiteralString(node.source);
      if (!specifier) return;
      if (isBuiltinModule(specifier)) validateBuiltinModule(specifier, diagnostics, packageName, filePath, support);
      else pendingImports.push(specifier);
    },
    CallExpression(node: AnyNode, ancestors: AnyNode[]): void {
      if (!isRequireCall(node)) return;
      const parent = ancestors.at(-2);
      if (parent?.type === 'VariableDeclarator' && parent.init === node) return;
      const specifier = getLiteralString(node.arguments?.[0]);
      if (!specifier) return;
      if (isBuiltinModule(specifier)) validateBuiltinModule(specifier, diagnostics, packageName, filePath, support);
      else pendingImports.push(specifier);
    },
    VariableDeclarator(node: AnyNode): void {
      if (!isRequireCall(node.init)) return;
      const specifier = getLiteralString(node.init.arguments?.[0]);
      if (!specifier) return;

      if (isBuiltinModule(specifier)) {
        collectRequireBinding(node.id, specifier, bindings, diagnostics, packageName, filePath, support);
      }
    }
  });
}

function collectRequireBinding(
  pattern: AnyNode,
  specifier: string,
  bindings: Map<string, Binding>,
  diagnostics: Diagnostic[],
  packageName: string,
  filePath: string,
  support: Map<string, Set<string>>
): void {
  const moduleName = normalizeBuiltinName(specifier);
  if (!validateBuiltinModule(specifier, diagnostics, packageName, filePath, support)) return;

  if (pattern.type === 'Identifier') {
    bindings.set(pattern.name, { moduleName, importedPath: '', kind: 'default' });
    return;
  }

  if (pattern.type !== 'ObjectPattern') return;

  for (const property of pattern.properties ?? []) {
    if (property.type !== 'Property') continue;

    const importedName = getPropertyName(property.key);
    const localName = property.value?.type === 'Identifier' ? property.value.name : undefined;
    if (!importedName || !localName) continue;

    validatePath(packageName, filePath, moduleName, importedName, support, diagnostics, 'imports');
    bindings.set(localName, { moduleName, importedPath: importedName, kind: 'named' });
  }
}

function collectBuiltinImportSpecifiers(
  specifiers: AnyNode[],
  specifier: string,
  bindings: Map<string, Binding>,
  diagnostics: Diagnostic[],
  packageName: string,
  filePath: string,
  support: Map<string, Set<string>>
): void {
  const moduleName = normalizeBuiltinName(specifier);
  const supportedMembers = support.get(moduleName);
  if (!validateBuiltinModule(specifier, diagnostics, packageName, filePath, support)) return;

  for (const spec of specifiers) {
    if (spec.type === 'ImportDefaultSpecifier' || spec.type === 'ImportNamespaceSpecifier') {
      bindings.set(spec.local.name, {
        moduleName,
        importedPath: '',
        kind: spec.type === 'ImportDefaultSpecifier' ? 'default' : 'namespace'
      });
      continue;
    }

    if (spec.type !== 'ImportSpecifier') continue;
    const importedName = getModuleExportName(spec.imported);
    const localName = spec.local?.name;
    if (!importedName || !localName) continue;

    validatePath(packageName, filePath, moduleName, importedName, support, diagnostics, 'imports');
    bindings.set(localName, { moduleName, importedPath: importedName, kind: 'named' });
  }

  if (specifiers.length === 0 && supportedMembers) return;
}

function walkValueReferences(
  sourceFile: AnyNode,
  bindings: Map<string, Binding>,
  diagnostics: Diagnostic[],
  usageByModule: Map<string, Set<string>>,
  packageName: string,
  filePath: string,
  support: Map<string, Set<string>>
): void {
  const visitedIdentifiers = new Set<number>();

  ancestor(sourceFile, {
    Identifier(node: AnyNode, ancestors: AnyNode[]): void {
      const binding = bindings.get(node.name);
      if (!binding || !isValueReference(node, ancestors) || visitedIdentifiers.has(node.start)) return;
      visitedIdentifiers.add(node.start);

      const usedPath = getUsedPath(node, ancestors, binding);
      if (!usedPath) {
        diagnostics.push({
          packageName,
          filePath,
          message: `uses \`${node.name}\` from \`${binding.moduleName}\` in a way this check cannot validate statically`
        });
        return;
      }

      const usedPaths = usageByModule.get(binding.moduleName) ?? new Set<string>();
      usedPaths.add(usedPath);
      usageByModule.set(binding.moduleName, usedPaths);
      validatePath(packageName, filePath, binding.moduleName, usedPath, support, diagnostics, 'uses');
    }
  });
}

function getUsedPath(identifier: AnyNode, ancestors: AnyNode[], binding: Binding): string | undefined {
  let current = identifier;
  const segments: string[] = [];

  for (let index = ancestors.length - 2; index >= 0; index--) {
    const parent = ancestors[index];
    if (parent.type !== 'MemberExpression' || parent.object !== current || parent.computed) break;
    const propertyName = getPropertyName(parent.property);
    if (!propertyName) break;
    segments.push(propertyName);
    current = parent;
  }

  const usedPath = (binding.importedPath ? [binding.importedPath, ...segments] : segments).join('.');
  return usedPath || undefined;
}

function validateBuiltinModule(
  specifier: string,
  diagnostics: Diagnostic[],
  packageName: string,
  filePath: string,
  support: Map<string, Set<string>>
): boolean {
  const moduleName = normalizeBuiltinName(specifier);
  if (support.has(moduleName)) return true;

  diagnostics.push({ packageName, filePath, message: `imports unsupported builtin module \`${moduleName}\`` });
  return false;
}

function validatePath(
  packageName: string,
  filePath: string,
  moduleName: string,
  usedPath: string,
  support: Map<string, Set<string>>,
  diagnostics: Diagnostic[],
  verb: 'imports' | 'uses'
): void {
  const supportedMembers = support.get(moduleName) ?? new Set<string>();
  let prefix = usedPath;
  while (prefix) {
    if (supportedMembers.has(prefix)) return;
    const dotIndex = prefix.lastIndexOf('.');
    if (dotIndex === -1) break;
    prefix = prefix.slice(0, dotIndex);
  }

  diagnostics.push({
    packageName,
    filePath,
    message: `${verb} \`${usedPath}\` from \`${moduleName}\`, but LLRT API.md does not list it`
  });
}

function parseJs(sourceText: string): AnyNode {
  try {
    return parse(sourceText, { allowHashBang: true, ecmaVersion: 'latest', sourceType: 'module' }) as AnyNode;
  } catch {
    return parse(sourceText, { allowHashBang: true, ecmaVersion: 'latest', sourceType: 'script' }) as AnyNode;
  }
}

function isValueReference(identifier: AnyNode, ancestors: AnyNode[]): boolean {
  const parent = ancestors.at(-2);

  if (!parent) return false;
  if (
    parent.type === 'ImportSpecifier' ||
    parent.type === 'ImportDefaultSpecifier' ||
    parent.type === 'ImportNamespaceSpecifier'
  )
    return false;
  if (parent.type === 'ExportSpecifier') return false;
  if (parent.type === 'MemberExpression' && parent.property === identifier && !parent.computed) return false;
  if (parent.type === 'Property' && parent.key === identifier && !parent.computed) return false;
  if (parent.type === 'VariableDeclarator' && parent.id === identifier) return false;
  if (parent.type === 'FunctionDeclaration' && parent.id === identifier) return false;
  if (parent.type === 'FunctionExpression' && parent.id === identifier) return false;
  if (parent.type === 'ClassDeclaration' && parent.id === identifier) return false;
  if (parent.type === 'ClassExpression' && parent.id === identifier) return false;
  if (parent.type === 'LabeledStatement') return false;

  return true;
}

function resolveJsPath(basePath: string): string | undefined {
  if (existsSync(basePath) && isJsFile(basePath)) return basePath;

  for (const extension of JS_EXTENSIONS) {
    const filePath = `${basePath}${extension}`;
    if (existsSync(filePath)) return filePath;
  }

  for (const extension of JS_EXTENSIONS) {
    const filePath = path.join(basePath, `index${extension}`);
    if (existsSync(filePath)) return filePath;
  }

  return undefined;
}

function findPackageForFile(filePath: string, packageByName: Map<string, PackageInfo>): PackageInfo | undefined {
  return [...packageByName.values()]
    .sort((a, b) => b.dir.length - a.dir.length)
    .find((pkg) => isWithinDir(filePath, pkg.dir));
}

function parsePackageSpecifier(specifier: string): { name: string; subpath: string } {
  if (specifier.startsWith('@')) {
    const [scope, name, ...subpath] = specifier.split('/');
    return { name: `${scope}/${name}`, subpath: subpath.length > 0 ? `/${subpath.join('/')}` : '' };
  }

  const [name, ...subpath] = specifier.split('/');
  return { name, subpath: subpath.length > 0 ? `/${subpath.join('/')}` : '' };
}

function getExportedImportName(specifier: AnyNode): string | undefined {
  return getModuleExportName(specifier.local ?? specifier.exported);
}

function getModuleExportName(node: AnyNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}

function getPropertyName(node: AnyNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'PrivateIdentifier') return undefined;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}

function getLiteralString(node: AnyNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}

function isRequireCall(node: AnyNode | undefined | null): node is AnyNode {
  return node?.callee?.type === 'Identifier' && node.callee.name === 'require';
}

function isBuiltinModule(specifier: string): boolean {
  return nodeBuiltinModules.has(normalizeBuiltinName(specifier));
}

function normalizeBuiltinName(specifier: string): string {
  return specifier.replace(/^node:/, '');
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..';
}

function isJsFile(filePath: string): boolean {
  return JS_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

function isExportMap(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.some((key) => key.startsWith('.')) || !keys.some((key) => EXPORT_CONDITION_KEYS.has(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWithinDir(filePath: string, dirPath: string): boolean {
  const relPath = path.relative(dirPath, filePath);
  return relPath === '' || (!relPath.startsWith('..') && !path.isAbsolute(relPath));
}

function uniqueTargets(targets: WorkerTarget[]): WorkerTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.packageName}:${target.exportKey}:${target.filePath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  const packageCompare = left.packageName.localeCompare(right.packageName);
  if (packageCompare !== 0) return packageCompare;
  const pathCompare = left.filePath.localeCompare(right.filePath);
  if (pathCompare !== 0) return pathCompare;
  return left.message.localeCompare(right.message);
}

export async function main(): Promise<void> {
  const options = await parseCliOptions();
  const result = await checkLlrtWorker(options);

  if (result.diagnostics.length > 0) {
    logError('LLRT worker compatibility check failed.');
    console.error(`${LABEL} Checked: ${result.checkedApiUrl}`);
    for (const diagnostic of result.diagnostics.sort(compareDiagnostics)) {
      console.error(`${LABEL} - ${diagnostic.packageName} ${formatPath(diagnostic.filePath)}: ${diagnostic.message}`);
    }
    process.exit(1);
  }

  logInfo(`${styleText('green', 'passed')} LLRT worker compatibility check`);
  logInfo(`Checked: ${result.checkedApiUrl}`);
  logInfo(`Checked ${result.targets.length} worker export(s) in ${result.packages.length} package(s)`);
  logInfo(`${result.packages.map((p) => p.name).join(', ')}`);
  if (options.verbose) logInfo(`Visited ${result.visitedFiles.length} file(s)`);

  for (const [moduleName, usedPaths] of [...result.usageByModule.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    logInfo(`${moduleName}: ${[...usedPaths].sort().join(', ')}`);
  }
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    logError('Unhandled error in check-llrt-worker script');
    console.error(error);
    process.exit(1);
  });
}
