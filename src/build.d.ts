/**
 * The build replaces a `gzip:<package path>` import with the file's contents,
 * gzip-compressed and base64-encoded. See esbuild.config.mjs.
 */
declare module "gzip:*" {
  const base64: string;
  export default base64;
}

/** The Mermaid version in node_modules, injected by esbuild at build time. */
declare const __BUNDLED_MERMAID_VERSION__: string;
