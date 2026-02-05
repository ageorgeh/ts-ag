// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';
import ts from 'typescript-eslint';
import imports from 'eslint-plugin-import';

const isWindows = process.platform === 'win32';

// npx eslint "C:\code\cmsWrapper\cms\private\client\src\routes\+layout.svelte"
// npx eslint "/mnt/c/code/cmsWrapper/cms/private/client/src/routes/+layout.svelte"
// npx eslint "C:\code\cmsWrapper\cms\private\scripts\eslint\api-no-direct-return.ts"

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { tsconfigRootDir: import.meta.dirname }
    },
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/backup/**', '**/cdk.out/**']
  },

  {
    files: ['**/*.ts'],
    // See more details at: https://typescript-eslint.io/packages/parser/
    plugins: { import: imports },
    rules: {
      'import/extensions': ['error', 'ignorePackages', { ts: 'never', tsx: 'never', js: 'always', jsx: 'never' }]
    }
  },
  {
    rules: {
      // Override or add rule settings here, such as:
      // 'svelte/rule-name': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
);
