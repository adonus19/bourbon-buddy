import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';

import { SharedModule } from '../../shared/shared.module';
import { StoresListPage } from './list/stores-list.page';
import { StoreFormPage } from './form/store-form.page';

/**
 * My Stores (Epic 24, BB-223) — lazy feature module. Owns the list and the
 * dual-mode create/edit form; the store detail page (`:id`) arrives with BB-224.
 * `new` precedes `:id/edit` so the static path wins.
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
    ]),
  ],
  declarations: [StoresListPage, StoreFormPage],
})
export class StoresModule {}
