import { Directive, ElementRef, OnInit, inject } from '@angular/core';

/** Input types where capitalization/correction would get in the way. */
const NO_ASSIST_TYPES = ['email', 'password', 'number', 'tel', 'url'];

/**
 * Applies the typing helpers users expect — sentence-case auto-capitalization,
 * autocorrect, spellcheck, and browser autocomplete — to every `ion-input`
 * and `ion-textarea` by default. Skips assistive correction on email/password/
 * numeric fields. Any attribute set explicitly in a template wins, so specific
 * fields can opt out.
 */
@Directive({
  selector: 'ion-input, ion-textarea',
  standalone: false,
})
export class InputHelpersDirective implements OnInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngOnInit(): void {
    const el = this.host.nativeElement;
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    const assist = !NO_ASSIST_TYPES.includes(type);

    this.setIfAbsent(el, 'autocapitalize', assist ? 'sentences' : 'off');
    this.setIfAbsent(el, 'autocorrect', assist ? 'on' : 'off');
    this.setIfAbsent(el, 'spellcheck', assist ? 'true' : 'false');
    if (assist) {
      this.setIfAbsent(el, 'autocomplete', 'on');
    }
  }

  private setIfAbsent(el: HTMLElement, attr: string, value: string): void {
    if (!el.hasAttribute(attr)) {
      el.setAttribute(attr, value);
    }
  }
}
