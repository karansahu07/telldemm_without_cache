import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, PopoverController } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-community-member-menu',
  templateUrl: './community-member-menu.component.html',
  styleUrls: ['./community-member-menu.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
})
export class CommunityMemberMenuComponent implements OnInit {
  @Input() isCreator: boolean = false;
  @Input() isCurrentUserAdmin: boolean = false;
  @Input() isTargetUserAdmin: boolean = false;
  @Input() isSelf: boolean = false;
  @Input() memberName: string = '';

  constructor(private popoverCtrl: PopoverController) {}

  ngOnInit() {
    console.log('CommunityMemberMenu initialized:', {
      isCreator: this.isCreator,
      isCurrentUserAdmin: this.isCurrentUserAdmin,
      isTargetUserAdmin: this.isTargetUserAdmin,
      isSelf: this.isSelf,
    });
  }

  async dismissWithAction(action: string) {
    await this.popoverCtrl.dismiss({ action });
  }

  message() {
    this.dismissWithAction('message');
  }

  makeAdmin() {
    this.dismissWithAction('makeAdmin');
  }

  dismissAdmin() {
    this.dismissWithAction('dismissAdmin');
  }

  removeMember() {
    this.dismissWithAction('removeMember');
  }
}