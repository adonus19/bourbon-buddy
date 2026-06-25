import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'cellar',
        loadChildren: () =>
          import('../cellar/cellar.module').then((m) => m.CellarPageModule),
      },
      {
        path: 'hunt-list',
        loadChildren: () =>
          import('../hunt-list/hunt-list.module').then(
            (m) => m.HuntListPageModule
          ),
      },
      {
        path: 'dispatch',
        loadChildren: () =>
          import('../dispatch/dispatch.module').then((m) => m.DispatchPageModule),
      },
      {
        path: 'numbers',
        loadChildren: () =>
          import('../numbers/numbers.module').then((m) => m.NumbersPageModule),
      },
      {
        path: 'search',
        loadChildren: () =>
          import('../search/search.module').then((m) => m.SearchPageModule),
      },
      {
        path: '',
        redirectTo: 'cellar',
        pathMatch: 'full',
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TabsPageRoutingModule {}
