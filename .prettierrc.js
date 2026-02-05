/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
  useTabs: false,
  singleQuote: true,
  trailingComma: 'none',
  printWidth: 120,
  objectWrap: 'collapse',
  semi: true,
  proseWrap: 'always',
  plugins: ['prettier-plugin-packagejson']
};

export default config;
