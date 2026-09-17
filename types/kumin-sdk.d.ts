// Ambient types for '@kumin/sdk' - a native NextOS app's typed facade.
// Generated as a reference copy; the source of truth is
// lib/apps/native/sdk.ts's KuminNativeSdk interface.
declare module '@kumin/sdk' {
  export interface KuminNativeSdk {
    app: { readonly id: string; readonly dir: string };
    useWindows(): { windows: unknown[]; activeWindowId: string | null };
    openApp(appId: string, title?: string): void;
    dispatchIntent(intent: { appId: string; action: string; params?: Record<string, string> }): Promise<unknown>;
    getVfs(): unknown;
    fs: {
      edit(path: string, oldText: string, newText: string, opts?: { replaceAll?: boolean }): Promise<{ content: string; replacements: number }>;
      patch(path: string, patchText: string, opts?: { dryRun?: boolean }): Promise<{ content: string; ok: boolean; hunkResults: unknown[] }>;
    };
    events: {
      subscribe(pattern: string, cb: (event: unknown) => void): () => void;
      emit(type: string, payload?: Record<string, unknown>): void;
    };
    notify(input: { title: string; body?: string; urgent?: boolean }): Promise<void>;
    theme: {
      useIsDark(): boolean;
      tokens(): { isDark: boolean; accentColor: string };
    };
    storage: {
      get<T = unknown>(key: string): T | undefined;
      set(key: string, value: unknown): void;
      remove(key: string): void;
    };
    agents: {
      run(agentId: string, task: string): Promise<{ runId: string }>;
      waitForRun(runId: string): Promise<{ status: string; answer: string | null }>;
    };
    assistant: {
      ask(text: string): Promise<{ answer: string }>;
    };
    registerTool(tool: {
      name: string;
      description: string;
      inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
      readOnly?: boolean;
      destructive?: boolean;
      execute: (input: unknown) => Promise<unknown> | unknown;
    }): () => void;
    db: {
      tables(): Array<{ id: string; name: string; appId: string | null; system?: boolean; columns: unknown[]; views: unknown[] }>;
      createTable(input: { name: string; columns?: Array<{ name: string; type: string; options?: Array<{ label: string; color?: string }> }> }): { id: string; name: string };
      rows(tableId: string, query?: { view?: string; filters?: unknown[]; sort?: { columnId: string; direction: 'asc' | 'desc' } | null; search?: string; limit?: number; offset?: number }): Array<{ id: string; tableId: string; cells: Record<string, unknown>; order: number; createdAt: string; updatedAt: string }>;
      insert(tableId: string, cells: Record<string, unknown>): Promise<{ id: string; tableId: string; cells: Record<string, unknown>; order: number; createdAt: string; updatedAt: string }>;
      update(tableId: string, rowId: string, cells: Record<string, unknown>): Promise<{ id: string; tableId: string; cells: Record<string, unknown>; order: number; createdAt: string; updatedAt: string }>;
      remove(tableId: string, rowId: string): Promise<void>;
      subscribe(tableId: string, cb: (event: { type: string; tableId: string; rowId?: string; at: string }) => void): () => void;
    };
  }
  const sdk: KuminNativeSdk;
  export default sdk;
}
