// Types for the bare 'zustand' specifier a native NextOS app may import.
// The OS resolves it at run time to its OWN copy of zustand (see
// lib/apps/native/moduleGraph.ts's bare map), so there is no package to
// take types from - this declares the small surface Sketch actually uses.
// Declarations only: nothing here is emitted or bundled.

declare module 'zustand' {
  export interface StoreApi<T> {
    getState(): T;
    getInitialState(): T;
    setState(partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: boolean): void;
    subscribe(listener: (state: T, previous: T) => void): () => void;
  }

  export type StateCreator<T> = (
    set: StoreApi<T>['setState'],
    get: StoreApi<T>['getState'],
    api: StoreApi<T>
  ) => T;

  export interface UseBoundStore<T> extends StoreApi<T> {
    (): T;
    <U>(selector: (state: T) => U): U;
  }

  export function create<T>(initializer: StateCreator<T>): UseBoundStore<T>;
  export function createStore<T>(initializer: StateCreator<T>): StoreApi<T>;
  export function useStore<T, U>(api: StoreApi<T>, selector: (state: T) => U): U;
}
