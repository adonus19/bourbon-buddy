import { Component, input, output, signal } from '@angular/core';

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

  readonly selectedChange = output<string[]>();

  readonly groups = FLAVOR_TAG_GROUPS;
  readonly expanded = signal(true);

  isSelected(tag: string): boolean {
    return this.selected().includes(tag);
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
