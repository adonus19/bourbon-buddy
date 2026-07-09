import { Component, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, from, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  switchMap,
} from 'rxjs/operators';

import { Bourbon } from '../../../models';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';

/**
 * Name field with catalog autocomplete. Emits typed text via (valueChange) and
 * a chosen catalog entry via (selected). Search is debounced (300ms) and the
 * service query is bounded — one network read per settled keystroke-batch, no
 * open listener (see BourbonCatalogService).
 */
@Component({
  selector: 'app-bourbon-autocomplete',
  templateUrl: './bourbon-autocomplete.component.html',
  styleUrls: ['./bourbon-autocomplete.component.scss'],
  standalone: false,
})
export class BourbonAutocompleteComponent {
  private readonly catalog = inject(BourbonCatalogService);

  readonly value = input<string>('');
  readonly label = input<string>('Bourbon / whiskey name');
  readonly placeholder = input<string>('Start typing a name…');
  /** Show a required-field marker (*) in the label. */
  readonly required = input<boolean>(false);

  readonly valueChange = output<string>();
  readonly selected = output<Bourbon>();

  readonly results = signal<Bourbon[]>([]);
  readonly searching = signal(false);
  readonly showResults = signal(false);

  private readonly term$ = new Subject<string>();

  constructor() {
    this.term$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const t = term.trim();
          if (t.length < 2) {
            this.searching.set(false);
            return of<Bourbon[]>([]);
          }
          this.searching.set(true);
          return from(this.catalog.search(t)).pipe(
            catchError(() => of<Bourbon[]>([]))
          );
        }),
        takeUntilDestroyed()
      )
      .subscribe((results) => {
        this.results.set(results);
        this.searching.set(false);
        this.showResults.set(results.length > 0);
      });
  }

  onInput(event: Event): void {
    const v = (event as CustomEvent<{ value?: string }>).detail?.value ?? '';
    this.valueChange.emit(v);
    this.term$.next(v);
  }

  pick(bourbon: Bourbon): void {
    this.selected.emit(bourbon);
    this.valueChange.emit(bourbon.name);
    this.results.set([]);
    this.showResults.set(false);
  }

  // Give a tapped result time to register before hiding the dropdown.
  hideResultsSoon(): void {
    setTimeout(() => this.showResults.set(false), 150);
  }
}
