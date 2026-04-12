// Request status tracking
export {
  withRequestStatus,
  isPending,
  isFulfilled,
  getError,
  type RequestStatus,
} from './with-request-status';

// Entity real-time sync
export {
  withEntitySync,
  type EntitySyncConfig,
} from './with-entity-sync';

// Pagination
export {
  withPagination,
  type PaginationState,
} from './with-pagination';

// API method factory
export {
  createApiMethod,
  type ApiMethodConfig,
} from './create-api-method';

// Search & filter pipeline
export {
  withSearchFilter,
  type SearchFilterConfig,
} from './with-search-filter';

// v0.2.0 ---------------------------------------------------------------

// Selected entity
export {
  withSelectedEntity,
  type SelectedEntityConfig,
} from './with-selected-entity';

// Per-operation status
export {
  withPerOperationStatus,
  type OperationState,
  type OperationLoadingState,
  type OperationErrorState,
  type OperationStatus,
} from './with-per-operation-status';

// Reset state
export { withResetState } from './with-reset-state';

// Optimistic updates
export {
  withOptimisticUpdate,
  type OptimisticOptions,
} from './with-optimistic-update';

// Testing utilities
export {
  mockSignalStore,
  type MockSignalStoreConfig,
} from './mock-signal-store';
