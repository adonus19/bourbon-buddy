import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular';

import { FriendsFeedPage } from './friends-feed.page';

const routes: Routes = [{ path: '', component: FriendsFeedPage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [FriendsFeedPage],
})
export class FriendsFeedPageModule {}
