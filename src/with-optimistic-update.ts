import {
  getState,
  patchState,
  signalStoreFeature,
  withMethods,
} from '@ngrx/signals';
import { type Observable, firstValueFrom } from 'rxjs';

export interface OptimisticOptions<TResponse> {
  /** Called when the server request succeeds. */
  onSuccess?: (response: TResponse) => void;
  /**
   * Called when the server request fails. The state has already been
   * rolled back to the pre-mutation snapshot by the time this fires.
   */
  onError?: (error: unknown) => void;
}

/**
 * Adds an `optimistic()` method that applies a local state mutation
 * immediately, then rolls back if the confirming server request fails.
 *
 * **Pattern**: snapshot → mutate → await server → rollback on error
 *
 * @example
 * ```ts
 * const TodoStore = signalStore(
 *   { providedIn: 'root' },
 *   withState({ todos: [] as Todo[] }),
 *   withOptimisticUpdate(),
 *   withMethods((store) => ({
 *     toggleDone(id: string) {
 *       store.optimistic(
 *         // 1. Immediate local mutation
 *         () => patchState(store, {
 *           todos: store.todos().map(t =>
 *             t.id === id ? { ...t, done: !t.done } : t
 *           ),
 *         }),
 *         // 2. Server request to confirm
 *         todoService.toggle(id),
 *         {
 *           onError: (err) => console.error('Toggle failed, rolled back', err),
 *         },
 *       );
 *     },
 *   })),
 * );
 * ```
 */
export function withOptimisticUpdate() {
  return signalStoreFeature(
    withMethods((store: any) => ({
      /**
       * Apply a mutation optimistically.
       *
       * @param mutation  Function that mutates state immediately (call `patchState` inside).
       * @param request   Observable that confirms the mutation on the server.
       * @param options   Optional success/error callbacks.
       */
      async optimistic<TResponse>(
        mutation: () => void,
        request: Observable<TResponse>,
        options?: OptimisticOptions<TResponse>,
      ): Promise<void> {
        const snapshot = { ...getState(store) };
        mutation();

        try {
          const response = await firstValueFrom(request);
          options?.onSuccess?.(response);
        } catch (error) {
          patchState(store, snapshot);
          options?.onError?.(error);
        }
      },
    })),
  );
}
