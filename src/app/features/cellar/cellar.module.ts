import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { CellarPage } from './cellar.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([{ path: '', component: CellarPage }]),
  ],
  declarations: [CellarPage],
})
export class CellarPageModule {}
