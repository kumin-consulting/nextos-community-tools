// Installs ./_hooks.mjs for the rest of this process. A test file imports
// this FIRST (a static import, so it runs before anything else), then
// reaches the sources through `await import('../src/lib/x.ts')`.
import { register } from 'node:module';
register('./_hooks.mjs', import.meta.url);
