import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddMembersCommunityPage } from './add-members-community.page';

const routes: Routes = [
  {
    path: '',
    component: AddMembersCommunityPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddMembersCommunityPageRoutingModule {}
