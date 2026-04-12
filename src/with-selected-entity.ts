import { computed } from '@angular/core';
import {
  patchState,
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { EntityId } from '@ngrx/signals/entities';

export interface SelectedEntityConfig {
  /**
   * Named entity collection (must match the `collection` passed to `withEntities`).
   * Omit for the default (unnamed) collection.
   */
  collection?: string;
}

/**
 * Adds entity selection tracking to an entity store.
 *
 * Must be composed **after** `withEntities()`.
 *
 * **State**: `selectedId: EntityId | null`
 *
 * **Computed**: `selectedEntity` (looked up from entityMap)
 *
 * **Methods**: `select(id)`, `clearSelection()`
 *
 * @example
 * ```ts
 * const TodoStore = signalStore(
 *   { providedIn: 'root' },
 *   withEntities({ entity: type<Todo>() }),
 *   withSelectedEntity(),
 * );
 *
 * // Select:
 * store.select('todo-1');
 * store.selectedEntity(); // Todo | null
 *
 * // Clear:
 * store.clearSelection();
 * ```
 *
 * @example Named collection:
 * ```ts
 * const ProductStore = signalStore(
 *   { providedIn: 'root' },
 *   withEntities({ entity: type<Product>(), collection: 'products' }),
 *   withSelectedEntity({ collection: 'products' }),
 * );
 * ```
 */
export function withSelectedEntity(config?: SelectedEntityConfig) {
  const collection = config?.collection;

  return signalStoreFeature(
    withState({ selectedId: null as EntityId | null }),
    withComputed((store: any) => ({
      selectedEntity: computed(() => {
        const id = store.selectedId();
        if (id == null) return null;
        const entityMap = collection
          ? store[`${collection}EntityMap`]()
          : store.entityMap();
        return entityMap[id] ?? null;
      }),
    })),
    withMethods((store) => ({
      select(id: EntityId) {
        patchState(store, { selectedId: id });
      },
      clearSelection() {
        patchState(store, { selectedId: null as EntityId | null });
      },
    })),
  );
}
