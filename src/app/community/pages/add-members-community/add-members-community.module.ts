import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AddMembersCommunityPageRoutingModule } from './add-members-community-routing.module';

import { AddMembersCommunityPage } from './add-members-community.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AddMembersCommunityPageRoutingModule
  ],
  // declarations: [AddMembersCommunityPage]
})
export class AddMembersCommunityPageModule {}
