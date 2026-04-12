import { computed } from '@angular/core';
import {
  patchState,
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

// ---------------------------------------------------------------------------
// Type utilities — exported for consumers who want to type their own state
// ---------------------------------------------------------------------------

/** Maps operation names to `{op}Loading` boolean keys. */
export type OperationLoadingState<Ops extends string> = {
  [K in Ops as `${K}Loading`]: boolean;
};

/** Maps operation names to `{op}Error` nullable string keys. */
export type OperationErrorState<Ops extends string> = {
  [K in Ops as `${K}Error`]: string | null;
};

/** Combined loading + error state for N operations. */
export type OperationState<Ops extends string> = OperationLoadingState<Ops> &
  OperationErrorState<Ops>;

/** Shape of each `{op}State` computed signal. */
export interface OperationStatus {
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

/**
 * Generates per-operation loading/error state, computed status objects,
 * and helper methods for N named operations.
 *
 * This is the feature for action stores that manage multiple async operations
 * (e.g. load, save, delete) each with independent loading/error tracking.
 *
 * @example
 * ```ts
 * const TaskActionStore = signalStore(
 *   { providedIn: 'root' },
 *   withPerOperationStatus({ operations: ['load', 'save', 'delete'] }),
 *   withMethods((store) => ({
 *     loadTasks: rxMethod<void>(
 *       pipe(
 *         tap(() => store.startOp('load')),
 *         switchMap(() =>
 *           taskService.list().pipe(
 *             tapResponse({
 *               next: (res) => { store.endOp('load'); },
 *               error: (e) => store.failOp('load', e.message),
 *             }),
 *           ),
 *         ),
 *       ),
 *     ),
 *     saveTasks: rxMethod<Task>(
 *       pipe(
 *         tap(() => store.startOp('save')),
 *         switchMap((task) =>
 *           taskService.save(task).pipe(
 *             tapResponse({
 *               next: () => store.endOp('save'),
 *               error: (e) => store.failOp('save', e.message),
 *             }),
 *           ),
 *         ),
 *       ),
 *     ),
 *   })),
 * );
 *
 * // In a template:
 * store.loadLoading()       // boolean
 * store.loadError()         // string | null
 * store.loadState()         // { loading: boolean, error: string | null }
 * store.saveState().loading // boolean
 * ```
 */
export function withPerOperationStatus<Op extends string>(config: {
  operations: readonly Op[];
}) {
  const { operations } = config;

  // Build initial state: { loadLoading: false, loadError: null, ... }
  const initialState = operations.reduce(
    (acc, op) => ({
      ...acc,
      [`${op}Loading`]: false,
      [`${op}Error`]: null as string | null,
    }),
    {} as Record<string, boolean | string | null>,
  );

  return signalStoreFeature(
    withState(initialState),

    // Build computed: { loadState: { loading, error }, ... }
    withComputed((store: any) =>
      operations.reduce(
        (acc, op) => ({
          ...acc,
          [`${op}State`]: computed(
            (): OperationStatus => ({
              loading: store[`${op}Loading`](),
              error: store[`${op}Error`](),
            }),
          ),
        }),
        {} as Record<string, any>,
      ),
    ),

    withMethods((store: any) => ({
      /** Set an operation to loading (clears any previous error). */
      startOp(op: Op) {
        patchState(store, {
          [`${op}Loading`]: true,
          [`${op}Error`]: null,
        } as any);
      },

      /** Mark an operation as finished (clears loading). */
      endOp(op: Op) {
        patchState(store, {
          [`${op}Loading`]: false,
        } as any);
      },

      /** Mark an operation as failed (clears loading, sets error). */
      failOp(op: Op, error: string) {
        patchState(store, {
          [`${op}Loading`]: false,
          [`${op}Error`]: error,
        } as any);
      },
    })),
  );
}
