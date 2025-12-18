import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ChannelFeedPageRoutingModule } from './channel-feed-routing.module';
import { SharedModule } from 'src/app/shared/shared.module';

// import { ChannelFeedPage } from './channel-feed.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ChannelFeedPageRoutingModule,
    SharedModule
  ],
  declarations: [], schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ChannelFeedPageModule {}
