import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: class {},
}));

import { AppNotification } from '../../models';
import { InboxService } from '../../core/services/inbox.service';
import { InboxPage } from './inbox.page';

const note = (id: string, read = false): AppNotification =>
  ({
    id,
    type: 'friendRequest',
    title: 'T',
    body: 'B',
    link: '/friends',
    read,
    createdAt: { toDate: () => new Date() },
  }) as unknown as AppNotification;

describe('InboxPage — edit mode & swipe-to-delete (BB-214)', () => {
  let page: InboxPage;
  let inbox: {
    inbox$: jest.Mock;
    markRead: jest.Mock;
    markAllRead: jest.Mock;
    remove: jest.Mock;
  };
  let navigateByUrl: jest.Mock;

  function create(items: AppNotification[]): void {
    inbox = {
      inbox$: jest.fn(() => of(items)),
      markRead: jest.fn().mockResolvedValue(undefined),
      markAllRead: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    navigateByUrl = jest.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      declarations: [InboxPage],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: InboxService, useValue: inbox },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    page = TestBed.createComponent(InboxPage).componentInstance;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.clearAllMocks();
  });

  it('toggles selection per item', () => {
    create([note('a'), note('b')]);
    page.enterEdit();
    page.toggleSelect('a');
    expect(page.selected().has('a')).toBe(true);
    page.toggleSelect('a');
    expect(page.selected().size).toBe(0);
  });

  it('select all selects every item, then clears', () => {
    create([note('a'), note('b'), note('c')]);
    page.enterEdit();
    page.toggleSelectAll();
    expect(page.selected().size).toBe(3);
    expect(page.allSelected()).toBe(true);
    page.toggleSelectAll();
    expect(page.selected().size).toBe(0);
  });

  it('exiting edit mode clears the selection', () => {
    create([note('a')]);
    page.enterEdit();
    page.toggleSelect('a');
    page.exitEdit();
    expect(page.editMode()).toBe(false);
    expect(page.selected().size).toBe(0);
  });

  it('in edit mode a tap toggles selection instead of opening', async () => {
    create([note('a')]);
    page.enterEdit();
    await page.open(note('a'));
    expect(page.selected().has('a')).toBe(true);
    expect(inbox.markRead).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('outside edit mode a tap still marks read and navigates', async () => {
    create([note('a')]);
    await page.open(note('a'));
    expect(inbox.markRead).toHaveBeenCalledWith('a');
    expect(navigateByUrl).toHaveBeenCalledWith('/friends');
  });

  it('deletes the selection without confirmation and keeps edit mode for a partial delete', async () => {
    create([note('a'), note('b')]);
    page.enterEdit();
    page.toggleSelect('a');
    await page.deleteSelected();
    expect(inbox.remove).toHaveBeenCalledWith(['a']);
    expect(page.selected().size).toBe(0);
    expect(page.editMode()).toBe(true); // still one item left to manage
  });

  it('deleting everything exits edit mode (empty state takes over)', async () => {
    create([note('a'), note('b')]);
    page.enterEdit();
    page.toggleSelectAll();
    await page.deleteSelected();
    expect(inbox.remove).toHaveBeenCalledWith(
      expect.arrayContaining(['a', 'b'])
    );
    expect(page.editMode()).toBe(false);
  });

  it('does nothing with an empty selection', async () => {
    create([note('a')]);
    page.enterEdit();
    await page.deleteSelected();
    expect(inbox.remove).not.toHaveBeenCalled();
  });

  it('swipe delete removes the single row', async () => {
    create([note('a')]);
    await page.deleteOne(note('a'));
    expect(inbox.remove).toHaveBeenCalledWith(['a']);
  });
});
