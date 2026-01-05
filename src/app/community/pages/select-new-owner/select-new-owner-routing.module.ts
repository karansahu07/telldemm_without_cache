import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SelectNewOwnerPage } from './select-new-owner.page';

const routes: Routes = [
  {
    path: '',
    component: SelectNewOwnerPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SelectNewOwnerPageRoutingModule {}
