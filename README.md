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
| [`withSelectedEntity`](#withselectedentity) | Selected entity tracking with `selectedId` + `selectedEntity` computed | ~15 lines per store |
| [`withPerOperationStatus`](#withperoperationstatus) | Per-operation `{op}Loading` / `{op}Error` for N named operations | ~50 lines per action store |
| [`withResetState`](#withresetstate) | Reset store to initial state (logout, route change, form reset) | ~10 lines per store |
| [`withOptimisticUpdate`](#withoptimisticupdate) | Snapshot → mutate → rollback-on-error pattern | ~25 lines per mutation |
| [`mockSignalStore`](#mocksignalstore) | Unit test mocks with auto-spy detection (vitest/jest) | ~30 lines per test file |

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

## `withSelectedEntity`

Track which entity is selected in a list/detail view. Compose **after** `withEntities()`.

```ts
const TodoStore = signalStore(
  { providedIn: 'root' },
  withEntities({ entity: type<Todo>() }),
  withSelectedEntity(),
);

store.select('todo-1');
store.selectedEntity();   // Todo | null
store.clearSelection();
```

For named collections: `withSelectedEntity({ collection: 'products' })`.

### API

| Member | Type | Description |
|--------|------|-------------|
| `selectedId` | `Signal<EntityId \| null>` | Currently selected ID |
| `selectedEntity` | `Signal<Entity \| null>` | Computed from entityMap |
| `select(id)` | method | Set selection |
| `clearSelection()` | method | Clear selection |

---

## `withPerOperationStatus`

Generates independent loading/error tracking for N named async operations. The unique feature nobody else ships.

```ts
const TaskActionStore = signalStore(
  { providedIn: 'root' },
  withPerOperationStatus({ operations: ['load', 'save', 'delete'] as const }),
  withMethods((store) => ({
    loadTasks: rxMethod<void>(
      pipe(
        tap(() => store.startOp('load')),
        switchMap(() =>
          taskService.list().pipe(
            tapResponse({
              next: (tasks) => { store.endOp('load'); },
              error: (e) => store.failOp('load', e.message),
            }),
          ),
        ),
      ),
    ),
  })),
);
```

```html
@if (store.loadState().loading) { <spinner /> }
@if (store.saveState().error; as err) { <error [message]="err" /> }
```

### Generated per operation

For each operation name (e.g. `'load'`):

| Member | Type | Description |
|--------|------|-------------|
| `loadLoading` | `Signal<boolean>` | Loading flag |
| `loadError` | `Signal<string \| null>` | Error message |
| `loadState` | `Signal<{ loading, error }>` | Combined status |

### Helper methods

| Method | Description |
|--------|-------------|
| `startOp(name)` | Set loading true, clear error |
| `endOp(name)` | Set loading false |
| `failOp(name, msg)` | Set loading false, set error |

---

## `withResetState`

Captures initial state on store creation, adds `resetState()` to restore it. Useful for logout, route changes, or form resets.

```ts
const FormStore = signalStore(
  { providedIn: 'root' },
  withState({ name: '', email: '', dirty: false }),
  withResetState(),
);

// After user edits:
store.resetState(); // back to { name: '', email: '', dirty: false }
```

Must be composed **after** all `withState()` calls.

---

## `withOptimisticUpdate`

Applies a local mutation immediately, then rolls back if the server request fails.

```ts
const TodoStore = signalStore(
  { providedIn: 'root' },
  withState({ todos: [] as Todo[] }),
  withOptimisticUpdate(),
  withMethods((store) => ({
    toggleDone(id: string) {
      store.optimistic(
        // 1. Mutate locally (instant UI)
        () => patchState(store, {
          todos: store.todos().map(t =>
            t.id === id ? { ...t, done: !t.done } : t
          ),
        }),
        // 2. Confirm on server
        todoService.toggle(id),
        {
          onError: (err) => console.error('Rolled back', err),
        },
      );
    },
  })),
);
```

### API

| Parameter | Type | Description |
|-----------|------|-------------|
| `mutation` | `() => void` | Function that calls `patchState` immediately |
| `request` | `Observable<T>` | Server request to confirm the mutation |
| `options.onSuccess` | `(res) => void` | Called on success |
| `options.onError` | `(err) => void` | Called after rollback on failure |

---

## `mockSignalStore`

Testing utility that creates a mock of any signal store. Auto-detects vitest (`vi.fn()`) or jest (`jest.fn()`) for spies.

```ts
import { mockSignalStore } from 'signalstore-toolkit';

const mock = mockSignalStore(TodoStore, {
  entities: [{ id: '1', title: 'Test', done: false }],
  isPending: false,
  error: null,
});

// Signals work like the real store:
mock.isPending();       // false
mock.entities();        // [{ id: '1', ... }]

// Methods are auto-spied:
mock.load();
expect(mock.load).toHaveBeenCalled();

// Update signal values in tests:
(mock.isPending as WritableSignal<boolean>).set(true);
```

### With TestBed

```ts
TestBed.configureTestingModule({
  providers: [
    { provide: TodoStore, useValue: mockSignalStore(TodoStore, { ... }) },
  ],
});
```

### Config

| Option | Default | Description |
|--------|---------|-------------|
| `spyFn` | auto-detect | Custom spy factory: `() => vi.fn()` |

---

## vs @angular-architects/ngrx-toolkit

| Feature | signalstore-toolkit | @angular-architects/ngrx-toolkit |
|---------|--------------------|---------------------------------|
| Request status tracking | `withRequestStatus()` -- idle/pending/fulfilled/error lifecycle | `withCallState()` -- similar concept |
| Per-operation status | Use multiple `withRequestStatus()` with different keys (planned v0.2) | Single call state per feature |
| Entity CRUD + live sync | `withEntitySync()` -- syncAll, upsertOne, liveUpdate from JSON | Not included |
| Pagination | `withPagination()` -- full page state + navigation | Not included |
| API method factory | `createApiMethod()` -- rxMethod + tapResponse + loading in one config | `withDataService()` -- different approach, couples to a service class |
| Search/filter pipeline | `withSearchFilter()` -- declarative search + sort on entities | Not included |
| Per-operation status | `withPerOperationStatus()` -- N named operations | Not included |
| Selected entity | `withSelectedEntity()` -- selectedId + selectedEntity | Not included |
| Reset state | `withResetState()` -- restore initial state | Not included |
| Optimistic updates | `withOptimisticUpdate()` -- snapshot + rollback | Not included |
| Test mocks | `mockSignalStore()` -- auto-spy for vitest/jest | Not included |
| DevTools integration | Not included (use ngrx-toolkit for this) | `withDevtools()` |
| Undo/redo | Not included | `withUndoRedo()` |
| Storage sync | Not included | `withStorageSync()` |

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
