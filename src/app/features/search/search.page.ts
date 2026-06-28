import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { LogEntryService } from '../../core/services/log-entry.service';
import { WishlistService } from '../../core/services/wishlist.service';
import { LogEntry, WishlistEntry } from '../../models';

/**
 * Global search across the Cellar (log) and Hunt List (wishlist). Filters the
 * already-cached state-holder signals client-side — no Firestore reads. The
 * search bar debounces input; results show once the query is 2+ characters.
 */
@Component({
  selector: 'app-search',
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  standalone: false,
})
export class SearchPage {
  private readonly log = inject(LogEntryService);
  private readonly wishlist = inject(WishlistService);
  private readonly router = inject(Router);

  readonly query = signal('');

  private readonly term = computed(() => this.query().trim().toLowerCase());
  readonly active = computed(() => this.term().length >= 2);

  readonly logResults = computed<LogEntry[]>(() =>
    this.active()
      ? this.log.entries().filter((e) => this.matches(e.bourbonName, e.distillery))
      : []
  );

  readonly wishlistResults = computed<WishlistEntry[]>(() =>
    this.active()
      ? this.wishlist
          .entries()
          .filter((e) => this.matches(e.bourbonName, e.distillery))
      : []
  );

  readonly hasResults = computed(
    () => this.logResults().length > 0 || this.wishlistResults().length > 0
  );

  onSearch(event: Event): void {
    this.query.set((event as CustomEvent<{ value?: string }>).detail?.value ?? '');
  }

  ratingLabel(e: LogEntry): string | null {
    return e.rating ? `${e.rating}★` : null;
  }

  priceLabel(e: WishlistEntry): string | null {
    const price = e.bestSightingPrice ?? e.msrp ?? null;
    if (price == null) {
      return null;
    }
    const prefix = e.bestSightingPrice != null ? 'Best' : 'MSRP';
    return `${prefix} $${price}`;
  }

  openLog(id: string | undefined): void {
    if (id) {
      void this.router.navigateByUrl(`/entry/${id}`);
    }
  }

  openWishlist(id: string | undefined): void {
    if (id) {
      void this.router.navigateByUrl(`/wishlist/${id}`);
    }
  }

  private matches(name: string, distillery?: string | null): boolean {
    const t = this.term();
    return (
      name.toLowerCase().includes(t) ||
      (distillery?.toLowerCase().includes(t) ?? false)
    );
  }
}
