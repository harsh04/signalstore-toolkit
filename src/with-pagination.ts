import { computed } from '@angular/core';
import {
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
  patchState,
} from '@ngrx/signals';

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  total: number;
}

/**
 * Adds page-based pagination state, computed helpers, and navigation methods.
 *
 * **State**: `currentPage`, `pageSize`, `total`
 *
 * **Computed**: `totalPages`, `hasNextPage`, `hasPreviousPage`, `pageOffset`
 *
 * **Methods**: `setPage(n)`, `nextPage()`, `previousPage()`, `setPageSize(n)`,
 * `setPageResult({ total, pageSize? })`
 *
 * @example
 * ```ts
 * const ListStore = signalStore(
 *   { providedIn: 'root' },
 *   withPagination({ pageSize: 25 }),
 *   withMethods((store) => ({
 *     load: rxMethod<void>(
 *       pipe(
 *         switchMap(() =>
 *           api.list({ offset: store.pageOffset(), limit: store.pageSize() }).pipe(
 *             tapResponse({
 *               next: (res) => {
 *                 patchState(store, { items: res.items });
 *                 store.setPageResult({ total: res.total });
 *               },
 *               error: console.error,
 *             }),
 *           ),
 *         ),
 *       ),
 *     ),
 *   })),
 * );
 *
 * // In a template:
 * // store.hasNextPage()  → boolean
 * // store.totalPages()   → number
 * ```
 */
export function withPagination(config?: { pageSize?: number }) {
  const initialPageSize = config?.pageSize ?? 20;

  return signalStoreFeature(
    withState<PaginationState>({
      currentPage: 1,
      pageSize: initialPageSize,
      total: 0,
    }),
    withComputed(({ currentPage, pageSize, total }) => {
      const totalPages = computed(
        () => Math.ceil(total() / pageSize()) || 1,
      );
      return {
        totalPages,
        hasNextPage: computed(() => currentPage() < totalPages()),
        hasPreviousPage: computed(() => currentPage() > 1),
        pageOffset: computed(() => (currentPage() - 1) * pageSize()),
      };
    }),
    withMethods((store) => ({
      setPage(page: number) {
        patchState(store, {
          currentPage: Math.max(1, Math.min(page, store.totalPages())),
        });
      },
      nextPage() {
        if (store.hasNextPage()) {
          patchState(store, { currentPage: store.currentPage() + 1 });
        }
      },
      previousPage() {
        if (store.hasPreviousPage()) {
          patchState(store, { currentPage: store.currentPage() - 1 });
        }
      },
      setPageSize(size: number) {
        patchState(store, { pageSize: size, currentPage: 1 });
      },
      setPageResult(result: { total: number; pageSize?: number }) {
        patchState(store, {
          total: result.total,
          ...(result.pageSize != null ? { pageSize: result.pageSize } : {}),
        });
      },
    })),
  );
}
