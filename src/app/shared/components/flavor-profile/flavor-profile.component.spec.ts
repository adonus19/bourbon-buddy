import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlavorProfile } from '../../../models';
import { FlavorProfileComponent } from './flavor-profile.component';

/** A minimal AI-only profile; override per test. */
const profile = (over: Partial<FlavorProfile> = {}): FlavorProfile =>
  ({
    nose: ['Vanilla', 'Caramel'],
    palate: ['Cherry'],
    finish: ['Oak'],
    source: 'ai',
    model: 'test',
    generatedAt: { toMillis: () => 0 } as unknown as FlavorProfile['generatedAt'],
    ...over,
  }) as FlavorProfile;

describe('FlavorProfileComponent (BB-235)', () => {
  let fixture: ComponentFixture<FlavorProfileComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FlavorProfileComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(FlavorProfileComponent);
  });

  const setProfile = (p: FlavorProfile | null) => {
    fixture.componentRef.setInput('profile', p);
    fixture.detectChanges();
  };

  it('renders nose, palate and finish stages from the profile', () => {
    setProfile(profile());
    const stages = fixture.nativeElement.querySelectorAll('.flavor__stage');
    const text = Array.from(stages).map((s: any) => s.textContent.trim());
    expect(stages.length).toBe(3);
    expect(text.join(' ')).toContain('Vanilla');
    expect(text.join(' ')).toContain('Cherry');
    expect(text.join(' ')).toContain('Oak');
  });

  it('omits a stage that has no tags', () => {
    setProfile(profile({ finish: [] }));
    const stages = fixture.nativeElement.querySelectorAll('.flavor__stage');
    expect(stages.length).toBe(2);
    expect(fixture.nativeElement.textContent).not.toContain('Finish');
  });

  it('shows an honest source line (review count)', () => {
    setProfile(profile({ reviewCount: 3 }));
    expect(fixture.nativeElement.querySelector('.flavor__source').textContent)
      .toContain('Based on 3 reviews');
  });

  it('badges consensus with ×N once two or more reviews agree', () => {
    setProfile(profile({ palate: ['Cherry'], tagCounts: { Cherry: 3 } }));
    const palate = Array.from(
      fixture.nativeElement.querySelectorAll('.flavor__stage')
    ).find((s: any) => /Palate/.test(s.textContent)) as HTMLElement;
    expect(palate.textContent).toContain('Cherry ×3');
  });

  it('surfaces producer-only claims as a "Distillery says" row', () => {
    setProfile(profile({ marketingTagCounts: { Honey: 2 } }));
    const claims = fixture.nativeElement.querySelector('.flavor__claims');
    expect(claims).toBeTruthy();
    expect(claims.textContent).toContain('Honey');
  });

  it('hides claims when showClaims is false', () => {
    fixture.componentRef.setInput('profile', profile({ marketingTagCounts: { Honey: 2 } }));
    fixture.componentRef.setInput('showClaims', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.flavor__claims')).toBeNull();
  });

  it('renders nothing when there is no profile', () => {
    setProfile(null);
    expect(fixture.nativeElement.querySelector('.flavor')).toBeNull();
  });

  it('renders nothing when every stage is empty', () => {
    setProfile(profile({ nose: [], palate: [], finish: [] }));
    expect(fixture.nativeElement.querySelector('.flavor')).toBeNull();
  });
});
