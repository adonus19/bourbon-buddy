import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { SpottedItPage } from './spotted-it.page';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([{ path: '', component: SpottedItPage }]),
  ],
  declarations: [SpottedItPage],
})
export class SpottedItPageModule {}
