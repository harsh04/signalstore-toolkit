import { computed } from '@angular/core';
import {
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
  patchState,
} from '@ngrx/signals';

/**
 * Represents the lifecycle of an async operation.
 *
 * - `'idle'`      — no request in flight
 * - `'pending'`   — request started, awaiting response
 * - `'fulfilled'` — request succeeded
 * - `{ error: string }` — request failed with a message
 */
export type RequestStatus = 'idle' | 'pending' | 'fulfilled' | { error: string };

// ---------------------------------------------------------------------------
// Pure helpers (useful outside stores — e.g. in components or tests)
// ---------------------------------------------------------------------------

export function isPending(status: RequestStatus): boolean {
  return status === 'pending';
}

export function isFulfilled(status: RequestStatus): boolean {
  return status === 'fulfilled';
}

export function getError(status: RequestStatus): string | null {
  return typeof status === 'object' ? status.error : null;
}

// ---------------------------------------------------------------------------
// Signal Store Feature
// ---------------------------------------------------------------------------

/**
 * Adds async-request lifecycle tracking to a signal store.
 *
 * **State**:  `requestStatus: RequestStatus`
 *
 * **Computed**: `isPending`, `isFulfilled`, `error`
 *
 * **Methods**: `setPending()`, `setFulfilled()`, `setError(msg)`, `resetStatus()`
 *
 * @example
 * ```ts
 * const TodoStore = signalStore(
 *   { providedIn: 'root' },
 *   withRequestStatus(),
 *   withMethods((store) => ({
 *     load: rxMethod<void>(
 *       pipe(
 *         tap(() => store.setPending()),
 *         switchMap(() =>
 *           http.get('/todos').pipe(
 *             tapResponse({
 *               next: (todos) => {
 *                 patchState(store, { todos });
 *                 store.setFulfilled();
 *               },
 *               error: (e) => store.setError(e.message),
 *             }),
 *           ),
 *         ),
 *       ),
 *     ),
 *   })),
 * );
 * ```
 */
export function withRequestStatus() {
  return signalStoreFeature(
    withState({ requestStatus: 'idle' as RequestStatus }),
    withComputed(({ requestStatus }) => ({
      isPending: computed(() => requestStatus() === 'pending'),
      isFulfilled: computed(() => requestStatus() === 'fulfilled'),
      error: computed(() => {
        const s = requestStatus();
        return typeof s === 'object' ? s.error : null;
      }),
    })),
    withMethods((store) => ({
      setPending() {
        patchState(store, { requestStatus: 'pending' as RequestStatus });
      },
      setFulfilled() {
        patchState(store, { requestStatus: 'fulfilled' as RequestStatus });
      },
      setError(error: string) {
        patchState(store, {
          requestStatus: { error } as unknown as RequestStatus,
        });
      },
      resetStatus() {
        patchState(store, { requestStatus: 'idle' as RequestStatus });
      },
    })),
  );
}
