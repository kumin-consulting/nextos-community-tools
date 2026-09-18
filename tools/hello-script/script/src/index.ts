// tools/hello-script/script/files/src/index.ts
//
// The smallest possible NextOS Script: one command trigger, one
// permission, one file. `ScriptContext` and `ScriptTrigger` are type-only
// imports (they compile away entirely - see the community repository's
// README, "Shipping a script"), so this file has no runtime dependency
// on '@kumin/script' at all; the shapes come from lib/os/scripts in
// kumin-consulting/jonkum.in (E2, the Extend series).
//
// The default export is the script's entry point. NextOS's worker
// sandbox imports the compiled build/index.js and calls it with the
// context (fs/events/intents/notify/storage/net/tools/agents, all
// permission-gated) and a description of what fired it.
import type { ScriptContext, ScriptTrigger } from '@kumin/script';

export default async function main(ctx: ScriptContext, trigger: ScriptTrigger): Promise<void> {
  const stamp = new Date().toISOString();
  const body = `# Hello from a script\n\nWritten ${stamp}, triggered by "${trigger.kind}".\n`;
  await ctx.fs.writeText('~/Notes/hello.md', body);
  await ctx.notify({ title: 'Hello script', body: 'Wrote ~/Notes/hello.md' });
}
