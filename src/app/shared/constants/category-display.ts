import { BourbonCategory, EntryType } from '../../models';

// Human-readable labels + the category accent CSS variable for each category.
// Accent values live in src/theme/variables.scss (--color-cat-*).
export const CATEGORY_DISPLAY: Record<
  BourbonCategory,
  { label: string; accentVar: string }
> = {
  bourbon: { label: 'Bourbon', accentVar: 'var(--color-cat-bourbon)' },
  rye: { label: 'Rye', accentVar: 'var(--color-cat-rye)' },
  wheat_whiskey: { label: 'Wheat Whiskey', accentVar: 'var(--color-cat-other)' },
  tennessee: { label: 'Tennessee', accentVar: 'var(--color-cat-tennessee)' },
  american_other: { label: 'Other American', accentVar: 'var(--color-cat-other)' },
  scotch: { label: 'Scotch', accentVar: 'var(--color-cat-scotch)' },
  irish: { label: 'Irish', accentVar: 'var(--color-cat-irish)' },
  japanese: { label: 'Japanese', accentVar: 'var(--color-cat-japanese)' },
  world_other: { label: 'World Other', accentVar: 'var(--color-cat-other)' },
};

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  drink: 'Drink',
  bottle_purchased: 'Bottle',
  gift_received: 'Gift',
  sample_split: 'Sample',
  virtual_tasting: 'Virtual',
};

