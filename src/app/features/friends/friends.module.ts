import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular';

import { FriendsPage } from './friends.page';
import { AppMenuModule } from '../../shared/app-menu.module';

const routes: Routes = [{ path: '', component: FriendsPage }];

@NgModule({
  imports: [
    AppMenuModule,
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
  declarations: [FriendsPage],
})
export class FriendsPageModule {}
