import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SelectAddAndCreateGroupPage } from './select-add-and-create-group.page';

const routes: Routes = [
  {
    path: '',
    component: SelectAddAndCreateGroupPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SelectAddAndCreateGroupPageRoutingModule {}
