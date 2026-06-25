import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { ProfilePage } from './profile.page';
import { AvatarUploadComponent } from './components/avatar-upload/avatar-upload.component';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([{ path: '', component: ProfilePage }]),
  ],
  declarations: [ProfilePage, AvatarUploadComponent],
})
export class SettingsPageModule {}
