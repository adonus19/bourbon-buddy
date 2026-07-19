import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';

import { SharedModule } from '../../shared/shared.module';
import { StoresListPage } from './list/stores-list.page';
import { StoreFormPage } from './form/store-form.page';
import { StoreDetailPage } from './detail/store-detail.page';

/**
 * My Stores (Epic 24, BB-223/224) — lazy feature module. Owns the list, the
 * dual-mode create/edit form, and the detail page with its evidence panel.
 * `new` precedes the `:id` routes so the static path wins.
 */
@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule,
    SharedModule,
    RouterModule.forChild([
      { path: '', component: StoresListPage },
      { path: 'new', component: StoreFormPage },
      { path: ':id/edit', component: StoreFormPage },
      { path: ':id', component: StoreDetailPage },
    ]),
  ],
  declarations: [StoresListPage, StoreFormPage, StoreDetailPage],
})
export class StoresModule {}
