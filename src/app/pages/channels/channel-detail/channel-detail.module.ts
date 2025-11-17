import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ChannelDetailPageRoutingModule } from './channel-detail-routing.module';
import { RouterModule } from '@angular/router';
import { SharedModule } from 'src/app/shared/shared.module';

// import { ChannelDetailPage } from './channel-detail.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule,
    ChannelDetailPageRoutingModule,
    SharedModule
  ],
  declarations: []
})
export class ChannelDetailPageModule {}
