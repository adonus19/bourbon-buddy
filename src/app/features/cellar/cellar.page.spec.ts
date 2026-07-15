import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';

jest.mock('@ionic/angular', () => ({
  ActionSheetController: class {},
  ModalController: class {},
  ToastController: class {},
}));

import {
  ActionSheetController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { CellarPage } from './cellar.page';
import { LogEntry } from '../../models';
import { LogEntryService } from '../../core/services/log-entry.service';
import { InboxService } from '../../core/services/inbox.service';

const at = (iso: string) =>
  ({ toMillis: () => new Date(iso).getTime() } as unknown as Timestamp);

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    id: Math.random().toString(36).slice(2),
    bourbonName: 'Weller 12',
    distillery: 'Buffalo Trace',
    category: 'bourbon',
    entryType: 'drink',
    entryDate: at('2026-01-15T12:00:00'),
    noseTags: [],
    palateTags: [],
    finishTags: [],
    ...over,
  } as LogEntry;
}

// One entry this month, one in a prior year → always ≥2 groups whenever the
// suite runs, without pinning "now".
const thisMonth = new Date();
const lastYear = new Date(thisMonth.getFullYear() - 1, 5, 1);
const recent = entry({ entryDate: at(thisMonth.toISOString()) });
const old = entry({ entryDate: at(lastYear.toISOString()) });

function configure(entries: LogEntry[] = [recent, old]): CellarPage {
  TestBed.configureTestingModule({
    declarations: [CellarPage],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      {
        provide: LogEntryService,
        useValue: { entries: signal(entries), loaded: signal(true) },
      },
      { provide: InboxService, useValue: { unreadCount: async () => 0 } },
      { provide: ActionSheetController, useValue: {} },
      { provide: ModalController, useValue: {} },
      { provide: ToastController, useValue: {} },
    ],
  });
  return TestBed.createComponent(CellarPage).componentInstance;
}

describe('CellarPage — time-period sections', () => {
  it('shows the flat list (no sections) on the Shelf', () => {
    const c = configure();
    expect(c.view()).toBe('shelf');
    expect(c.sections()).toBeNull();
  });

  it('groups the Journal by period with only the newest group open', () => {
    const c = configure();
    c.setView('journal');

    const sections = c.sections()!;
    expect(sections.length).toBe(2);
    expect(sections[0].open).toBe(true);
    expect(sections[0].entries).toEqual([recent]);
    expect(sections[1].open).toBe(false);
  });

  it('falls back to the flat list under a non-date sort or active search', () => {
    const c = configure();
    c.setView('journal');

    c.sort.set('name');
    expect(c.sections()).toBeNull();

    c.sort.set('date');
    c.onSearchInput('weller');
    expect(c.sections()).toBeNull();
  });

  it('toggles a group and remembers the override', () => {
    const c = configure();
    c.setView('journal');

    const [newest, older] = c.sections()!;
    c.toggleGroup(older.key, older.open);
    c.toggleGroup(newest.key, newest.open);

    const after = c.sections()!;
    expect(after[0].open).toBe(false);
    expect(after[1].open).toBe(true);
  });

  it('resets overrides when the segment changes', () => {
    const c = configure();
    c.setView('journal');

    const [newest] = c.sections()!;
    c.toggleGroup(newest.key, newest.open);
    expect(c.sections()![0].open).toBe(false);

    c.setView('graveyard');
    c.setView('journal');
    expect(c.sections()![0].open).toBe(true);
  });
});
