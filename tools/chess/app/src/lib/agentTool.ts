// src/lib/agentTool.ts
//
// The shape NextOS expects from an app's `tools` export, copied here
// because an app cannot import from the OS's own source tree: the only
// module specifiers a native app may use are its own files and the five
// the loader provides. Kept identical to types/agentTools.ts's
// AppAgentTool; if that ever grows a field, this grows the same one.

export interface AppAgentTool {
  /** Globally unique, and prefixed with the app's id - 'chess_'. */
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Set on anything irreversible; the agent runtime asks first. */
  destructive?: boolean;
  /** Set on anything that only reads. */
  readOnly?: boolean;
  concurrencySafe?: boolean;
  execute: (input: unknown) => Promise<unknown> | unknown;
}
