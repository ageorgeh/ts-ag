import tsconfigPaths from 'vite-tsconfig-paths';
import { configDefaults, defineProject } from 'vitest/config';
// import { config } from 'dotenv';

// npx vitest --run ./src/__tests__/modify/fail.test.ts
// DEBUG=vite-tsconfig-paths npx vitest --run &> test.log
// DEBUG=vite-tsconfig-paths npx vitest --run ./tests/modify/fail.test.ts

process.env.NODE_ENV = 'development';

// const envPath = join(clientPath, 'env/.env.development');

// config({ path: envPath });

export default defineProject({
  root: import.meta.dirname,
  mode: 'development',
  plugins: [tsconfigPaths({ projectDiscovery: 'lazy' })],
  test: {
    dir: import.meta.dirname,
    exclude: [...configDefaults.exclude],
    // globalSetup,
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['**/*.unit.test.ts'], setupFiles: [] } }
    ]
  }
});
