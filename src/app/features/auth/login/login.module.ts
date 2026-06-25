import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../../shared/shared.module';
import { LoginPage } from './login.page';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([{ path: '', component: LoginPage }]),
  ],
  declarations: [LoginPage],
})
export class LoginPageModule {}
