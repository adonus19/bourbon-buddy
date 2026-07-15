import { EntryType } from '../../../models';
import { deriveDidNotPurchase, fieldRulesFor } from './entry-field-rules';

describe('fieldRulesFor', () => {
  it('shows the full purchase set for a purchased bottle', () => {
    expect(fieldRulesFor('bottle_purchased')).toEqual({
      price: true,
      bottleSize: true,
      where: true,
      dateLabel: 'Purchase date',
      remaining: true,
    });
  });

  it('treats a gift as an owned bottle without a price', () => {
    expect(fieldRulesFor('gift_received')).toEqual({
      price: false,
      bottleSize: true,
      where: true,
      dateLabel: 'Date received',
      remaining: true,
    });
  });

  it('hides the date field entirely for a drink (entryDate carries it)', () => {
    expect(fieldRulesFor('drink')).toEqual({
      price: false,
      bottleSize: false,
      where: true,
      dateLabel: null,
      remaining: false,
    });
  });

  it('keeps price for a sample/split (splits cost money)', () => {
    expect(fieldRulesFor('sample_split')).toEqual({
      price: true,
      bottleSize: false,
      where: true,
      dateLabel: 'Date',
      remaining: false,
    });
  });

  it('shows only where + date for a virtual tasting', () => {
    expect(fieldRulesFor('virtual_tasting')).toEqual({
      price: false,
      bottleSize: false,
      where: true,
      dateLabel: 'Date',
      remaining: false,
    });
  });
});

describe('deriveDidNotPurchase', () => {
  it('is false only for a purchased bottle', () => {
    const nonPurchase: EntryType[] = [
      'drink',
      'gift_received',
      'sample_split',
      'virtual_tasting',
    ];
    expect(deriveDidNotPurchase('bottle_purchased')).toBe(false);
    for (const t of nonPurchase) {
      expect(deriveDidNotPurchase(t)).toBe(true);
    }
  });
});
