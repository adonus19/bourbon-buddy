import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LogEntry, WishlistEntry } from '../../models';
import { LogEntryService } from './log-entry.service';
import { WishlistService } from './wishlist.service';
import { ExportService } from './export.service';

const logEntry = (over: Partial<LogEntry> = {}): LogEntry =>
  ({ bourbonName: 'Weller 12', noseTags: [], palateTags: [], finishTags: [], ...over } as LogEntry);
const wishEntry = (over: Partial<WishlistEntry> = {}): WishlistEntry =>
  ({ bourbonName: 'Pappy 15', reviewLinks: [], ...over } as WishlistEntry);

describe('ExportService', () => {
  let logEntries: WritableSignal<LogEntry[]>;
  let wishEntries: WritableSignal<WishlistEntry[]>;
  let service: ExportService;

  beforeEach(() => {
    logEntries = signal<LogEntry[]>([]);
    wishEntries = signal<WishlistEntry[]>([]);
    TestBed.configureTestingModule({
      providers: [
        ExportService,
        { provide: LogEntryService, useValue: { entries: logEntries } },
        { provide: WishlistService, useValue: { entries: wishEntries } },
      ],
    });
    service = TestBed.inject(ExportService);
  });

  describe('hasData', () => {
    it('reflects the requested kind', () => {
      expect(service.hasData('both')).toBe(false);
      logEntries.set([logEntry()]);
      expect(service.hasData('log')).toBe(true);
      expect(service.hasData('wishlist')).toBe(false);
      expect(service.hasData('both')).toBe(true);
      wishEntries.set([wishEntry()]);
      expect(service.hasData('wishlist')).toBe(true);
    });
  });

  describe('export', () => {
    it('returns false and delivers nothing when empty', async () => {
      const deliver = jest
        .spyOn(service as unknown as { deliver: () => Promise<void> }, 'deliver')
        .mockResolvedValue(undefined);
      expect(await service.export('both')).toBe(false);
      expect(deliver).not.toHaveBeenCalled();
    });

    it('builds both CSV files with the right names and content', async () => {
      logEntries.set([logEntry({ bourbonName: 'Weller 12' })]);
      wishEntries.set([wishEntry({ bourbonName: 'Pappy 15' })]);
      let captured: { name: string; csv: string }[] = [];
      jest
        .spyOn(service as unknown as { deliver: (f: never[]) => Promise<void> }, 'deliver')
        .mockImplementation(async (files) => {
          captured = files as { name: string; csv: string }[];
        });

      expect(await service.export('both')).toBe(true);
      expect(captured).toHaveLength(2);
      expect(captured[0].name).toContain('cellar');
      expect(captured[0].csv).toContain('Weller 12');
      expect(captured[1].name).toContain('hunt-list');
      expect(captured[1].csv).toContain('Pappy 15');
    });

    it('exports only the log for kind "log"', async () => {
      logEntries.set([logEntry()]);
      wishEntries.set([wishEntry()]);
      let captured: { name: string }[] = [];
      jest
        .spyOn(service as unknown as { deliver: (f: never[]) => Promise<void> }, 'deliver')
        .mockImplementation(async (files) => {
          captured = files as { name: string }[];
        });
      await service.export('log');
      expect(captured).toHaveLength(1);
      expect(captured[0].name).toContain('cellar');
    });
  });

  describe('deliver', () => {
    const files = [{ name: 'x.csv', csv: 'a,b' }];
    let anySvc: { deliver: (f: unknown) => Promise<void> };

    beforeEach(() => {
      anySvc = service as unknown as { deliver: (f: unknown) => Promise<void> };
      (global.URL as unknown as { createObjectURL: unknown }).createObjectURL =
        jest.fn(() => 'blob:x');
      (global.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL =
        jest.fn();
    });

    it('falls back to a download when Web Share is unavailable', async () => {
      (navigator as unknown as { canShare?: unknown }).canShare = undefined;
      const click = jest
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      await anySvc.deliver(files);
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(click).toHaveBeenCalled();
    });

    it('uses the share sheet when available', async () => {
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: () => true,
      });
      const share = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: share,
      });
      await anySvc.deliver(files);
      expect(share).toHaveBeenCalled();
      expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    });
  });
});
