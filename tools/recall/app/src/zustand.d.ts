// src/zustand.d.ts
//
// `zustand` is one of the five bare specifiers a native app may import
// (the OS hands over its own copy at run time - see the module linker in
// scripts/lib/moduleGraph.ts), but it is not an npm dependency of this
// repository, so `tsc -p tsconfig.app.json` has nothing to resolve it
// against. This is the subset Recall uses, typed the way zustand v4/v5
// really behaves. Nothing imports this file; it is ambient.

declare module 'zustand' {
  export type StoreSet<T> = (partial: Partial<T> | ((state: T) => Partial<T>), replace?: false) => void;
  export type StateCreator<T> = (set: StoreSet<T>, get: () => T) => T;

  export interface StoreApi<T> {
    getState(): T;
    setState(partial: Partial<T> | ((state: T) => Partial<T>), replace?: false): void;
    subscribe(listener: (state: T, previous: T) => void): () => void;
  }

  export interface UseBoundStore<T> extends StoreApi<T> {
    (): T;
    <U>(selector: (state: T) => U): U;
  }

  export function create<T>(initializer: StateCreator<T>): UseBoundStore<T>;
}
