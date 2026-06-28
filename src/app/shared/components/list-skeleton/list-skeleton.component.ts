import { Component, computed, input } from '@angular/core';

/** Placeholder card rows shown while a list's first data snapshot loads. */
@Component({
  selector: 'app-list-skeleton',
  templateUrl: './list-skeleton.component.html',
  styleUrls: ['./list-skeleton.component.scss'],
  standalone: false,
})
export class ListSkeletonComponent {
  readonly count = input<number>(5);
  readonly rows = computed(() => Array.from({ length: this.count() }));
}
