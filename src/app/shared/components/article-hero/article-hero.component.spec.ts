import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArticleHeroComponent } from './article-hero.component';

describe('ArticleHeroComponent', () => {
  let component: ArticleHeroComponent;
  let fixture: ComponentFixture<ArticleHeroComponent>;

  const img = (): HTMLImageElement | null =>
    fixture.nativeElement.querySelector('img');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ArticleHeroComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ArticleHeroComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing when there is no image', () => {
    fixture.componentRef.setInput('src', null);
    fixture.detectChanges();
    expect(img()).toBeNull();
    expect(component.show()).toBe(false);
  });

  it('treats an empty string as no image', () => {
    fixture.componentRef.setInput('src', '');
    fixture.detectChanges();
    expect(img()).toBeNull();
  });

  it('renders a lazy, non-referring image when given a URL', () => {
    fixture.componentRef.setInput('src', 'https://x.com/hero.jpg');
    fixture.detectChanges();

    const el = img();
    expect(el).not.toBeNull();
    expect(el!.getAttribute('loading')).toBe('lazy');
    expect(el!.getAttribute('decoding')).toBe('async');
    expect(el!.getAttribute('referrerpolicy')).toBe('no-referrer');
    // Decorative: the headline beside it carries the meaning.
    expect(el!.getAttribute('alt')).toBe('');
  });

  it('collapses to nothing when the image fails to load', () => {
    fixture.componentRef.setInput('src', 'https://x.com/gone.jpg');
    fixture.detectChanges();
    expect(img()).not.toBeNull();

    img()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    // No broken-image glyph, no empty box — the card goes text-only.
    expect(img()).toBeNull();
    expect(component.show()).toBe(false);
  });

  it('recovers when the URL changes after a failure', () => {
    // @for recycles these hosts as the feed scrolls; a sticky failure would
    // blank out whichever article next lands on the same DOM node.
    fixture.componentRef.setInput('src', 'https://x.com/gone.jpg');
    fixture.detectChanges();
    img()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(img()).toBeNull();

    fixture.componentRef.setInput('src', 'https://x.com/good.jpg');
    fixture.detectChanges();
    expect(img()).not.toBeNull();
    expect(component.failed()).toBe(false);
  });
});
