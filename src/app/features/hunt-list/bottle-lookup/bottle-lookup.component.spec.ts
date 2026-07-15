import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';

jest.mock('@ionic/angular', () => ({
  ModalController: class {},
  ToastController: class {},
}));

import { ModalController, ToastController } from '@ionic/angular';
import { BottleLookupComponent } from './bottle-lookup.component';
import { BottlePreviewSheetComponent } from '../../../shared/components/bottle-preview-sheet/bottle-preview-sheet.component';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { Bourbon } from '../../../models';

const eagleRare = {
  id: 'er10',
  name: 'Eagle Rare 10 Year',
  distillery: 'Buffalo Trace',
  category: 'bourbon',
  isNas: false,
} as Bourbon;

function configure(opts: {
  sheetRole?: string;
  scanResult?: { code: string } | null;
  upcMatch?: Bourbon | null;
} = {}): {
  component: BottleLookupComponent;
  create: jest.Mock;
  dismiss: jest.Mock;
  toast: jest.Mock;
} {
  const create = jest.fn().mockResolvedValue({
    present: jest.fn().mockResolvedValue(undefined),
    onDidDismiss: jest
      .fn()
      .mockResolvedValue({ role: opts.sheetRole ?? 'cancel' }),
  });
  const dismiss = jest.fn().mockResolvedValue(true);
  const toast = jest
    .fn()
    .mockResolvedValue({ present: jest.fn().mockResolvedValue(undefined) });

  TestBed.configureTestingModule({
    declarations: [BottleLookupComponent],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      { provide: ModalController, useValue: { create, dismiss } },
      { provide: ToastController, useValue: { create: toast } },
      {
        provide: BarcodeScannerService,
        useValue: { scan: jest.fn().mockResolvedValue(opts.scanResult ?? null) },
      },
      {
        provide: BourbonCatalogService,
        useValue: {
          findByUpc: jest.fn().mockResolvedValue(opts.upcMatch ?? null),
        },
      },
    ],
  });
  return {
    component: TestBed.createComponent(BottleLookupComponent).componentInstance,
    create,
    dismiss,
    toast,
  };
}

describe('BottleLookupComponent', () => {
  afterEach(() => jest.clearAllMocks());

  it('opens the preview sheet for a picked catalog bottle', async () => {
    const { component, create } = configure();
    await component.openBottle(eagleRare);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: BottlePreviewSheetComponent,
        componentProps: {
          bottle: {
            name: 'Eagle Rare 10 Year',
            bourbonId: 'er10',
            distillery: 'Buffalo Trace',
            category: 'bourbon',
          },
        },
      })
    );
  });

  it('closes the lookup too once a bottle was added to the hunt list', async () => {
    const { component, dismiss } = configure({ sheetRole: 'added' });
    await component.openBottle(eagleRare);
    expect(dismiss).toHaveBeenCalled();
  });

  it('stays open when the sheet is just closed', async () => {
    const { component, dismiss } = configure({ sheetRole: 'cancel' });
    await component.openBottle(eagleRare);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('opens the sheet for a scanned barcode with a catalog match', async () => {
    const { component, create } = configure({
      scanResult: { code: '012345678905' },
      upcMatch: eagleRare,
    });
    await component.scanBarcode();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ component: BottlePreviewSheetComponent })
    );
  });

  it('says so — without guessing — when a scanned code is not in the catalog', async () => {
    const { component, create, toast } = configure({
      scanResult: { code: '012345678905' },
      upcMatch: null,
    });
    await component.scanBarcode();
    expect(create).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('not in the catalog'),
      })
    );
  });

  it('does nothing when the scan is cancelled', async () => {
    const { component, create, toast } = configure({ scanResult: null });
    await component.scanBarcode();
    expect(create).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
