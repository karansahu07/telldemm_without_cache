import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ChannelFeedPage } from './channel-feed.page';

const routes: Routes = [
  {
    path: '',
    component: ChannelFeedPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ChannelFeedPageRoutingModule {}
