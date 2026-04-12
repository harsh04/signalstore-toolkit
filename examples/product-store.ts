/**
 * Product Store — complete example composing all 5 signalstore-toolkit features.
 *
 * Demonstrates:
 *   1. withEntities + withEntitySync   — entity collection with real-time sync
 *   2. withRequestStatus               — idle/pending/fulfilled/error lifecycle
 *   3. withPagination                  — page-based navigation (pageSize 25)
 *   4. withSearchFilter                — search across name, sku, category
 *   5. createApiMethod                 — declarative API call with loading/error wiring
 *   6. Domain-specific computed signals — totalInStock, outOfStockCount
 *
 * Copy this file into any Angular 17+ project with signalstore-toolkit installed.
 * Replace `productService` with your actual service or HTTP client.
 */

import { computed, inject } from '@angular/core';
import { signalStore, type, withComputed, withMethods, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import {
  createApiMethod,
  withEntitySync,
  withPagination,
  withRequestStatus,
  withSearchFilter,
} from 'signalstore-toolkit';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  inStock: boolean;
}

// ---------------------------------------------------------------------------
// Stub service — replace with your real gRPC / HTTP service
// ---------------------------------------------------------------------------

interface ListProductsParams {
  offset: number;
  limit: number;
}

interface ListProductsResponse {
  status: boolean;
  message: string;
  items: Product[];
  total: number;
}

// In a real app this would be an injectable Angular service.
// Shown inline here so the example is self-contained.
abstract class ProductService {
  abstract list(params: ListProductsParams): import('rxjs').Observable<ListProductsResponse>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const ProductStore = signalStore(
  { providedIn: 'root' },

  // 1. Entity collection
  withEntities({ entity: type<Product>() }),

  // 2. Request status lifecycle (idle -> pending -> fulfilled | error)
  withRequestStatus(),

  // 3. Pagination — 25 items per page
  withPagination({ pageSize: 25 }),

  // 4. Real-time entity sync (syncAll, upsertOne, liveUpdate, removeOne)
  withEntitySync<Product>({ selectId: (p) => p.id }),

  // 5. Search across name, sku, and category; sort alphabetically by name
  withSearchFilter<Product>({
    searchFields: (p) => [p.name, p.sku, p.category],
    sortBy: (a, b) => a.name.localeCompare(b.name),
  }),

  // Loading / error state keys consumed by createApiMethod
  withState({
    isLoading: false,
    isError: false,
    errorMessage: '',
  }),

  // Domain-specific computed signals
  withComputed(({ entities }) => ({
    totalInStock: computed(() => entities().filter((p) => p.inStock).length),
    outOfStockCount: computed(() => entities().filter((p) => !p.inStock).length),
  })),

  // API methods
  withMethods((store) => {
    const productService = inject(ProductService);

    return {
      load: createApiMethod<void, ListProductsResponse>({
        store,
        request: () =>
          productService.list({
            offset: store.pageOffset(),
            limit: store.pageSize(),
          }),
        isSuccess: (res) => res.status === true,
        getErrorMessage: (res) => res.message ?? 'Failed to load products',
        onSuccess: (res) => {
          store.syncAll(res.items);
          store.setPageResult({ total: res.total });
          store.setFulfilled();
        },
        onError: () => {
          store.setError('Product load failed');
        },
      }),
    };
  }),
);

// ---------------------------------------------------------------------------
// Usage in a component (sketch)
// ---------------------------------------------------------------------------
//
// @Component({
//   selector: 'app-product-list',
//   standalone: true,
//   template: `
//     <input (input)="store.setSearchQuery($any($event.target).value)" placeholder="Search..." />
//
//     @if (store.isPending()) {
//       <loading-spinner />
//     }
//
//     @if (store.error(); as error) {
//       <error-banner [message]="error" />
//     }
//
//     <p>{{ store.totalInStock() }} in stock / {{ store.outOfStockCount() }} out of stock</p>
//
//     @for (product of store.filteredEntities(); track product.id) {
//       <product-card [product]="product" />
//     } @empty {
//       <p>No products match "{{ store.searchQuery() }}"</p>
//     }
//
//     <button [disabled]="!store.hasPreviousPage()" (click)="store.previousPage(); store.load()">Prev</button>
//     <span>{{ store.currentPage() }} / {{ store.totalPages() }}</span>
//     <button [disabled]="!store.hasNextPage()" (click)="store.nextPage(); store.load()">Next</button>
//   `,
// })
// export class ProductListComponent {
//   protected store = inject(ProductStore);
//
//   constructor() {
//     // Load first page on init
//     this.store.load();
//   }
// }
