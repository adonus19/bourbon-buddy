import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

jest.mock('@ionic/angular', () => ({
  ToastController: class {},
  ModalController: class {},
}));
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: { fromDate: jest.fn(), now: jest.fn() },
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  getDoc: jest.fn(),
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
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));
jest.mock('@angular/fire/auth', () => ({ Auth: class {} }));

import { ModalController, ToastController } from '@ionic/angular';

import { MentionedBottle } from '../../../models';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { TasteMatchService } from '../../../core/services/taste-match.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { BottlePreviewSheetComponent } from './bottle-preview-sheet.component';

const chip = (over: Partial<MentionedBottle> = {}): MentionedBottle => ({
  name: 'Weller 12 Year',
  bourbonId: 'b1',
  distillery: 'Buffalo Trace',
  category: 'bourbon',
  ...over,
});

describe('BottlePreviewSheetComponent (BB-198)', () => {
  let fixture: ComponentFixture<BottlePreviewSheetComponent>;
  let component: BottlePreviewSheetComponent;
  let catalog: { getById: jest.Mock; findOrCreate: jest.Mock };
  let wishlist: { entries: ReturnType<typeof signal>; add: jest.Mock };
  let modal: { dismiss: jest.Mock };

  beforeEach(() => {
    catalog = {
      getById: jest.fn().mockResolvedValue(null),
      findOrCreate: jest.fn().mockResolvedValue('created-id'),
    };
    wishlist = { entries: signal([] as unknown[]), add: jest.fn() };
    modal = { dismiss: jest.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      declarations: [BottlePreviewSheetComponent],
      providers: [
        { provide: BourbonCatalogService, useValue: catalog },
        { provide: WishlistService, useValue: wishlist },
        {
          provide: TasteMatchService,
          useValue: { matches: () => ({ matched: false, tags: [] }) },
        },
        { provide: ModalController, useValue: modal },
        {
          provide: ToastController,
          useValue: {
            create: jest
              .fn()
              .mockResolvedValue({ present: jest.fn().mockResolvedValue(undefined) }),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(BottlePreviewSheetComponent);
    component = fixture.componentInstance;
  });

  it('loads the catalog doc (profile + neighbors) on enter', async () => {
    catalog.getById.mockResolvedValue({
      id: 'b1',
      flavorProfile: { nose: ['Vanilla'], palate: ['Cherry'], finish: ['Oak'] },
    });
    component.bottle = chip();
    component.ionViewWillEnter();
    await fixture.whenStable();
    expect(catalog.getById).toHaveBeenCalledWith('b1');
    expect(component.profile()?.palate).toEqual(['Cherry']);
    expect(component.loaded()).toBe(true);
  });

  // BB-228b: before this, the sheet rendered a blank gap while its catalog read
  // was in flight — the user's "is it broken?" complaint on the Radar tab.
  it('renders a skeleton while the catalog read is in flight', async () => {
    let release!: (v: unknown) => void;
    catalog.getById.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    component.bottle = chip();
    component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.loaded()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('.sheet__skeleton')
    ).toBeTruthy();

    release(null);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.loaded()).toBe(true);
    expect(fixture.nativeElement.querySelector('.sheet__skeleton')).toBeNull();
  });

  it('skips the skeleton entirely for a bottle with no catalog id', async () => {
    // Nothing to fetch, so a skeleton would flash for no reason.
    component.bottle = chip({ bourbonId: null });
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(catalog.getById).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.sheet__skeleton')).toBeNull();
  });

  it('adds via the existing catalog match without creating a duplicate', async () => {
    wishlist.add.mockResolvedValue('id');
    component.bottle = chip();
    await component.addToHuntList();
    expect(catalog.findOrCreate).not.toHaveBeenCalled();
    expect(wishlist.add).toHaveBeenCalledWith(
      expect.objectContaining({ bourbonId: 'b1', discoverySource: 'Dispatch' })
    );
    expect(modal.dismiss).toHaveBeenCalledWith(null, 'added');
  });

  it('creates the catalog entry first when the chip has no match', async () => {
    wishlist.add.mockResolvedValue('id');
    component.bottle = chip({ bourbonId: null });
    await component.addToHuntList();
    expect(catalog.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Weller 12 Year' })
    );
    expect(wishlist.add).toHaveBeenCalledWith(
      expect.objectContaining({ bourbonId: 'created-id' })
    );
  });

  it('shows hunt-list state instead of adding twice', async () => {
    wishlist.entries.set([{ bourbonId: 'b1', status: 'actively_looking' }]);
    component.bottle = chip();
    expect(component.onHuntList()).toBe(true);
    await component.addToHuntList();
    expect(wishlist.add).not.toHaveBeenCalled();
  });
});
