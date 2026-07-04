// Zone-based Angular test environment for Jest (this app uses zone.js).
// jest-preset-angular v17 exports a setup function that must be invoked.
import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();
