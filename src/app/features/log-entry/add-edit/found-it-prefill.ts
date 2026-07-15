import {
  Bourbon,
  BourbonCategory,
  BourbonSubType,
  FinishLength,
  LogEntry,
  WishlistEntry,
} from '../../../models';
import { FlavorSuggestions } from '../../../core/services/bourbon-catalog.service';

/**
 * "Found It — Log It" prefill (BB-216): merge everything we already know about
 * a hunted bottle into the Add-to-Cellar form. Three layers, most personal
 * wins: the wishlist entry (identity), the catalog doc (spec), and the user's
 * own prior log entries for the same bottle (mash bill, last rating, tasting
 * tags/notes — data the catalog never has).
 *
 * Deliberately left blank: price, bottle size, where, batch/barrel — those
 * belong to the new bottle in hand.
 */
export interface FoundItPrefill {
  patch: {
    bourbonName: string;
    bourbonId: string;
    distillery: string;
    bottler: string;
    category?: BourbonCategory;
    subType: BourbonSubType | null;
    ageStatement: number | null;
    isNas: boolean;
    proof: number | null;
    mashBillCorn: number | null;
    mashBillRye: number | null;
    mashBillWheat: number | null;
    mashBillMalt: number | null;
    series: string;
    entryType: 'bottle_purchased';
    purchaseDate: string;
    bottleRemainingPct: number;
    rating: number | null;
    noseTags: string[];
    palateTags: string[];
    finishTags: string[];
    noseNotes: string;
    palateNotes: string;
    finishNotes: string;
    finishLength: FinishLength | null;
    personalNotes: string;
  };
  /**
   * Tags carried from a prior entry, to be marked "suggested" (same treatment
   * as Buy Again). Null when no prior entry has tags — the caller falls back
   * to the AI suggestions (BB-186).
   */
  priorTags: FlavorSuggestions | null;
}

export function foundItPrefill(
  w: WishlistEntry,
  catalog: Bourbon | null,
  allEntries: LogEntry[],
  todayIso: string
): FoundItPrefill {
  // The service exposes entries newest-first, so first-match = most recent.
  const priors = allEntries.filter((e) => e.bourbonId === w.bourbonId);
  const coalesce = <K extends keyof LogEntry>(
    key: K
  ): NonNullable<LogEntry[K]> | null => {
    for (const e of priors) {
      const v = e[key];
      if (v !== null && v !== undefined) {
        return v;
      }
    }
    return null;
  };

  const ageStatement =
    catalog?.ageStatement ?? (coalesce('ageStatement') as number | null);
  const isNas =
    ageStatement != null
      ? false
      : catalog
        ? catalog.isNas
        : ((coalesce('isNas') as boolean | null) ?? false);

  // Your own last verdict and tasting picture beat anything mined.
  const rating = priors.find((e) => e.rating != null)?.rating ?? null;
  const tasting = priors.find(
    (e) =>
      e.noseTags?.length ||
      e.palateTags?.length ||
      e.finishTags?.length ||
      e.noseNotes ||
      e.palateNotes ||
      e.finishNotes ||
      e.finishLength
  );
  const hasPriorTags = !!(
    tasting &&
    (tasting.noseTags?.length ||
      tasting.palateTags?.length ||
      tasting.finishTags?.length)
  );

  const category = w.category ?? catalog?.category ?? priors[0]?.category;

  return {
    patch: {
      bourbonName: w.bourbonName,
      bourbonId: w.bourbonId,
      distillery: w.distillery ?? catalog?.distillery ?? coalesce('distillery') ?? '',
      bottler: catalog?.bottler ?? coalesce('bottler') ?? '',
      ...(category ? { category } : {}),
      subType: w.subType ?? catalog?.subType ?? coalesce('subType'),
      ageStatement,
      isNas,
      proof: catalog?.proof ?? coalesce('proof'),
      mashBillCorn: coalesce('mashBillCorn'),
      mashBillRye: coalesce('mashBillRye'),
      mashBillWheat: coalesce('mashBillWheat'),
      mashBillMalt: coalesce('mashBillMalt'),
      series: catalog?.series ?? coalesce('series') ?? '',
      entryType: 'bottle_purchased',
      purchaseDate: todayIso,
      bottleRemainingPct: 100,
      rating,
      noseTags: tasting?.noseTags ?? [],
      palateTags: tasting?.palateTags ?? [],
      finishTags: tasting?.finishTags ?? [],
      noseNotes: tasting?.noseNotes ?? '',
      palateNotes: tasting?.palateNotes ?? '',
      finishNotes: tasting?.finishNotes ?? '',
      finishLength: tasting?.finishLength ?? null,
      personalNotes: w.externalTastingNotes ?? '',
    },
    priorTags: hasPriorTags
      ? {
          nose: tasting?.noseTags ?? [],
          palate: tasting?.palateTags ?? [],
          finish: tasting?.finishTags ?? [],
        }
      : null,
  };
}
