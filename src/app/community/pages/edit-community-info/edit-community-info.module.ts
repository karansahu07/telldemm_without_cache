import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { EditCommunityInfoPageRoutingModule } from './edit-community-info-routing.module';

import { EditCommunityInfoPage } from './edit-community-info.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    EditCommunityInfoPageRoutingModule
  ],
  // declarations: [EditCommunityInfoPage]
})
export class EditCommunityInfoPageModule {}
