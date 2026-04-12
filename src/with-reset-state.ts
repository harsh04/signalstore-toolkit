import {
  getState,
  patchState,
  signalStoreFeature,
  withHooks,
  withMethods,
  withProps,
} from '@ngrx/signals';

/**
 * Captures initial state on store init and adds a `resetState()` method
 * that restores it. Useful for logout flows, route changes, or form resets.
 *
 * Must be composed **after** all `withState()` calls so the full initial
 * state is visible.
 *
 * @example
 * ```ts
 * const FormStore = signalStore(
 *   { providedIn: 'root' },
 *   withState({ name: '', email: '', dirty: false }),
 *   withResetState(),
 * );
 *
 * // After user edits:
 * store.resetState(); // back to { name: '', email: '', dirty: false }
 * ```
 */
export function withResetState() {
  return signalStoreFeature(
    withProps(() => ({
      _snapshot: {} as Record<string, unknown>,
    })),
    withHooks({
      onInit(store: any) {
        store._snapshot = { ...getState(store) };
      },
    }),
    withMethods((store: any) => ({
      resetState() {
        patchState(store, { ...store._snapshot });
      },
    })),
  );
}
