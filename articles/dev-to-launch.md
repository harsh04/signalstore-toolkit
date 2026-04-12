---
title: "I cut 40% of my NgRx Signal Store boilerplate — here's the 5 utilities I extracted"
published: false
description: "Production-grade utilities for NgRx Signal Store: request status, entity sync, pagination, API method factories, and search/filter pipelines."
tags: angular, ngrx, typescript, webdev
cover_image: 
---

After building 20+ signal stores for a production hospitality app, I noticed I was writing the same 30-50 lines of boilerplate in every store. Loading states, error handling, entity CRUD, pagination math, search filtering -- the same patterns, copy-pasted with minor variations.

So I extracted them into a small library. Five composable `signalStoreFeature` utilities that drop into any NgRx Signal Store with zero ceremony.

## The problem

Here is a stripped-down product store. Nothing unusual -- just loading state, entity management, and a search filter. The kind of thing you write every week.

```ts
const ProductStore = signalStore(
  { providedIn: 'root' },
  withEntities({ entity: type<Product>() }),
  withState({
    isLoading: false, isError: false, errorMessage: '',
    searchQuery: '', currentPage: 1, pageSize: 20, total: 0,
  }),
  withComputed(({ entities, searchQuery, currentPage, pageSize, total }) => {
    const totalPages = computed(() => Math.ceil(total() / pageSize()) || 1);
    return {
      filteredEntities: computed(() => {
        const q = searchQuery().toLowerCase();
        return q ? entities().filter(p =>
          p.name.toLowerCase().includes(q)) : entities();
      }),
      totalPages,
      hasNextPage: computed(() => currentPage() < totalPages()),
      hasPreviousPage: computed(() => currentPage() > 1),
    };
  }),
  withMethods((store) => ({
    load: rxMethod<void>(pipe(
      tap(() => patchState(store, { isLoading: true, isError: false })),
      switchMap(() => productService.list({
        offset: (store.currentPage() - 1) * store.pageSize(),
        limit: store.pageSize(),
      }).pipe(tapResponse({
        next: (res) => {
          patchState(store, { isLoading: false, total: res.total });
          setAllEntities(res.items, { ... });
        },
        error: (e) => patchState(store, {
          isLoading: false, isError: true, errorMessage: e.message,
        }),
      }))),
    )),
    setSearchQuery(q: string) { patchState(store, { searchQuery: q }); },
    nextPage() { /* bounds checking ... */ },
    previousPage() { /* bounds checking ... */ },
  })),
);
```

That is roughly 50 lines, and most of it is structural wiring that has nothing to do with your domain. The loading/error triple. The pagination math. The search filter pipeline. The `rxMethod` + `tap` + `switchMap` + `tapResponse` dance.

Every new store starts with this exact skeleton. I got tired of copying it.

## The 5 utilities

### 1. `withRequestStatus()` -- replaces the loading/error triple

**Before**: You manually declare `isLoading`, `isError`, `errorMessage` in state, then set them at three different points in every API call.

**After**:

```ts
const ProductStore = signalStore(
  { providedIn: 'root' },
  withRequestStatus(),
  withMethods((store) => ({
    load: rxMethod<void>(pipe(
      tap(() => store.setPending()),
      switchMap(() => api.list().pipe(tapResponse({
        next: (res) => { /* ... */ store.setFulfilled(); },
        error: (e) => store.setError(e.message),
      }))),
    )),
  })),
);
```

Gives you `store.isPending()`, `store.error()`, `store.isFulfilled()` as computed signals, plus `setPending()`, `setFulfilled()`, `setError(msg)`, and `resetStatus()` methods. The status type is a discriminated union (`'idle' | 'pending' | 'fulfilled' | { error: string }`), so the type narrowing works cleanly.

### 2. `withEntitySync()` -- replaces manual entity CRUD + live updates

**Before**: Every entity store hand-rolls `setAllEntities`, `addEntity`, `updateEntity`, and a `liveUpdate` function that parses JSON, checks if the entity exists, and upserts accordingly.

**After**:

```ts
const ProductStore = signalStore(
  { providedIn: 'root' },
  withEntities({ entity: type<Product>(), collection: 'products' }),
  withEntitySync<Product>({
    selectId: (p) => p.productId,
    collection: 'products',
  }),
);

// Now you get:
store.syncAll(productsFromApi);      // replace all
store.upsertOne(updatedProduct);     // add or update
store.liveUpdate(websocketPayload);  // JSON parse + upsert
store.removeOne('product-123');      // remove by ID
```

The `liveUpdate` method handles the parse-check-upsert pattern that was duplicated in every store subscribing to Firestore streams or WebSocket events.

### 3. `withPagination()` -- replaces manual page state

**Before**: You declare `currentPage`, `pageSize`, `total` in state, compute `totalPages`/`hasNextPage`/`hasPreviousPage`/`pageOffset`, and write bounds-checked navigation methods.

**After**:

```ts
const ListStore = signalStore(
  { providedIn: 'root' },
  withPagination({ pageSize: 25 }),
  withMethods((store) => ({
    load: rxMethod<void>(pipe(
      switchMap(() => api.list({
        offset: store.pageOffset(),
        limit: store.pageSize(),
      }).pipe(tapResponse({
        next: (res) => store.setPageResult({ total: res.total }),
        error: console.error,
      }))),
    )),
  })),
);
```

All navigation methods are bounds-clamped -- you cannot go below page 1 or above the last page.

### 4. `createApiMethod()` -- replaces the rxMethod boilerplate

This is the biggest win per-method. Every API call in a signal store follows the same pattern: set loading, run observable, handle success, handle error, reset loading. `createApiMethod` is a factory that wires all of that for you.

**Before**: 15-20 lines of `rxMethod(pipe(tap, switchMap, tapResponse))` per method.

**After**:

```ts
withMethods((store) => ({
  load: createApiMethod({
    store,
    request: () => productService.getAll(),
    isSuccess: (res) => !!res.status,
    getErrorMessage: (res) => res.message ?? 'Load failed',
    onSuccess: (res) => ({ products: res.data.toObject().items }),
  }),
  create: createApiMethod({
    store,
    request: (input: CreateProductInput) => productService.create(input),
    operator: concatMap,       // writes should queue, not cancel
    loadingKey: 'isCreating',  // per-operation loading state
    onSuccess: (res) => { /* custom patch logic */ },
  }),
})),
```

Two things worth calling out. `isSuccess` handles the "200 but failed" pattern -- when your backend returns `{ status: false, message: 'Not found' }` inside a successful HTTP response, it routes to the error path. And `loadingKey` / `errorKey` / `messageKey` give you per-operation loading states, so creating a product does not flicker your list loading spinner.

### 5. `withSearchFilter()` -- replaces search/filter computed chains

**Before**: A `computed()` that reads `entities()` and `searchQuery()`, lowercases both, filters, optionally sorts, and returns the result.

**After**:

```ts
const RoomStore = signalStore(
  { providedIn: 'root' },
  withEntities({ entity: type<Room>() }),
  withSearchFilter<Room>({
    searchFields: (r) => [r.name, r.floor, r.type],
    sortBy: (a, b) => a.name.localeCompare(b.name),
  }),
);
```

Gives you `store.filteredEntities()`, `store.setSearchQuery(q)`, and `store.clearSearch()`. Case-insensitive, null-safe on fields, sort applied after filtering.

## All 5 composed

Here is what a complete store looks like when you use all five together:

```ts
const ProductStore = signalStore(
  { providedIn: 'root' },
  withEntities({ entity: type<Product>() }),
  withRequestStatus(),
  withPagination({ pageSize: 50 }),
  withEntitySync<Product>({ selectId: (p) => p.id }),
  withSearchFilter<Product>({
    searchFields: (p) => [p.name, p.sku, p.category],
    sortBy: (a, b) => a.name.localeCompare(b.name),
  }),
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

That is your entire store. Domain logic only, no infrastructure wiring.

## How it differs from @angular-architects/ngrx-toolkit

The Angular Architects team has an excellent `ngrx-toolkit` package with `withCallState` and `withDataService`. If that solves your problem, use it. Here is where `signalstore-toolkit` fills gaps I hit in production:

- **Per-operation status tracking** -- `withCallState` gives you one global status per store. `createApiMethod` lets you track loading/error per operation via `loadingKey` / `errorKey`.
- **Entity live-update reconciliation** -- `withEntitySync` handles the parse-check-upsert pattern for WebSocket and Firestore streams. `withDataService` focuses on CRUD against a REST endpoint.
- **App-level response checking** -- The `isSuccess` / `getErrorMessage` config in `createApiMethod` handles backends that return `{ status: false }` inside a 200 response. This is common in gRPC-web and some REST wrappers.
- **Search/filter pipeline** -- `withSearchFilter` is a composable feature for client-side search across entity fields with optional sorting. Not covered by ngrx-toolkit.

They are complementary. You can use `withCallState` from theirs and `createApiMethod` from this one in the same store.

## Install

```bash
npm install signalstore-toolkit
```

Works with Angular 17+ and NgRx Signals 17+. The `@ngrx/operators` peer dependency is optional -- only needed if you use `createApiMethod`.

- **GitHub**: [github.com/harsh04/signalstore-toolkit](https://github.com/harsh04/signalstore-toolkit)
- **npm**: [npmjs.com/package/signalstore-toolkit](https://www.npmjs.com/package/signalstore-toolkit)

If you have been writing similar patterns in your stores, I would like to hear what you extracted. The goal is to keep this small and composable -- five features, zero opinions about your domain.
