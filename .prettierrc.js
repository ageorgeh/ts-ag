
// import sveltePlugin from 'prettier-plugin-svelte';
// import tailwindPlugin from 'prettier-plugin-tailwindcss';

 

/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
  useTabs: false, 
  singleQuote: true,
  trailingComma: 'none',
  printWidth: 120,
  semi: true,
  proseWrap: 'always',
  svelteSortOrder: 'scripts-options-markup-styles',
  // Took that out cause im using the multiline eslint plugin which sorts better IMO
  //'prettier-plugin-tailwindcss'
  plugins: ['prettier-plugin-svelte'],
  overrides: [
    {
      files: '*.svelte',
      options: {
        parser: 'svelte',   
      },
    },
  ],
}
 
export default config;    