import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ChannelAllPageRoutingModule } from './channel-all-routing.module';

// import { ChannelAllPage } from './channel-all.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ChannelAllPageRoutingModule
  ],
  declarations: []
})
export class ChannelAllPageModule {}
