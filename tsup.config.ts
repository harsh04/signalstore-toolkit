import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    '@angular/core',
    '@ngrx/signals',
    '@ngrx/signals/entities',
    '@ngrx/signals/rxjs-interop',
    '@ngrx/operators',
    'rxjs',
    'rxjs/operators',
  ],
});
