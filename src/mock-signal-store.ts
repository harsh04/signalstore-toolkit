import { signal, type WritableSignal } from '@angular/core';

/**
 * Detect the spy factory from the current test environment.
 * Returns a no-op function if no test runner is detected.
 */
function detectSpyFactory(): () => (...args: any[]) => any {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const g = globalThis as any;

  // Vitest
  if (typeof g.vi?.fn === 'function') {
    return () => g.vi.fn();
  }
  // Jest
  if (typeof g.jest?.fn === 'function') {
    return () => g.jest.fn();
  }
  // Fallback — return a plain no-op callable
  return () => (..._args: any[]) => undefined;
}

/**
 * Configuration for `mockSignalStore`.
 */
export interface MockSignalStoreConfig {
  /**
   * Custom spy factory. By default the library auto-detects
   * vitest (`vi.fn()`) or jest (`jest.fn()`).
   *
   * ```ts
   * mockSignalStore(TodoStore, overrides, { spyFn: () => vi.fn() })
   * ```
   */
  spyFn?: () => (...args: any[]) => any;
}

/**
 * Creates a lightweight mock of any NgRx Signal Store for unit testing.
 *
 * - Primitive overrides are wrapped in `signal()` (callable like real store signals)
 * - Array/object overrides are wrapped in `signal()` too
 * - Function overrides are left as-is (useful for pre-configured spies)
 * - Missing methods on the store become auto-detected spies (vitest/jest)
 *
 * **Returns a plain object** — no Angular DI needed. Inject it via
 * `TestBed.overrideProvider` or pass directly where the store is used.
 *
 * @example
 * ```ts
 * // In a vitest/jest test:
 * const mock = mockSignalStore(TodoStore, {
 *   entities: [{ id: '1', title: 'Test', done: false }],
 *   isPending: false,
 *   error: null,
 * });
 *
 * // Signals work like the real store:
 * mock.isPending();       // false
 * mock.entities();        // [{ id: '1', ... }]
 *
 * // Methods are spies:
 * mock.load();
 * expect(mock.load).toHaveBeenCalled();
 *
 * // Update signal values in tests:
 * (mock.isPending as WritableSignal<boolean>).set(true);
 * mock.isPending();       // true
 * ```
 *
 * @example With TestBed:
 * ```ts
 * TestBed.configureTestingModule({
 *   providers: [
 *     { provide: TodoStore, useValue: mockSignalStore(TodoStore, { ... }) },
 *   ],
 * });
 * ```
 */
export function mockSignalStore<
  T extends abstract new (...args: any[]) => any,
>(
  _StoreClass: T,
  overrides: Partial<Record<string, unknown>> = {},
  config?: MockSignalStoreConfig,
): InstanceType<T> {
  const createSpy = config?.spyFn ?? detectSpyFactory();
  const mock: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'function') {
      // Caller passed a function (pre-configured spy or custom impl)
      mock[key] = value;
    } else {
      // Wrap everything else in a writable signal
      mock[key] = signal(value);
    }
  }

  // Return a proxy that auto-creates spies for any accessed method
  // that wasn't provided in overrides.
  return new Proxy(mock, {
    get(target, prop: string) {
      if (prop in target) {
        return target[prop];
      }
      // Auto-create a spy for missing properties (likely methods)
      target[prop] = createSpy();
      return target[prop];
    },
  }) as InstanceType<T>;
}
