import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AddSelectMembersPageRoutingModule } from './add-select-members-routing.module';

import { AddSelectMembersPage } from './add-select-members.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AddSelectMembersPageRoutingModule
  ],
  // declarations: [AddSelectMembersPage]
})
export class AddSelectMembersPageModule {}
