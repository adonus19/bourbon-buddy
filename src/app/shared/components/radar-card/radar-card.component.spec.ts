import { NO_ERRORS_SCHEMA, WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: { fromMillis: jest.fn(), now: jest.fn() },
  collection: jest.fn(),
  collectionData: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  arrayUnion: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  serverTimestamp: jest.fn(),
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));
jest.mock('@angular/fire/auth', () => ({ Auth: class {} }));
jest.mock('@ionic/angular', () => ({
  ModalController: class {},
  ToastController: class {},
}));

import { ModalController, ToastController } from '@ionic/angular';

import { MentionedBottle, WishlistEntry } from '../../../models';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { TasteMatchService } from '../../../core/services/taste-match.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { RadarBottle } from '../../utils/release-radar';
import { BottlePreviewSheetComponent } from '../bottle-preview-sheet/bottle-preview-sheet.component';
import { RadarCardComponent } from './radar-card.component';

function radarBottle(bottle: Partial<MentionedBottle> = {}): RadarBottle {
  const ms = Date.now();
  const when = { toDate: () => new Date(ms) };
  return {
    key: bottle.bourbonId ?? 'w12',
    bottle: {
      name: 'Weller 12',
      bourbonId: 'w12',
      distillery: 'Buffalo Trace',
      category: 'bourbon',
      flavor: null,
      ...bottle,
    },
    firstSeen: ms,
    latest: ms,
    articleCount: 2,
    articles: [
      {
        id: 'a1',
        sourceName: 'Breaking Bourbon',
        headline: 'h',
        url: 'https://x/a1',
        fetchedAt: when as never,
        publishedAt: when as never,
        categories: [],
        keywords: [],
      },
    ],
  };
}

describe('RadarCardComponent (BB-208)', () => {
  let wishlist: { entries: WritableSignal<WishlistEntry[]>; add: jest.Mock };
  let log: { entries: WritableSignal<{ bourbonId: string }[]> };
  let catalog: { findOrCreate: jest.Mock };
  let taste: { matches: jest.Mock };
  let modalCtrl: { create: jest.Mock };
  let present: jest.Mock;

  function make(bottle: Partial<MentionedBottle> = {}): RadarCardComponent {
    const fixture = TestBed.createComponent(RadarCardComponent);
    fixture.componentRef.setInput('radar', radarBottle(bottle));
    return fixture.componentInstance;
  }

  beforeEach(() => {
    wishlist = { entries: signal<WishlistEntry[]>([]), add: jest.fn().mockResolvedValue('id') };
    log = { entries: signal<{ bourbonId: string }[]>([]) };
    catalog = { findOrCreate: jest.fn().mockResolvedValue('newid') };
    taste = { matches: jest.fn().mockReturnValue({ matched: false, tags: [] }) };
    present = jest.fn().mockResolvedValue(undefined);
    // onDidDismiss mirrors the real HTMLIonModalElement: BB-228a closes the
    // perf trace on dismiss, so the stub has to resolve like the real one.
    modalCtrl = {
      create: jest.fn().mockResolvedValue({
        present,
        onDidDismiss: jest.fn().mockResolvedValue({}),
      }),
    };

    TestBed.configureTestingModule({
      declarations: [RadarCardComponent],
      providers: [
        { provide: WishlistService, useValue: wishlist },
        { provide: LogEntryService, useValue: log },
        { provide: BourbonCatalogService, useValue: catalog },
        { provide: TasteMatchService, useValue: taste },
        { provide: ModalController, useValue: modalCtrl },
        {
          provide: ToastController,
          useValue: { create: jest.fn().mockResolvedValue({ present: jest.fn() }) },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  it('reflects the taste-match badge from the taste service', () => {
    taste.matches.mockReturnValue({ matched: true, tags: ['Vanilla'] });
    expect(make().isTasteMatch()).toBe(true);
    taste.matches.mockReturnValue({ matched: false, tags: [] });
    expect(make().isTasteMatch()).toBe(false);
  });

  it('annotates "On your Hunt List" from active wishlist entries', () => {
    wishlist.entries.set([
      { bourbonId: 'w12', status: 'actively_looking' } as WishlistEntry,
    ]);
    const c = make();
    expect(c.onHuntList()).toBe(true);
    expect(c.inCellar()).toBe(false);
  });

  it('ignores archived (logged) wishlist entries for the hunt-list annotation', () => {
    wishlist.entries.set([{ bourbonId: 'w12', status: 'logged' } as WishlistEntry]);
    expect(make().onHuntList()).toBe(false);
  });

  it('annotates "In your Cellar" from log entries', () => {
    log.entries.set([{ bourbonId: 'w12' }]);
    expect(make().inCellar()).toBe(true);
  });

  it('adds to the hunt list with the Release Radar discovery source', async () => {
    await make().addToHuntList();
    expect(catalog.findOrCreate).not.toHaveBeenCalled(); // already has a bourbonId
    expect(wishlist.add).toHaveBeenCalledWith(
      expect.objectContaining({
        bourbonId: 'w12',
        bourbonName: 'Weller 12',
        status: 'actively_looking',
        discoverySource: 'Release Radar',
      })
    );
  });

  it('creates the catalog entry first when the bottle has no bourbonId', async () => {
    await make({ bourbonId: null }).addToHuntList();
    expect(catalog.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Weller 12', distillery: 'Buffalo Trace' })
    );
    expect(wishlist.add).toHaveBeenCalledWith(
      expect.objectContaining({ bourbonId: 'newid' })
    );
  });

  it('does not add when the bottle is already on the hunt list', async () => {
    wishlist.entries.set([
      { bourbonId: 'w12', status: 'actively_looking' } as WishlistEntry,
    ]);
    await make().addToHuntList();
    expect(wishlist.add).not.toHaveBeenCalled();
  });

  it('opens the preview sheet with the bottle on View', async () => {
    const c = make();
    await c.view();
    expect(modalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: BottlePreviewSheetComponent,
        componentProps: { bottle: expect.objectContaining({ name: 'Weller 12' }) },
      })
    );
    expect(present).toHaveBeenCalled();
  });
});
