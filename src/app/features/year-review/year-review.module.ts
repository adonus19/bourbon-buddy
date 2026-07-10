import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { YearReviewPage } from './year-review.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([{ path: '', component: YearReviewPage }]),
  ],
  declarations: [YearReviewPage],
})
export class YearReviewPageModule {}
