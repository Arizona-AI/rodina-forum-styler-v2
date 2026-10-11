/** esbuild text-loader imports for CSS bundles. */
declare module "*.css" {
  const content: string;
  export default content;
}
