#!/usr/bin/env node

import console from 'node:console';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, styleText } from 'node:util';

import ts from 'typescript';

import { isDirectExecution } from './utils.js';

const DEFAULT_LLRT_API_URL = 'https://raw.githubusercontent.com/awslabs/llrt/main/API.md';
const DEFAULT_CONFIG = 'tsconfig.json';
const DEFAULT_ENTRY = 'src/worker.ts';
const colorText = (format: Parameters<typeof styleText>[0], text: unknown): string =>
  styleText(format, String(text), { validateStream: false });
const LABEL = colorText('cyan', '[check-llrt-worker]');

const nodeBuiltinModules = new Set(
  builtinModules
    .filter((moduleName) => !moduleName.startsWith('_'))
    .map((moduleName) => moduleName.replace(/^node:/, ''))
);

type Binding = { moduleName: string; importedPath: string; kind: 'default' | 'named' | 'namespace' };
type Diagnostic = { filePath: string; message: string };
type ProjectConfig = { path: string; rootDir: string; options: ts.CompilerOptions; fileNames: Set<string> };
type CheckOptions = { apiUrl: string; configPaths: string[]; entryPaths: string[]; verbose: boolean };
type CheckResult = {
  checkedApiUrl: string;
  diagnostics: Diagnostic[];
  usageByModule: Map<string, Set<string>>;
  visitedFiles: string[];
};

const formatPath = (filePath: string): string => colorText('dim', path.relative(process.cwd(), filePath));
const logInfo = (message: string): void => console.log(`${LABEL} ${message}`);
const logWarn = (message: string): void => console.warn(`${LABEL} ${colorText('yellow', message)}`);
const logError = (message: string): void => console.error(`${LABEL} ${colorText('red', message)}`);

export function resolveTsConfigPath(refPath: string): string {
  if (refPath.endsWith('.json')) return path.resolve(refPath);
  return path.resolve(refPath, 'tsconfig.json');
}

export async function checkLlrtWorker(options: CheckOptions): Promise<CheckResult> {
  const apiResponse = await fetch(options.apiUrl);
  if (!apiResponse.ok) throw new Error(`Failed to fetch LLRT API docs from ${options.apiUrl}: ${apiResponse.status}`);

  const llrtSupport = parseLlrtApi(await apiResponse.text());
  const projectConfigs = loadProjectConfigs(options.configPaths, options.verbose);
  const fallbackConfig = projectConfigs[0];
  if (!fallbackConfig) throw new Error('No readable tsconfig files were found');

  const diagnostics: Diagnostic[] = [];
  const usageByModule = new Map<string, Set<string>>();
  const visitedFiles = new Set<string>();

  const visitFile = async (filePath: string): Promise<void> => {
    const normalizedPath = path.resolve(filePath);
    if (visitedFiles.has(normalizedPath)) return;
    visitedFiles.add(normalizedPath);

    const sourceText = await readFile(normalizedPath, 'utf8');
    const sourceFile = ts.createSourceFile(normalizedPath, sourceText, ts.ScriptTarget.Latest, true);
    const config = findOwningConfig(normalizedPath, projectConfigs) ?? fallbackConfig;
    const bindings = new Map<string, Binding>();

    for (const statement of sourceFile.statements) {
      if (!isModuleStatementWithStringSpecifier(statement)) continue;

      const specifier = statement.moduleSpecifier.text;
      if (isBuiltinModule(specifier)) {
        collectBuiltinBindings(statement, specifier, bindings, diagnostics, normalizedPath, llrtSupport);
        continue;
      }

      const resolved = resolveModuleSpecifier(specifier, normalizedPath, config.options);
      if (resolved) await visitFile(resolved);
    }

    walkValueReferences(sourceFile, bindings, diagnostics, usageByModule, llrtSupport);
  };

  for (const entryPath of options.entryPaths) await visitFile(entryPath);

  return { checkedApiUrl: options.apiUrl, diagnostics, usageByModule, visitedFiles: [...visitedFiles].sort() };
}

function loadProjectConfigs(configPaths: string[], verbose: boolean): ProjectConfig[] {
  const loadedConfigs = new Map<string, ProjectConfig>();
  const visited = new Set<string>();
  const queue = configPaths.map(resolveTsConfigPath);

  // Follow project references so monorepo imports are resolved with the same graph TypeScript sees.
  while (queue.length) {
    const configPath = queue.shift()!;
    if (visited.has(configPath)) continue;
    visited.add(configPath);

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      logWarn(`Skipping unreadable config: ${formatPath(configPath)}`);
      if (verbose) console.warn(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
      continue;
    }

    const rootDir = path.dirname(configPath);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir, undefined, configPath);
    if (parsed.errors.length > 0 && verbose) {
      for (const diagnostic of parsed.errors)
        console.warn(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }

    loadedConfigs.set(configPath, {
      path: configPath,
      rootDir,
      options: parsed.options,
      fileNames: new Set(parsed.fileNames.map((fileName) => path.resolve(fileName)))
    });

    for (const ref of parsed.projectReferences ?? []) queue.push(resolveTsConfigPath(ref.path));
  }

  return [...loadedConfigs.values()].sort((a, b) => b.rootDir.length - a.rootDir.length);
}

function collectBuiltinBindings(
  statement: ts.ImportDeclaration | ts.ExportDeclaration,
  specifier: string,
  bindings: Map<string, Binding>,
  diagnostics: Diagnostic[],
  filePath: string,
  support: Map<string, Set<string>>
): void {
  const moduleName = specifier.replace(/^node:/, '');
  const supportedMembers = support.get(moduleName);

  if (!supportedMembers) {
    diagnostics.push({ filePath, message: `imports unsupported builtin module \`${moduleName}\`` });
    return;
  }

  if (ts.isExportDeclaration(statement)) {
    if (ts.isTypeOnlyExportDeclaration(statement)) return;
    if (!statement.exportClause) {
      diagnostics.push({
        filePath,
        message: `re-exports entire builtin module \`${moduleName}\`, which cannot be validated against LLRT's partial API surface`
      });
      return;
    }

    if (ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        if (ts.isTypeOnlyExportDeclaration(element)) continue;
        validatePath(
          filePath,
          moduleName,
          (element.propertyName ?? element.name).text,
          supportedMembers,
          diagnostics,
          'imports'
        );
      }
    }

    return;
  }

  const importClause = statement.importClause;
  if (!importClause || ts.isTypeOnlyImportDeclaration(importClause)) return;

  if (importClause.name) bindings.set(importClause.name.text, { moduleName, importedPath: '', kind: 'default' });

  const namedBindings = importClause.namedBindings;
  if (!namedBindings) return;

  if (ts.isNamespaceImport(namedBindings)) {
    bindings.set(namedBindings.name.text, { moduleName, importedPath: '', kind: 'namespace' });
    return;
  }

  for (const element of namedBindings.elements) {
    if (ts.isTypeOnlyImportDeclaration(element)) continue;

    const importedName = (element.propertyName ?? element.name).text;
    validatePath(filePath, moduleName, importedName, supportedMembers, diagnostics, 'imports');
    bindings.set(element.name.text, { moduleName, importedPath: importedName, kind: 'named' });
  }
}

function walkValueReferences(
  sourceFile: ts.SourceFile,
  bindings: Map<string, Binding>,
  diagnostics: Diagnostic[],
  usageByModule: Map<string, Set<string>>,
  support: Map<string, Set<string>>
): void {
  const visitedIdentifiers = new Set<number>();

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const binding = bindings.get(node.text);
      if (binding && isValueReference(node) && !visitedIdentifiers.has(node.pos)) {
        visitedIdentifiers.add(node.pos);

        const usedPath = getUsedPath(node, binding);
        if (!usedPath) {
          diagnostics.push({
            filePath: sourceFile.fileName,
            message: `uses \`${node.text}\` from \`${binding.moduleName}\` in a way this check cannot validate statically`
          });
        } else {
          const usedPaths = usageByModule.get(binding.moduleName) ?? new Set<string>();
          usedPaths.add(usedPath);
          usageByModule.set(binding.moduleName, usedPaths);
          validatePath(
            sourceFile.fileName,
            binding.moduleName,
            usedPath,
            support.get(binding.moduleName) ?? new Set(),
            diagnostics,
            'uses'
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

function getUsedPath(identifier: ts.Identifier, binding: Binding): string | undefined {
  let current: ts.Node = identifier;
  const segments: string[] = [];

  while (ts.isPropertyAccessExpression(current.parent) && current.parent.expression === current) {
    segments.push(current.parent.name.text);
    current = current.parent;
  }

  const usedPath = (binding.importedPath ? [binding.importedPath, ...segments] : segments).join('.');
  return usedPath || undefined;
}

function validatePath(
  filePath: string,
  moduleName: string,
  usedPath: string,
  supportedMembers: Set<string>,
  diagnostics: Diagnostic[],
  verb: 'imports' | 'uses'
): void {
  let prefix = usedPath;
  while (prefix) {
    if (supportedMembers.has(prefix)) return;
    const dotIndex = prefix.lastIndexOf('.');
    if (dotIndex === -1) break;
    prefix = prefix.slice(0, dotIndex);
  }

  diagnostics.push({
    filePath,
    message: `${verb} \`${usedPath}\` from \`${moduleName}\`, but LLRT API.md does not list it`
  });
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

function resolveModuleSpecifier(
  specifier: string,
  containingFile: string,
  compilerOptions: ts.CompilerOptions
): string | undefined {
  const resolved = ts.resolveModuleName(specifier, containingFile, compilerOptions, ts.sys).resolvedModule;
  if (!resolved || resolved.isExternalLibraryImport) return undefined;
  return path.resolve(resolved.resolvedFileName);
}

function isModuleStatementWithStringSpecifier(
  statement: ts.Statement
): statement is (ts.ImportDeclaration | ts.ExportDeclaration) & { moduleSpecifier: ts.StringLiteral } {
  return (
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
  );
}

function findOwningConfig(filePath: string, configs: ProjectConfig[]): ProjectConfig | undefined {
  return configs.find((config) => config.fileNames.has(filePath) || isWithinDir(filePath, config.rootDir));
}

function isWithinDir(filePath: string, dirPath: string): boolean {
  const relPath = path.relative(dirPath, filePath);
  return relPath === '' || (!relPath.startsWith('..') && !path.isAbsolute(relPath));
}

function isBuiltinModule(specifier: string): boolean {
  return nodeBuiltinModules.has(specifier.replace(/^node:/, ''));
}

function isValueReference(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;

  if (!parent) return false;
  if (ts.isImportClause(parent)) return false;
  if (ts.isImportSpecifier(parent)) return false;
  if (ts.isNamespaceImport(parent)) return false;
  if (ts.isImportEqualsDeclaration(parent)) return false;
  if (ts.isExportSpecifier(parent)) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false;
  if (ts.isQualifiedName(parent) && parent.right === identifier) return false;
  if (ts.isTypeReferenceNode(parent)) return false;
  if (ts.isExpressionWithTypeArguments(parent)) return false;
  if (ts.isTypeQueryNode(parent)) return false;
  if (ts.isTypeAliasDeclaration(parent)) return false;
  if (ts.isInterfaceDeclaration(parent)) return false;

  return true;
}

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseCliOptions(): CheckOptions {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'api-url': { type: 'string' },
      config: { type: 'string', short: 'c', multiple: true },
      entry: { type: 'string', short: 'e', multiple: true },
      verbose: { type: 'boolean', short: 'v' }
    }
  });

  return {
    apiUrl: values['api-url'] ?? process.env.LLRT_API_URL ?? DEFAULT_LLRT_API_URL,
    configPaths: toArray(values.config).map(resolveTsConfigPath),
    entryPaths: toArray(values.entry).map((entry) => path.resolve(entry)),
    verbose: values.verbose === true
  };
}

function withLocalDefaults(options: CheckOptions): CheckOptions {
  return {
    ...options,
    configPaths: options.configPaths.length > 0 ? options.configPaths : [resolveTsConfigPath(DEFAULT_CONFIG)],
    entryPaths: options.entryPaths.length > 0 ? options.entryPaths : [path.resolve(DEFAULT_ENTRY)]
  };
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  const pathCompare = left.filePath.localeCompare(right.filePath);
  if (pathCompare !== 0) return pathCompare;
  return left.message.localeCompare(right.message);
}

export async function main(): Promise<void> {
  const options = withLocalDefaults(parseCliOptions());

  for (const configPath of options.configPaths) {
    if (!existsSync(configPath)) {
      logError(`Config file not found: ${formatPath(configPath)}`);
      process.exit(1);
    }
  }

  for (const entryPath of options.entryPaths) {
    if (!existsSync(entryPath)) {
      logError(`Entry file not found: ${formatPath(entryPath)}`);
      process.exit(1);
    }
  }

  const result = await checkLlrtWorker(options);

  if (result.diagnostics.length > 0) {
    logError('LLRT worker compatibility check failed.');
    console.error(`${LABEL} Checked: ${result.checkedApiUrl}`);
    for (const diagnostic of result.diagnostics.sort(compareDiagnostics)) {
      console.error(`${LABEL} - ${formatPath(diagnostic.filePath)}: ${diagnostic.message}`);
    }
    process.exit(1);
  }

  logInfo(`${colorText('green', 'passed')} LLRT worker compatibility check`);
  logInfo(`Checked: ${result.checkedApiUrl}`);
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
