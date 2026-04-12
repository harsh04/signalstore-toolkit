# signalstore-toolkit

Production-grade utilities for [NgRx Signal Store](https://ngrx.io/guide/signals). Eliminates the boilerplate that every real-world signal store repeats — loading states, entity sync, pagination, API calls, and search/filter pipelines.

Born from patterns battle-tested across 20+ stores in a production hospitality platform.

## Install

```bash
npm install signalstore-toolkit
```

**Peer dependencies**: `@angular/core >=17`, `@ngrx/signals >=17`, `rxjs >=7`, `@ngrx/operators >=17` (optional — only needed for `createApiMethod`)

## Features

| Feature | What it replaces | Lines saved |
|---------|-----------------|-------------|
| [`withRequestStatus`](#withrequestatus) | Per-operation `isLoading` / `isError` / `errorMessage` boilerplate | ~45 lines per store |
| [`withEntitySync`](#withentitysync) | Entity CRUD + live-update reconciliation | ~40 lines per store |
| [`withPagination`](#withpagination) | Page state, computed helpers, navigation methods | ~35 lines per store |
| [`createApiMethod`](#createapimethod) | `rxMethod` + `tap` + `switchMap` + `tapResponse` wiring | ~30 lines per method |
| [`withSearchFilter`](#withsearchfilter) | Search + filter + sort computed pipeline | ~25 lines per store |

---

## `withRequestStatus`

Tracks the lifecycle of an async operation: `idle → pending → fulfilled | error`.

```ts
import { signalStore, withMethods, patchState } from '@ngrx/signals';
import { withRequestStatus } from 'signalstore-toolkit';

const TodoStore = signalStore(
  { providedIn: 'root' },
  withRequestStatus(),
  withMethods((store) => ({
    load: rxMethod<void>(
      pipe(
        tap(() => store.setPending()),
        switchMap(() =>
          todoService.getAll().pipe(
            tapResponse({
              next: (todos) => {
                patchState(store, { todos });
                store.setFulfilled();
              },
              error: (e) => store.setError(e.message),
            }),
          ),
        ),
      ),
    ),
  })),
);
```

**In your template:**

```html
@if (store.isPending()) {
  <loading-spinner />
}
@if (store.error(); as error) {
  <error-banner [message]="error" />
}
```

### API

| Member | Type | Description |
|--------|------|-------------|
| `requestStatus` | `Signal<RequestStatus>` | Raw status value |
| `isPending` | `Signal<boolean>` | `true` while loading |
| `isFulfilled` | `Signal<boolean>` | `true` after success |
| `error` | `Signal<string \| null>` | Error message or `null` |
| `setPending()` | method | Transition to loading |
| `setFulfilled()` | method | Transition to success |
| `setError(msg)` | method | Transition to error |
| `resetStatus()` | method | Back to idle |

---

## `withEntitySync`

Real-time entity reconciliation. Adds `syncAll`, `upsertOne`, `liveUpdate`, and `removeOne` to any entity store. Compose it **after** `withEntities()`.

```ts
import { signalStore, type } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { withEntitySync } from 'signalstore-toolkit';

interface Product {
  productId: string;
  name: string;
  qty: number;
}

const InventoryStore = signalStore(
  { providedIn: 'root' },
  withEntities({ entity: type<Product>(), collection: 'inventory' }),
  withEntitySync<Product>({
    selectId: (p) => p.productId,
    collection: 'inventory',
  }),
);
```

```ts
// Replace all entities from an API response
store.syncAll(productsFromApi);

// Upsert from a WebSocket / Firestore stream
store.upsertOne(incomingProduct);

// Parse JSON and upsert (for raw message payloads)
store.liveUpdate(websocketEvent.payload);

// Remove
store.removeOne('product-123');
```

### API

| Method | Description |
|--------|-------------|
| `syncAll(entities)` | Replace the entire collection |
| `upsertOne(entity)` | Update if exists, add if new |
| `liveUpdate(json)` | JSON.parse → upsert (logs parse errors) |
| `removeOne(id)` | Remove by entity ID |

---

## `withPagination`

Page-based pagination with computed navigation helpers.

```ts
import { signalStore, withState, withMethods } from '@ngrx/signals';
import { withPagination } from 'signalstore-toolkit';

const ListStore = signalStore(
  { providedIn: 'root' },
  withState({ items: [] as Item[] }),
  withPagination({ pageSize: 25 }),
  withMethods((store) => ({
    load: rxMethod<void>(
      pipe(
        switchMap(() =>
          api.list({ offset: store.pageOffset(), limit: store.pageSize() }).pipe(
            tapResponse({
              next: (res) => {
                patchState(store, { items: res.items });
                store.setPageResult({ total: res.total });
              },
              error: console.error,
            }),
          ),
        ),
      ),
    ),
  })),
);
```

```html
<button [disabled]="!store.hasPreviousPage()" (click)="store.previousPage()">Prev</button>
<span>{{ store.currentPage() }} / {{ store.totalPages() }}</span>
<button [disabled]="!store.hasNextPage()" (click)="store.nextPage()">Next</button>
```

### API

| Member | Type | Description |
|--------|------|-------------|
| `currentPage` | `Signal<number>` | 1-indexed current page |
| `pageSize` | `Signal<number>` | Items per page |
| `total` | `Signal<number>` | Total item count from server |
| `totalPages` | `Signal<number>` | Computed `ceil(total / pageSize)` |
| `hasNextPage` | `Signal<boolean>` | `currentPage < totalPages` |
| `hasPreviousPage` | `Signal<boolean>` | `currentPage > 1` |
| `pageOffset` | `Signal<number>` | `(currentPage - 1) * pageSize` |
| `setPage(n)` | method | Jump to page (clamped) |
| `nextPage()` | method | Go forward (no-op at end) |
| `previousPage()` | method | Go back (no-op at start) |
| `setPageSize(n)` | method | Change page size (resets to page 1) |
| `setPageResult({total})` | method | Update total from API response |

---

## `createApiMethod`

Factory that creates an `rxMethod` pre-wired with loading state, response-status checking, and error handling. Replaces 30+ lines of `pipe(tap, switchMap, tapResponse)` boilerplate **per method**.

> Requires `@ngrx/operators` peer dependency for `tapResponse`.

```ts
import { signalStore, withState, withMethods } from '@ngrx/signals';
import { createApiMethod } from 'signalstore-toolkit';
import { concatMap } from 'rxjs';

const TodoStore = signalStore(
  { providedIn: 'root' },
  withState({
    todos: [] as Todo[],
    isLoading: false,
    isError: false,
    errorMessage: '',
  }),
  withMethods((store) => ({
    // Read — uses switchMap (default, latest-wins)
    load: createApiMethod({
      store,
      request: () => todoService.getAll(),
      isSuccess: (res) => !!res.status,
      getErrorMessage: (res) => res.message ?? 'Load failed',
      onSuccess: (res) => ({ todos: res.data.toObject().items }),
    }),

    // Write — uses concatMap (queue, don't cancel)
    create: createApiMethod({
      store,
      request: (input: CreateTodoInput) => todoService.create(input),
      operator: concatMap,
      loadingKey: 'isCreating',
      errorKey: 'createError',
      messageKey: 'createErrorMessage',
      onSuccess: (res) => {
        // Manually patch if you need custom logic
        patchState(store, { todos: [...store.todos(), res.data.toObject()] });
      },
    }),
  })),
);
```

### Config

| Option | Default | Description |
|--------|---------|-------------|
| `store` | required | Signal store instance |
| `request` | required | `(input) => Observable<Response>` |
| `onSuccess` | required | Handle success — return partial state or void |
| `onError` | — | Handle error — return partial state or void |
| `isSuccess` | — | App-level success check (e.g. `res.status === true`) |
| `getErrorMessage` | — | Extract error message from failed `isSuccess` |
| `loadingKey` | `'isLoading'` | State key for loading boolean |
| `errorKey` | `'isError'` | State key for error flag |
| `messageKey` | `'errorMessage'` | State key for error message |
| `operator` | `switchMap` | RxJS flattening operator |

---

## `withSearchFilter`

Search + sort pipeline on entity collections. Compose **after** `withEntities()`.

```ts
import { signalStore, type } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { withSearchFilter } from 'signalstore-toolkit';

const RoomStore = signalStore(
  { providedIn: 'root' },
  withEntities({ entity: type<Room>() }),
  withSearchFilter<Room>({
    searchFields: (r) => [r.name, r.floor, r.type],
    sortBy: (a, b) => a.name.localeCompare(b.name),
  }),
);
```

```html
<ion-searchbar (ionInput)="store.setSearchQuery($event.detail.value ?? '')" />

@for (room of store.filteredEntities(); track room.id) {
  <room-card [room]="room" />
} @empty {
  <p>No rooms match "{{ store.searchQuery() }}"</p>
}
```

### API

| Member | Type | Description |
|--------|------|-------------|
| `searchQuery` | `Signal<string>` | Current search term |
| `filteredEntities` | `Signal<Entity[]>` | Filtered + sorted result |
| `setSearchQuery(q)` | method | Update the search term |
| `clearSearch()` | method | Reset to empty string |

---

## Composing Features

These features are designed to compose together. Here's a complete store using all five:

```ts
const ProductStore = signalStore(
  { providedIn: 'root' },

  // Entities
  withEntities({ entity: type<Product>() }),

  // Request status
  withRequestStatus(),

  // Pagination
  withPagination({ pageSize: 50 }),

  // Real-time sync
  withEntitySync<Product>({ selectId: (p) => p.id }),

  // Search
  withSearchFilter<Product>({
    searchFields: (p) => [p.name, p.sku, p.category],
    sortBy: (a, b) => a.name.localeCompare(b.name),
  }),

  // API methods
  withMethods((store) => ({
    load: createApiMethod({
      store,
      request: (params: ListParams) => productService.list(params),
      onSuccess: (res) => {
        store.syncAll(res.items);
        store.setPageResult({ total: res.total });
      },
    }),
  })),
);
```

## vs @angular-architects/ngrx-toolkit

| Feature | signalstore-toolkit | @angular-architects/ngrx-toolkit |
|---------|--------------------|---------------------------------|
| Request status tracking | `withRequestStatus()` -- idle/pending/fulfilled/error lifecycle | `withCallState()` -- similar concept |
| Per-operation status | Use multiple `withRequestStatus()` with different keys (planned v0.2) | Single call state per feature |
| Entity CRUD + live sync | `withEntitySync()` -- syncAll, upsertOne, liveUpdate from JSON | Not included |
| Pagination | `withPagination()` -- full page state + navigation | Not included |
| API method factory | `createApiMethod()` -- rxMethod + tapResponse + loading in one config | `withDataService()` -- different approach, couples to a service class |
| Search/filter pipeline | `withSearchFilter()` -- declarative search + sort on entities | Not included |
| DevTools integration | Not included (use ngrx-toolkit for this) | `withDevtools()` |
| Undo/redo | Not included | `withUndoRedo()` |

The two libraries are complementary -- use both together for full coverage.

---

## Examples

See [examples/product-store.ts](examples/product-store.ts) for a complete store using all 5 features.

---

## Compatibility

| Dependency | Minimum version |
|-----------|----------------|
| Angular | 17+ |
| NgRx Signals | 17+ |
| RxJS | 7+ |
| `@ngrx/operators` | 17+ (optional — only for `createApiMethod`) |

## License

MIT
