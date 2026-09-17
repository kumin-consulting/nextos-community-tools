// test/_ts-hook.mjs
//
// A module-resolution hook so a test can import the app's real source.
// The app's own imports are extensionless ('./board') because that is
// what the NextOS module linker and `tsc` both want; Node's ESM resolver
// insists on a full specifier. This hook adds the '.ts' Node is missing
// and changes nothing else, so the tests exercise exactly the files the
// build compiles.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/i.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw err;
  }
}
