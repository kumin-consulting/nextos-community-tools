// test/_hooks.mjs - a resolve hook for `node --experimental-transform-types`.
//
// Node runs TypeScript by stripping types, but it does NOT resolve
// extensionless specifiers inside a .ts file: `import './time'` fails
// where `import './time.ts'` works. The app's source has to stay
// extensionless (that is what `tsc -p tsconfig.app.json` and the OS's
// own module linker both expect), so the tests add the extension back
// here instead of the source carrying one for their sake.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await nextResolve(specifier + suffix, context);
      } catch {
        // try the next one
      }
    }
  }
  return nextResolve(specifier, context);
}
