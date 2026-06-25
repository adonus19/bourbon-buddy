import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { HuntListPage } from './hunt-list.page';
import { WishlistFilterModalComponent } from './filter-modal/wishlist-filter-modal.component';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([{ path: '', component: HuntListPage }]),
  ],
  declarations: [HuntListPage, WishlistFilterModalComponent],
})
export class HuntListPageModule {}
