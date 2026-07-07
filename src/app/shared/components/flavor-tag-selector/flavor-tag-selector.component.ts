import { Component, computed, input, output, signal } from '@angular/core';

import { FLAVOR_TAG_GROUPS } from '../../constants/flavor-tags';

/**
 * Multi-select flavor-tag picker for a single tasting stage (Nose / Palate /
 * Finish). Tags are grouped by category in horizontally scrollable chip rows.
 * The stage is collapsible (expanded by default).
 *
 *   <app-flavor-tag-selector label="Nose" [selected]="noseTags"
 *                            (selectedChange)="noseTags = $event" />
 */
@Component({
  selector: 'app-flavor-tag-selector',
  templateUrl: './flavor-tag-selector.component.html',
  styleUrls: ['./flavor-tag-selector.component.scss'],
  standalone: false,
})
export class FlavorTagSelectorComponent {
  readonly label = input<string>('');
  readonly selected = input<string[]>([]);
  // AI-suggested tags (BB-186): selected tags that also appear here render as
  // "suggested" (tentative) rather than an explicit user pick.
  readonly suggested = input<string[]>([]);

  readonly selectedChange = output<string[]>();

  readonly groups = FLAVOR_TAG_GROUPS;
  readonly expanded = signal(true);
  // Reveals the extended (long-tail) tier of each category (BB-181).
  readonly showMore = signal(false);

  // True while any currently-selected tag is still an unconfirmed suggestion.
  readonly hasSuggested = computed(() => {
    const sel = this.selected();
    return this.suggested().some((t) => sel.includes(t));
  });

  isSelected(tag: string): boolean {
    return this.selected().includes(tag);
  }

  /** A selected tag that came from the AI suggestion (BB-186). */
  isSuggested(tag: string): boolean {
    return this.suggested().includes(tag) && this.isSelected(tag);
  }

  /** Extended tags render when "show more" is on, or if already selected. */
  showExtended(tag: string): boolean {
    return this.showMore() || this.isSelected(tag);
  }

  toggleShowMore(): void {
    this.showMore.update((v) => !v);
  }

  toggle(tag: string): void {
    const current = this.selected();
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    this.selectedChange.emit(next);
  }

  toggleExpanded(): void {
    this.expanded.update((v) => !v);
  }
}
