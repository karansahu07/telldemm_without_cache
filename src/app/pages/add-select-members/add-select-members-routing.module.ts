import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddSelectMembersPage } from './add-select-members.page';

const routes: Routes = [
  {
    path: '',
    component: AddSelectMembersPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddSelectMembersPageRoutingModule {}
