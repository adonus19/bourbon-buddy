import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular';

import { PublicProfilePage } from './public-profile.page';

const routes: Routes = [{ path: '', component: PublicProfilePage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [PublicProfilePage],
})
export class PublicProfilePageModule {}
