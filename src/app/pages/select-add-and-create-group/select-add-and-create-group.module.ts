import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SelectAddAndCreateGroupPageRoutingModule } from './select-add-and-create-group-routing.module';

import { SelectAddAndCreateGroupPage } from './select-add-and-create-group.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SelectAddAndCreateGroupPageRoutingModule
  ],
  // declarations: [SelectAddAndCreateGroupPage]
})
export class SelectAddAndCreateGroupPageModule {}
