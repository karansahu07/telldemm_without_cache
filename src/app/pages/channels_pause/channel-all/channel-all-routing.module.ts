import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ChannelAllPage } from './channel-all.page';

const routes: Routes = [
  {
    path: '',
    component: ChannelAllPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ChannelAllPageRoutingModule {}
