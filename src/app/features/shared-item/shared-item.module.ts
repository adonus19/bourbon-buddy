import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { SharedItemReceivePage } from './receive/shared-item-receive.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([{ path: '', component: SharedItemReceivePage }]),
  ],
  declarations: [SharedItemReceivePage],
})
export class SharedItemPageModule {}
