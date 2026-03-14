/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default { '*': ['pnpm fmt --no-error-on-unmatched-pattern', 'pnpm lint', () => 'pnpm tsc:check'] };
