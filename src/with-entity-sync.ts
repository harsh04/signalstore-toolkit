import { patchState, signalStoreFeature, withMethods } from '@ngrx/signals';
import {
  addEntity,
  removeEntity,
  setAllEntities,
  updateEntity,
  type EntityId,
  type SelectEntityId,
} from '@ngrx/signals/entities';

export interface EntitySyncConfig<Entity> {
  /** Function that returns the unique ID from an entity. */
  selectId: SelectEntityId<NoInfer<Entity>>;
  /**
   * Named collection (must match the `collection` passed to `withEntities`).
   * Omit for the default (unnamed) entity collection.
   */
  collection?: string;
}

/**
 * Adds real-time entity synchronisation methods to a signal store.
 *
 * **Must be composed after `withEntities()`** so the entity map is available.
 *
 * **Methods added**:
 * - `syncAll(entities)` — replace the entire collection
 * - `upsertOne(entity)` — update if exists, add if new
 * - `liveUpdate(json)` — parse a JSON string and upsert (for WebSocket / Firestore streams)
 * - `removeOne(id)` — remove by ID
 *
 * @example
 * ```ts
 * interface Product { productId: string; name: string; qty: number }
 *
 * const InventoryStore = signalStore(
 *   { providedIn: 'root' },
 *   withEntities({ entity: type<Product>(), collection: 'inventory' }),
 *   withEntitySync<Product>({
 *     selectId: (p) => p.productId,
 *     collection: 'inventory',
 *   }),
 * );
 *
 * // In a component or effect:
 * store.syncAll(productsFromApi);
 * store.liveUpdate(websocketMessage.payload);
 * ```
 */
export function withEntitySync<Entity extends Record<string, any>>(
  config: EntitySyncConfig<Entity>,
) {
  const { selectId, collection } = config;
  const entityConfig = collection ? { collection, selectId } : { selectId };

  return signalStoreFeature(
    withMethods((store: any) => {
      function getEntityMap(): Record<EntityId, Entity> {
        return collection
          ? store[`${collection}EntityMap`]()
          : store.entityMap();
      }

      return {
        syncAll(entities: Entity[]) {
          patchState(store, setAllEntities(entities, entityConfig as any));
        },

        upsertOne(entity: Entity) {
          const id = selectId(entity);
          if (getEntityMap()[id]) {
            patchState(
              store,
              updateEntity(
                { id, changes: entity as any },
                entityConfig as any,
              ),
            );
          } else {
            patchState(store, addEntity(entity, entityConfig as any));
          }
        },

        liveUpdate(json: string) {
          try {
            const entity = JSON.parse(json) as Entity;
            const id = selectId(entity);
            if (getEntityMap()[id]) {
              patchState(
                store,
                updateEntity(
                  { id, changes: entity as any },
                  entityConfig as any,
                ),
              );
            } else {
              patchState(store, addEntity(entity, entityConfig as any));
            }
          } catch (e) {
            console.error(
              '[signalstore-toolkit] liveUpdate: invalid JSON',
              e,
            );
          }
        },

        removeOne(id: EntityId) {
          patchState(store, removeEntity(id, entityConfig as any));
        },
      };
    }),
  );
}
