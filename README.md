### Typescript

Although shadcn exists here in the repo it is not shipped. This is simply for tooling and nothing else, as such in the
`svelte.config.js` the aliases are added just for typescript, so that they are not resolved by the packaging process.

This allows consumers to bring their own shadcn components just so long as they resolve `$shadcn`
