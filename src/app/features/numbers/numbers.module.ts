import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import {
  BaseChartDirective,
  provideCharts,
  withDefaultRegisterables,
} from 'ng2-charts';

import { SharedModule } from '../../shared/shared.module';
import { NumbersPage } from './numbers.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    SharedModule,
    BaseChartDirective,
    RouterModule.forChild([{ path: '', component: NumbersPage }]),
  ],
  declarations: [NumbersPage],
  providers: [provideCharts(withDefaultRegisterables())],
})
export class NumbersPageModule {}
