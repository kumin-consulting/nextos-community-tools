// A resolve hook so a test can import the app's TypeScript sources
// directly. The sources import each other the way a bundler expects
// ("./types", no extension) because tsconfig.app.json type-checks them
// with moduleResolution "Bundler" and forbids .ts extensions in import
// paths; Node's ESM resolver wants a real file name. This hook bridges
// the two by trying .ts and .tsx before giving up - it is test-only
// machinery and never ships inside the app.
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$|\.json$|\.css$/i.test(specifier)) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(specifier + ext, context);
      } catch {
        /* try the next suffix */
      }
    }
  }
  return next(specifier, context);
}
