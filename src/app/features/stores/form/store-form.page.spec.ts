import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

jest.mock('@ionic/angular', () => ({ ToastController: class {} }));

import { ToastController } from '@ionic/angular';
import { StoreFormPage } from './store-form.page';
import { StoreNotesService } from '../../../core/services/store-notes.service';

function configure(opts: {
  editId?: string | null;
  queryParams?: Record<string, string | null>;
  add?: jest.Mock;
  update?: jest.Mock;
}) {
  const q = opts.queryParams ?? {};
  const route = {
    snapshot: {
      paramMap: { get: () => opts.editId ?? null },
      queryParamMap: { get: (k: string) => q[k] ?? null },
    },
  };
  const navigateByUrl = jest.fn(() => Promise.resolve(true));
  TestBed.configureTestingModule({
    imports: [ReactiveFormsModule],
    declarations: [StoreFormPage],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      {
        provide: StoreNotesService,
        useValue: {
          selectById: () => signal(undefined),
          add: opts.add ?? jest.fn(() => Promise.resolve('new-id')),
          update: opts.update ?? jest.fn(() => Promise.resolve()),
        },
      },
      { provide: ActivatedRoute, useValue: route },
      { provide: Router, useValue: { navigateByUrl } },
      {
        provide: ToastController,
        useValue: { create: async () => ({ present: async () => undefined }) },
      },
    ],
  });
  const cmp = TestBed.createComponent(StoreFormPage).componentInstance;
  return { cmp, navigateByUrl };
}

describe('StoreFormPage (BB-223)', () => {
  it('requires a name', () => {
    const { cmp } = configure({});
    expect(cmp.form.invalid).toBe(true);
    cmp.form.controls.name.setValue('Total Wine');
    expect(cmp.form.valid).toBe(true);
  });

  it('does not save an invalid (nameless) form', async () => {
    const add = jest.fn(() => Promise.resolve('x'));
    const { cmp } = configure({ add });
    await cmp.save();
    expect(add).not.toHaveBeenCalled();
  });

  it('toggles specialty chips on and off', () => {
    const { cmp } = configure({});
    expect(cmp.isSpecialtySelected('barrel-picks')).toBe(false);
    cmp.toggleSpecialty('barrel-picks');
    expect(cmp.isSpecialtySelected('barrel-picks')).toBe(true);
    cmp.toggleSpecialty('barrel-picks');
    expect(cmp.isSpecialtySelected('barrel-picks')).toBe(false);
  });

  it('saves a valid new store, then returns to the list', async () => {
    const add = jest.fn(() => Promise.resolve('new-id'));
    const { cmp, navigateByUrl } = configure({ add });
    cmp.form.controls.name.setValue('  Liquor Barn  ');
    cmp.form.controls.city.setValue('Lexington');
    cmp.form.controls.priceTier.setValue('underpriced');
    cmp.toggleSpecialty('allocated');
    await cmp.save();
    expect(add).toHaveBeenCalledWith({
      name: 'Liquor Barn', // trimmed
      placeId: null,
      city: 'Lexington',
      state: null,
      priceTier: 'underpriced',
      specialties: ['allocated'],
      shipmentNotes: null,
      notes: null,
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/stores', { replaceUrl: true });
  });

  it('prefills name/city/state from query params (BB-225 handoff)', () => {
    const { cmp } = configure({
      queryParams: { name: 'Party Source', city: 'Bellevue', state: 'KY' },
    });
    expect(cmp.form.controls.name.value).toBe('Party Source');
    expect(cmp.form.controls.city.value).toBe('Bellevue');
    expect(cmp.form.controls.state.value).toBe('KY');
  });
});
