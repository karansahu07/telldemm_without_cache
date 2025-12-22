import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { getDatabase, ref, set } from 'firebase/database';
import { Router } from '@angular/router';

export interface GroupMeta {
  title: string;
  description: string;
  createdBy: string;
  createdAt: string;
}

@Component({
  selector: 'app-userabout-menu',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './userabout-menu.component.html',
  styleUrls: ['./userabout-menu.component.scss']
})
export class UseraboutMenuComponent {
  @Input() chatType: 'private' | 'group' = 'private';
  @Input() groupId: string = '';
  @Input() isCurrentUserMember: boolean = true;
  @Input() groupMeta: GroupMeta | null = null;

  constructor(
    private popoverCtrl: PopoverController,
    private router: Router,
    private alertCtrl: AlertController
  ) {}

  ngOnInit() {
  console.log('📦 Received group meta in menu:', this.groupMeta);
}

  close() {
    this.popoverCtrl.dismiss();
  }

  async onOptionClick(option: string) {
    if (!this.isCurrentUserMember && option !== 'changeGroupName') {
      await this.showNotMemberAlert();
      return;
    }

    if (!this.isCurrentUserMember && option === 'changeGroupName') {
      await this.showCannotChangeNameAlert();
      return;
    }

    // Normal flow for members
    if (option === 'addMembers') {
      await this.addMembersToGroup();
    } else if (option === 'changeGroupName') {
      await this.navigateToChangeGroupName();
    } else {
      this.popoverCtrl.dismiss({ action: option });
    }
  }

  async showNotMemberAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Not a Member',
      message: 'You cannot perform this action because you are not a member of this group.',
      buttons: ['OK']
    });
    await alert.present();
  }

  async showCannotChangeNameAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Cannot Change Group Name',
      message: 'You cannot change group name because you are not a member of this group.',
      buttons: ['OK']
    });
    await alert.present();
  }

  async addMembersToGroup() {
    this.popoverCtrl.dismiss();
    this.router.navigate(['/add-members'], {
      queryParams: {
        groupId: this.groupId,
        action: 'add-member'
      }
    });
  }

  async navigateToChangeGroupName() {
    await this.popoverCtrl.dismiss();
    this.router.navigate(['/change-group-name'], {
      queryParams: { groupId: this.groupId }
    });
  }
}