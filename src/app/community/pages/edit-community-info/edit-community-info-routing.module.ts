import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { EditCommunityInfoPage } from './edit-community-info.page';

const routes: Routes = [
  {
    path: '',
    component: EditCommunityInfoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EditCommunityInfoPageRoutingModule {}
