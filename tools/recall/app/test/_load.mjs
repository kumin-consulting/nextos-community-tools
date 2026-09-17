// test/_load.mjs - every test file's first import: registers the resolve
// hook (see _hooks.mjs) and hands back the app's pure modules.
import { register } from 'node:module';

register('./_hooks.mjs', import.meta.url);

export const load = (name) => import(`../src/lib/${name}.ts`);
