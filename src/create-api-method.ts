import { patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { pipe, switchMap, tap, type Observable, type OperatorFunction } from 'rxjs';

/**
 * Configuration for `createApiMethod`.
 *
 * @typeParam TInput    The trigger value piped into `rxMethod`.
 * @typeParam TResponse The raw Observable response type.
 */
export interface ApiMethodConfig<TInput, TResponse> {
  /**
   * The signal store instance. Passed explicitly so `createApiMethod`
   * can call `patchState` on it.
   */
  store: any;

  /**
   * Creates the Observable from the trigger value.
   *
   * ```ts
   * request: (params) => http.get('/items', { params })
   * ```
   */
  request: (input: TInput) => Observable<TResponse>;

  /**
   * Called on a successful response. Return a partial-state object to
   * auto-patch, or call `patchState` yourself and return `void`/`undefined`.
   */
  onSuccess: (response: TResponse, input: TInput) => Record<string, any> | void;

  /** Optional error callback. Return partial-state to auto-patch. */
  onError?: (error: any, input: TInput) => Record<string, any> | void;

  /**
   * Optional application-level success check. Many gRPC / REST wrappers
   * return `{ status: boolean, message: string }` — this lets you treat
   * a "200 but failed" response as an error.
   *
   * ```ts
   * isSuccess: (res) => res.status === true
   * ```
   */
  isSuccess?: (response: TResponse) => boolean;

  /**
   * Extract the human-readable error message from a response that failed
   * `isSuccess`. Used only when `isSuccess` is provided.
   */
  getErrorMessage?: (response: TResponse) => string;

  /** State key for the loading boolean.  @default `'isLoading'` */
  loadingKey?: string;
  /** State key for the error flag.       @default `'isError'` */
  errorKey?: string;
  /** State key for the error message.    @default `'errorMessage'` */
  messageKey?: string;

  /**
   * RxJS higher-order mapping operator.
   * @default `switchMap`  (latest-wins — safe for reads)
   *
   * Pass `concatMap` for writes, `exhaustMap` for debounced triggers, etc.
   */
  operator?: <T, R>(
    project: (value: T) => Observable<R>,
  ) => OperatorFunction<T, R>;
}

/**
 * Factory that creates an `rxMethod` wired with loading-state management,
 * response-status checking, and `tapResponse` error handling — the three
 * things every NgRx Signal Store API call repeats.
 *
 * @returns An `rxMethod<TInput>` that can be assigned directly in `withMethods`.
 *
 * @example
 * ```ts
 * const TodoStore = signalStore(
 *   { providedIn: 'root' },
 *   withState({ todos: [] as Todo[], isLoading: false, isError: false, errorMessage: '' }),
 *   withMethods((store) => ({
 *     load: createApiMethod({
 *       store,
 *       request: () => inject(TodoService).getAll(),
 *       isSuccess: (res) => !!res.status,
 *       getErrorMessage: (res) => res.message ?? 'Load failed',
 *       onSuccess: (res) => ({ todos: res.data.toObject().items }),
 *     }),
 *
 *     create: createApiMethod({
 *       store,
 *       request: (todo: CreateTodoInput) => inject(TodoService).create(todo),
 *       operator: concatMap,                    // writes should queue
 *       loadingKey: 'isCreating',               // per-operation loading
 *       onSuccess: (res) => { ... },
 *     }),
 *   })),
 * );
 * ```
 */
export function createApiMethod<TInput, TResponse>(
  config: ApiMethodConfig<TInput, TResponse>,
) {
  const {
    store,
    request,
    onSuccess,
    onError,
    isSuccess,
    getErrorMessage,
    loadingKey = 'isLoading',
    errorKey = 'isError',
    messageKey = 'errorMessage',
    operator = switchMap,
  } = config;

  return rxMethod<TInput>(
    pipe(
      tap(() =>
        patchState(store, {
          [loadingKey]: true,
          [errorKey]: false,
          [messageKey]: '',
        } as any),
      ),
      operator((input: TInput) =>
        request(input).pipe(
          tapResponse({
            next: (response) => {
              if (isSuccess && !isSuccess(response)) {
                const msg =
                  getErrorMessage?.(response) ?? 'Request failed';
                const extra = onError?.(response, input);
                patchState(store, {
                  [loadingKey]: false,
                  [errorKey]: true,
                  [messageKey]: msg,
                  ...(extra ?? {}),
                } as any);
                return;
              }

              const result = onSuccess(response, input);
              patchState(store, {
                [loadingKey]: false,
                ...(result ?? {}),
              } as any);
            },
            error: (err: any) => {
              const msg =
                err?.statusMessage ?? err?.message ?? 'Unknown error';
              const extra = onError?.(err, input);
              patchState(store, {
                [loadingKey]: false,
                [errorKey]: true,
                [messageKey]: msg,
                ...(extra ?? {}),
              } as any);
            },
          }),
        ),
      ),
    ),
  );
}
