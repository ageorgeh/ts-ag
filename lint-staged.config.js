/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
  '*': ['pnpm fmt --no-error-on-unmatched-pattern', 'pnpm lint --no-error-on-unmatched-pattern', () => 'pnpm tsc:check']
};
