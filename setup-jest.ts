// Zone-based Angular test environment for Jest (this app uses zone.js).
// jest-preset-angular v17 exports a setup function that must be invoked.
import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();

// jest 30's jsdom environment doesn't define the Fetch API globals, which
// @angular/fire references when its modules are evaluated on import. Unit tests
// mock all Firestore/Auth access and never actually perform a fetch, so
// lightweight stubs are enough to satisfy those module-eval references.
const g = globalThis as Record<string, unknown>;
g['fetch'] ??= () =>
  Promise.reject(new Error('fetch is stubbed in unit tests'));
g['Headers'] ??= class Headers {};
g['Request'] ??= class Request {};
g['Response'] ??= class Response {};
