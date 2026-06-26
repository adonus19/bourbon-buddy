import { BourbonCategory, WishlistEntry, WishlistPriority } from '../../models';
import { CATEGORY_DISPLAY } from '../../shared/constants/category-display';
import { PRIORITY_DISPLAY } from '../../shared/constants/wishlist-display';

/** Hunt List filter (price range matches against MSRP). AND semantics. */
export interface WishlistFilter {
  priorities: WishlistPriority[];
  categories: BourbonCategory[];
  priceMin: number | null;
  priceMax: number | null;
}

export const EMPTY_WISHLIST_FILTER: WishlistFilter = {
  priorities: [],
  categories: [],
  priceMin: null,
  priceMax: null,
};

export function isWishlistFilterActive(f: WishlistFilter): boolean {
  return (
    f.priorities.length > 0 ||
    f.categories.length > 0 ||
    f.priceMin != null ||
    f.priceMax != null
  );
}

export function matchesWishlistFilter(
  e: WishlistEntry,
  f: WishlistFilter
): boolean {
  if (f.priorities.length && !f.priorities.includes(e.priority)) {
    return false;
  }
  if (
    f.categories.length &&
    (e.category == null || !f.categories.includes(e.category))
  ) {
    return false;
  }
  if (f.priceMin != null && (e.msrp == null || e.msrp < f.priceMin)) {
    return false;
  }
  if (f.priceMax != null && (e.msrp == null || e.msrp > f.priceMax)) {
    return false;
  }
  return true;
}

export function wishlistChips(
  f: WishlistFilter
): { label: string; next: WishlistFilter }[] {
  const chips: { label: string; next: WishlistFilter }[] = [];
  for (const p of f.priorities) {
    chips.push({
      label: PRIORITY_DISPLAY[p]?.label ?? p,
      next: { ...f, priorities: f.priorities.filter((x) => x !== p) },
    });
  }
  for (const c of f.categories) {
    chips.push({
      label: CATEGORY_DISPLAY[c]?.label ?? c,
      next: { ...f, categories: f.categories.filter((x) => x !== c) },
    });
  }
  if (f.priceMin != null || f.priceMax != null) {
    const lo = f.priceMin ?? 0;
    const hi = f.priceMax != null ? f.priceMax : '∞';
    chips.push({
      label: `MSRP $${lo}–${hi}`,
      next: { ...f, priceMin: null, priceMax: null },
    });
  }
  return chips;
}
