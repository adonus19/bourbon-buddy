import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../../shared/shared.module';
import { ScannerModule } from '../../../shared/scanner/scanner.module';
import { AddEditEntryPage } from './add-edit-entry.page';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule,
    SharedModule,
    ScannerModule,
    RouterModule.forChild([{ path: '', component: AddEditEntryPage }]),
  ],
  declarations: [AddEditEntryPage],
})
export class AddEditEntryPageModule {}
