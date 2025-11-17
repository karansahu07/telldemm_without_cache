import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ChannelsPage } from './channels.page';
import { ChannelAllPage } from '../channel-all/channel-all.page';
// import { ChannelsAllPage } from '../channel-all/channel-all.page';

// const routes: Routes = [
//   {
//     path: '',
//     component: ChannelsPage
//   }
// ];

const routes: Routes = [
  { path: '', component: ChannelsPage },        // /channels
  { path: 'all', component: ChannelAllPage }, // /channels/all
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ChannelsPageRoutingModule {}
