import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { getDatabase, ref, set } from 'firebase/database';
import { Router } from '@angular/router';

@Component({
  selector: 'app-userabout-menu',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './userabout-menu.component.html',
  styleUrls: ['./userabout-menu.component.scss']
})
export class UseraboutMenuComponent {
  @Input() chatType: 'private' | 'group' = 'private';
  @Input() groupId: string = ''; // 👈 Passed from parent

  constructor(
    private popoverCtrl: PopoverController,
    private router: Router
  ) {}

  close() {
    this.popoverCtrl.dismiss();
  }

  async onOptionClick(option: string) {
    //console.log('Selected:', option);

    if (option === 'addMembers') {
      await this.addMembersToGroup(); // Optional: can be kept as-is
    } else if (option === 'changeGroupName') {
      await this.navigateToChangeGroupName();
    } else {
      this.popoverCtrl.dismiss({ action: option });
    }
  }

  // async addMembersToGroup() {
  //   const userId = prompt("Enter User ID to add:");
  //   if (!userId) return;

  //   const db = getDatabase();
  //   const groupRef = ref(db, `groups/${this.groupId}/members/${userId}`);

  //   try {
  //     await set(groupRef, true);
  //     //console.log(`User ${userId} added successfully to group ${this.groupId}`);
  //     this.popoverCtrl.dismiss({ action: 'memberAdded' });
  //   } catch (err) {
  //     console.error('Error adding member:', err);
  //   }
  // }

  async addMembersToGroup() {
  // Navigate to contact screen to select users
  this.popoverCtrl.dismiss(); // Dismiss the popover if open
  this.router.navigate(['/add-members'], {
    queryParams: {
      groupId: this.groupId,
      action: 'add-member'
    }
  });
}

  async navigateToChangeGroupName() {
    // await this.popoverCtrl.dismiss();
    // this.router.navigate(['/change-group-name'], {
    //   queryParams: { groupId: this.groupId }
    // });
  }
}
