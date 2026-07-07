import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

jest.mock('@ionic/angular', () => ({ ToastController: class {} }));
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  arrayUnion: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  startAt: jest.fn(),
  endAt: jest.fn(),
  serverTimestamp: jest.fn(),
  Timestamp: { fromDate: jest.fn(), now: jest.fn() },
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));
jest.mock('@angular/fire/auth', () => ({ Auth: class {} }));
jest.mock('@angular/fire/storage', () => ({ Storage: class {} }));

import { ToastController } from '@ionic/angular';
import { AddEditEntryPage } from './add-edit-entry.page';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { StorageService } from '../../../core/services/storage.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { AuthService } from '../../../core/auth/auth.service';

function configure(opts: {
  editId?: string | null;
  catalog: { getFlavorSuggestions: jest.Mock };
}) {
  const route = {
    snapshot: {
      paramMap: { get: () => opts.editId ?? null },
      parent: null,
      queryParamMap: { get: () => null },
    },
  };
  TestBed.configureTestingModule({
    imports: [ReactiveFormsModule],
    declarations: [AddEditEntryPage],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      { provide: LogEntryService, useValue: { selectById: () => signal(null) } },
      { provide: BourbonCatalogService, useValue: opts.catalog },
      { provide: BarcodeScannerService, useValue: {} },
      { provide: StorageService, useValue: {} },
      { provide: WishlistService, useValue: { selectById: () => signal(null) } },
      { provide: AuthService, useValue: { snapshotUser: { uid: 'u1' } } },
      { provide: ActivatedRoute, useValue: route },
      { provide: Router, useValue: {} },
      {
        provide: ToastController,
        useValue: { create: async () => ({ present: async () => undefined }) },
      },
    ],
  });
  return TestBed.createComponent(AddEditEntryPage).componentInstance;
}

// Reach the private auto-populate method + form under test.
interface Testable {
  autoPopulateFlavors(id: string): Promise<void>;
  suggestedFlavors(): { nose: string[]; palate: string[]; finish: string[] };
  form: {
    controls: Record<string, { value: unknown; setValue: (v: unknown) => void }>;
  };
}
const testable = (c: AddEditEntryPage): Testable => c as unknown as Testable;

describe('AddEditEntryPage — flavor auto-populate (BB-186)', () => {
  afterEach(() => jest.clearAllMocks());

  it('pre-fills tags and marks them suggested when a bottle is picked', async () => {
    const catalog = {
      getFlavorSuggestions: jest.fn().mockResolvedValue({
        nose: ['Vanilla'],
        palate: ['Cherry'],
        finish: [],
      }),
    };
    const c = testable(configure({ catalog }));

    await c.autoPopulateFlavors('b1');

    expect(catalog.getFlavorSuggestions).toHaveBeenCalledWith('b1');
    expect(c.form.controls['noseTags'].value).toEqual(['Vanilla']);
    expect(c.form.controls['palateTags'].value).toEqual(['Cherry']);
    expect(c.suggestedFlavors()).toEqual({
      nose: ['Vanilla'],
      palate: ['Cherry'],
      finish: [],
    });
  });

  it('does not clobber tags the user has already entered', async () => {
    const catalog = { getFlavorSuggestions: jest.fn() };
    const c = testable(configure({ catalog }));
    c.form.controls['noseTags'].setValue(['Oak']); // user's own tag

    await c.autoPopulateFlavors('b1');

    expect(catalog.getFlavorSuggestions).not.toHaveBeenCalled();
    expect(c.form.controls['noseTags'].value).toEqual(['Oak']);
  });

  it('refreshes suggestions when a different bottle is picked (tags untouched)', async () => {
    const catalog = {
      getFlavorSuggestions: jest
        .fn()
        .mockResolvedValueOnce({ nose: ['Vanilla'], palate: [], finish: [] })
        .mockResolvedValueOnce({ nose: ['Smoke'], palate: [], finish: [] }),
    };
    const c = testable(configure({ catalog }));

    await c.autoPopulateFlavors('b1');
    expect(c.form.controls['noseTags'].value).toEqual(['Vanilla']);

    await c.autoPopulateFlavors('b2');
    expect(c.form.controls['noseTags'].value).toEqual(['Smoke']);
  });

  it('clears suggestions when the new bottle has no profile', async () => {
    const catalog = {
      getFlavorSuggestions: jest
        .fn()
        .mockResolvedValueOnce({ nose: ['Vanilla'], palate: [], finish: [] })
        .mockResolvedValueOnce(null),
    };
    const c = testable(configure({ catalog }));

    await c.autoPopulateFlavors('b1');
    await c.autoPopulateFlavors('b2');
    expect(c.form.controls['noseTags'].value).toEqual([]);
    expect(c.suggestedFlavors()).toEqual({ nose: [], palate: [], finish: [] });
  });

  it('does nothing in edit mode', async () => {
    const catalog = { getFlavorSuggestions: jest.fn() };
    const c = testable(configure({ editId: 'e1', catalog }));

    await c.autoPopulateFlavors('b1');
    expect(catalog.getFlavorSuggestions).not.toHaveBeenCalled();
  });
});
