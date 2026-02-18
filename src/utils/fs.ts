import { lstat, mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

import chalk from 'chalk';
import type { PackageJson } from 'type-fest';

/**
 * @returns true if a filepath exists
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes data to a filepath if it is different
 * @returns true if the file is written to
 */
export async function writeIfDifferent(filePath: string, newData: string): Promise<boolean> {
  // Ensure the directory exists
  const directory = dirname(filePath);
  if (!(await exists(directory))) {
    await mkdir(directory, { recursive: true });
  }

  // Check if the file exists
  if (await exists(filePath)) {
    // Read the existing file content
    const existingData = await readFile(filePath, 'utf8');

    // Compare the existing data with the new data
    if (existingData === newData) {
      // console.log('File contents are identical. No write needed.');
      return false;
    }
  }

  // Write the new data if it's different or the file doesn't exist
  await writeFile(filePath, newData, 'utf8');
  console.log(chalk.green('Writing to'), filePath);
  return true;
}

/**
 * @returns the json object packageJson or undefined if it doesnt exist
 */
export async function readPackageJson(filePath: string): Promise<PackageJson | undefined> {
  if (!(await exists(filePath))) return undefined;
  return JSON.parse(await readFile(filePath, { encoding: 'utf-8' })) as PackageJson;
}
