import { Component, OnInit } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

type MenuOption = { labelKey: string; route?: string };

@Component({
  selector: 'app-menu-popover',
  standalone: true,
  templateUrl: './menu-popover.component.html',
  styleUrls: ['./menu-popover.component.scss'],
  imports: [IonicModule, CommonModule, TranslateModule],
})
export class MenuPopoverComponent implements OnInit {
  currentUrl: string = '';
  menuOptions: MenuOption[] = [];

  constructor(
    private popoverCtrl: PopoverController,
    private router: Router
  ) { }

  ngOnInit() {
    this.currentUrl = this.router.url;

    if (this.currentUrl.includes('/home-screen')) {
      this.menuOptions = [
        { labelKey: 'menu.newGroup', route: '/contact-screen' },
        { labelKey: 'menu.newCommunity', route: '/community-screen' },
        // { labelKey: 'menu.newBroadcast' },
        // { labelKey: 'menu.starred' },
        // { labelKey: 'menu.readAll' },
        { labelKey: 'menu.settings', route: '/setting-screen' }
      ];
    } else if (this.currentUrl.includes('/status')) {
      this.menuOptions = [
        { labelKey: 'menu.createChannels' },
        // { labelKey: 'menu.statusPrivacy' },
        // { labelKey: 'menu.starred' },
        { labelKey: 'menu.settings', route: '/setting-screen' }
      ];
    } else if (this.currentUrl.includes('/community-screen')) {
      this.menuOptions = [
        { labelKey: 'menu.settings', route: '/setting-screen' }
      ];
    } else if (this.currentUrl.includes('/calls-screen')) {
      this.menuOptions = [
        // { labelKey: 'menu.clearCallLogs' },
        { labelKey: 'menu.settings', route: '/setting-screen' }
      ];
    }
  }

  selectOption(option: MenuOption) {

    if (option.labelKey === 'menu.readAll') {
      //console.log("read All clicked")
      this.popoverCtrl.dismiss({ action: 'readAll' });
      return;
    }

    this.popoverCtrl.dismiss();

    if (option.route) {
      this.router.navigate([option.route]);
    }
    // For non-route items (like "starred", "readAll") → implement action later
  }
}
