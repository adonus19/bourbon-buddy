import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular';

import { FriendsFeedPage } from './friends-feed.page';
import { OnboardingModule } from '../../shared/onboarding.module';
import { AppMenuModule } from '../../shared/app-menu.module';

const routes: Routes = [{ path: '', component: FriendsFeedPage }];

@NgModule({
  imports: [
    AppMenuModule,
    CommonModule,
    IonicModule,
    RouterModule.forChild(routes),
    OnboardingModule,
  ],
  declarations: [FriendsFeedPage],
})
export class FriendsFeedPageModule {}
