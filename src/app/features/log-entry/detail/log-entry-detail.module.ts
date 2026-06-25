import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../../shared/shared.module';
import { LogEntryDetailPage } from './log-entry-detail.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([{ path: '', component: LogEntryDetailPage }]),
  ],
  declarations: [LogEntryDetailPage],
})
export class LogEntryDetailPageModule {}
