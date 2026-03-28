import { configDefaults, defineProject } from 'vitest/config';

process.env.NODE_ENV = 'development';

export default defineProject({
  root: import.meta.dirname,
  mode: 'development',
  resolve: { tsconfigPaths: true },
  test: {
    dir: import.meta.dirname,
    exclude: [...configDefaults.exclude],
    // globalSetup,
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['**/*.unit.test.ts'], setupFiles: [] } }
    ]
  }
});
