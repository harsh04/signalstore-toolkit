import { computed } from '@angular/core';
import {
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
  patchState,
} from '@ngrx/signals';

export interface SearchFilterConfig<Entity> {
  /**
   * Return the string fields to match against.
   * `null` / `undefined` values are safely skipped.
   *
   * ```ts
   * searchFields: (item) => [item.name, item.roomNumber, item.refId]
   * ```
   */
  searchFields: (entity: Entity) => (string | undefined | null)[];

  /**
   * Optional comparator applied **after** filtering.
   * Defaults to no sort (original order preserved).
   */
  sortBy?: (a: Entity, b: Entity) => number;
}

/**
 * Adds a full-text search + sort pipeline to a store that already
 * exposes an `entities()` signal (via `withEntities()`).
 *
 * **State**: `searchQuery: string`
 *
 * **Computed**: `filteredEntities` (searched + sorted subset)
 *
 * **Methods**: `setSearchQuery(q)`, `clearSearch()`
 *
 * @example
 * ```ts
 * const RoomStore = signalStore(
 *   { providedIn: 'root' },
 *   withEntities({ entity: type<Room>() }),
 *   withSearchFilter<Room>({
 *     searchFields: (r) => [r.name, r.floor, r.type],
 *     sortBy: (a, b) => a.name.localeCompare(b.name),
 *   }),
 * );
 *
 * // Template:
 * // @for (room of store.filteredEntities(); track room.id) { ... }
 * ```
 */
export function withSearchFilter<Entity>(config: SearchFilterConfig<Entity>) {
  const { searchFields, sortBy } = config;

  return signalStoreFeature(
    withState({ searchQuery: '' }),
    withComputed((store: any) => ({
      filteredEntities: computed(() => {
        const entities: Entity[] = store.entities?.() ?? [];
        const query = (store.searchQuery() as string).toLowerCase().trim();

        let result = entities;

        if (query) {
          result = result.filter((entity) =>
            searchFields(entity).some((field) =>
              field?.toLowerCase().includes(query),
            ),
          );
        }

        if (sortBy) {
          result = [...result].sort(sortBy);
        }

        return result;
      }),
    })),
    withMethods((store) => ({
      setSearchQuery(query: string) {
        patchState(store, { searchQuery: query });
      },
      clearSearch() {
        patchState(store, { searchQuery: '' });
      },
    })),
  );
}
