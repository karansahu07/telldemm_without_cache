import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SelectNewOwnerPageRoutingModule } from './select-new-owner-routing.module';

import { SelectNewOwnerPage } from './select-new-owner.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SelectNewOwnerPageRoutingModule
  ],
  // declarations: [SelectNewOwnerPage]
})
export class SelectNewOwnerPageModule {}
