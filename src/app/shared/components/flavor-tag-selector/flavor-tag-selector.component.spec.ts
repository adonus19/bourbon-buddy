import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlavorTagSelectorComponent } from './flavor-tag-selector.component';

describe('FlavorTagSelectorComponent — suggested state (BB-186)', () => {
  let fixture: ComponentFixture<FlavorTagSelectorComponent>;
  let component: FlavorTagSelectorComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FlavorTagSelectorComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(FlavorTagSelectorComponent);
    component = fixture.componentInstance;
  });

  it('marks a tag suggested only when it is both suggested and selected', () => {
    fixture.componentRef.setInput('selected', ['Vanilla', 'Oak']);
    fixture.componentRef.setInput('suggested', ['Vanilla', 'Cherry']);

    expect(component.isSuggested('Vanilla')).toBe(true); // suggested + selected
    expect(component.isSuggested('Oak')).toBe(false); // selected, user-chosen
    expect(component.isSuggested('Cherry')).toBe(false); // suggested but not selected
  });

  it('hasSuggested is true while a selected tag is still an unconfirmed suggestion', () => {
    fixture.componentRef.setInput('selected', ['Vanilla']);
    fixture.componentRef.setInput('suggested', ['Vanilla']);
    expect(component.hasSuggested()).toBe(true);
  });

  it('hasSuggested is false with no suggestions or once suggestions are removed', () => {
    fixture.componentRef.setInput('selected', ['Oak']);
    fixture.componentRef.setInput('suggested', []);
    expect(component.hasSuggested()).toBe(false);

    // A suggestion the user removed (no longer selected) no longer counts.
    fixture.componentRef.setInput('selected', ['Oak']);
    fixture.componentRef.setInput('suggested', ['Vanilla']);
    expect(component.hasSuggested()).toBe(false);
  });
});
