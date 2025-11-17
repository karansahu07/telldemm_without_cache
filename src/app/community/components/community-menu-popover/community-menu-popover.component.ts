// import { Component } from '@angular/core';
// import { IonicModule, PopoverController } from '@ionic/angular';
// import { CommonModule } from '@angular/common';
// import { TranslateModule } from '@ngx-translate/core'; // 👈 added

// @Component({
//   selector: 'app-community-menu-popover',
//   templateUrl: './community-menu-popover.component.html',
//   styleUrls: ['./community-menu-popover.component.scss'],
//   standalone: true,
//   imports: [IonicModule, CommonModule, TranslateModule], // 👈 added TranslateModule
// })
// export class CommunityMenuPopoverComponent {
//   constructor(private popoverCtrl: PopoverController) {}

//   select(action: 'info' | 'invite' | 'settings') {
//     this.popoverCtrl.dismiss({ action });
//   }
// }

import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-community-menu-popover',
  templateUrl: './community-menu-popover.component.html',
  styleUrls: ['./community-menu-popover.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class CommunityMenuPopoverComponent implements OnInit {
  @Input() isCreator: boolean = false; // Whether current user is the creator

  constructor(private popoverCtrl: PopoverController) {}

  ngOnInit() {
    console.log('Is Creator:', this.isCreator);
  }

  selectOption(action: string) {
    this.popoverCtrl.dismiss({ action });
  }
}