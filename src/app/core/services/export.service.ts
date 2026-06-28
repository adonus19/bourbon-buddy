import { Injectable, inject } from '@angular/core';

import { LogEntry, WishlistEntry } from '../../models';
import { LogEntryService } from './log-entry.service';
import { WishlistService } from './wishlist.service';
import { csvDate, toCsv } from '../../shared/utils/csv';

export type ExportKind = 'log' | 'wishlist' | 'both';

interface CsvFile {
  name: string;
  csv: string;
}

/**
 * Generates CSV exports of the user's log and wishlist from the already-cached
 * state-holder signals (no Firestore reads) and hands them off to the device
 * share sheet, falling back to a download when Web Share with files is absent.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly log = inject(LogEntryService);
  private readonly wishlist = inject(WishlistService);

  /** True when there's something to export for the requested kind. */
  hasData(kind: ExportKind): boolean {
    const hasLog = this.log.entries().length > 0;
    const hasWishlist = this.wishlist.entries().length > 0;
    if (kind === 'log') return hasLog;
    if (kind === 'wishlist') return hasWishlist;
    return hasLog || hasWishlist;
  }

  /** Builds the file(s) and shares/downloads them. Returns false if empty. */
  async export(kind: ExportKind): Promise<boolean> {
    const files: CsvFile[] = [];
    const stamp = new Date().toISOString().slice(0, 10);

    if (kind !== 'wishlist' && this.log.entries().length) {
      files.push({
        name: `bourbon-buddy-cellar-${stamp}.csv`,
        csv: this.logCsv(this.log.entries()),
      });
    }
    if (kind !== 'log' && this.wishlist.entries().length) {
      files.push({
        name: `bourbon-buddy-hunt-list-${stamp}.csv`,
        csv: this.wishlistCsv(this.wishlist.entries()),
      });
    }

    if (!files.length) {
      return false;
    }
    await this.deliver(files);
    return true;
  }

  private logCsv(entries: LogEntry[]): string {
    const headers = [
      'Name', 'Distillery', 'Bottler', 'Category', 'Sub-type',
      'Age (yrs)', 'NAS', 'Proof',
      'Mash corn %', 'Mash rye %', 'Mash wheat %', 'Mash malt %',
      'Batch', 'Barrel', 'Series',
      'Entry type', 'Did not purchase', 'Purchase price', 'Location',
      'Purchase date', 'Bottle size (ml)', 'Remaining %',
      'Rating', 'Would buy again',
      'Nose notes', 'Nose tags', 'Palate notes', 'Palate tags',
      'Finish notes', 'Finish tags', 'Finish length',
      'Personal notes', 'Value score', 'Logged date',
    ];
    const rows = entries.map((e) => [
      e.bourbonName, e.distillery, e.bottler, e.category, e.subType,
      e.ageStatement, e.isNas ? 'Yes' : 'No', e.proof,
      e.mashBillCorn, e.mashBillRye, e.mashBillWheat, e.mashBillMalt,
      e.batchNumber, e.barrelNumber, e.series,
      e.entryType, e.didNotPurchase ? 'Yes' : 'No', e.purchasePrice,
      e.purchaseLocation, csvDate(e.purchaseDate), e.bottleSizeMl,
      e.bottleRemainingPct, e.rating, e.wouldBuyAgain,
      e.noseNotes, (e.noseTags ?? []).join('; '),
      e.palateNotes, (e.palateTags ?? []).join('; '),
      e.finishNotes, (e.finishTags ?? []).join('; '), e.finishLength,
      e.personalNotes, e.valueScore, csvDate(e.entryDate),
    ]);
    return toCsv(headers, rows);
  }

  private wishlistCsv(entries: WishlistEntry[]): string {
    const headers = [
      'Name', 'Distillery', 'Category', 'Sub-type', 'MSRP',
      'Priority', 'Status', 'Best sighting price',
      'External tasting notes', 'Personal notes',
      'Discovery source', 'Discovery URL', 'Review links', 'Added date',
    ];
    const rows = entries.map((e) => [
      e.bourbonName, e.distillery, e.category, e.subType, e.msrp,
      e.priority, e.status, e.bestSightingPrice,
      e.externalTastingNotes, e.personalNotes,
      e.discoverySource, e.discoveryUrl,
      (e.reviewLinks ?? []).map((l) => l.url).join('; '),
      csvDate(e.createdAt),
    ]);
    return toCsv(headers, rows);
  }

  private async deliver(files: CsvFile[]): Promise<void> {
    const fileObjs = files.map(
      (f) => new File([f.csv], f.name, { type: 'text/csv' })
    );

    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };
    if (nav.canShare?.({ files: fileObjs })) {
      try {
        await nav.share({ files: fileObjs, title: 'Bourbon Buddy export' });
        return;
      } catch (err) {
        // User cancelled the share sheet — don't fall through to a download.
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
      }
    }
    files.forEach((f) => this.download(f));
  }

  private download(file: CsvFile): void {
    const blob = new Blob([file.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}
