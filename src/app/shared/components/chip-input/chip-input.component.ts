import { Component, input, output, signal } from '@angular/core';

/** Add/remove a list of text tokens as chips (watch keywords, excludes, etc.). */
@Component({
  selector: 'app-chip-input',
  templateUrl: './chip-input.component.html',
  styleUrls: ['./chip-input.component.scss'],
  standalone: false,
})
export class ChipInputComponent {
  readonly label = input<string>('');
  readonly placeholder = input<string>('Add…');
  readonly items = input<string[]>([]);
  readonly itemsChange = output<string[]>();

  readonly draft = signal('');

  onInput(event: Event): void {
    this.draft.set((event as CustomEvent<{ value?: string }>).detail?.value ?? '');
  }

  add(): void {
    const value = this.draft().trim();
    this.draft.set('');
    if (!value) {
      return;
    }
    if (this.items().some((x) => x.toLowerCase() === value.toLowerCase())) {
      return;
    }
    this.itemsChange.emit([...this.items(), value]);
  }

  remove(index: number): void {
    this.itemsChange.emit(this.items().filter((_, i) => i !== index));
  }
}
