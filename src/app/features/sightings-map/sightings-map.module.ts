import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { SightingsMapPage } from './sightings-map.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    RouterModule.forChild([{ path: '', component: SightingsMapPage }]),
  ],
  declarations: [SightingsMapPage],
})
export class SightingsMapPageModule {}
