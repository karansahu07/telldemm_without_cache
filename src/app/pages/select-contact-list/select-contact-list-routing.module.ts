import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SelectContactListPage } from './select-contact-list.page';

const routes: Routes = [
  {
    path: '',
    component: SelectContactListPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SelectContactListPageRoutingModule {}
