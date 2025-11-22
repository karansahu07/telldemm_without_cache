import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SelectContactListPageRoutingModule } from './select-contact-list-routing.module';

import { SelectContactListPage } from './select-contact-list.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SelectContactListPageRoutingModule
  ],
  // declarations: [SelectContactListPage]
})
export class SelectContactListPageModule {}
