import { Component, OnInit } from '@angular/core';
import { IonicModule, NavController } from '@ionic/angular';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { ApiService } from 'src/app/services/api/api.service';
import { AuthService } from 'src/app/auth/auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-select-add-and-create-group',
  templateUrl: './select-add-and-create-group.page.html',
  styleUrls: ['./select-add-and-create-group.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class SelectAddAndCreateGroupPage implements OnInit {
  groupName = '';
  members: any[] = [];

  constructor(
    private firebaseChatService: FirebaseChatService,
    private api: ApiService,
    private authService: AuthService,
    private navCtrl: NavController,
    private router: Router
  ) {}

  ngOnInit() {
    this.members = this.firebaseChatService.getSelectedGroupMembers();

    if (!this.members || this.members.length === 0) {
      this.navCtrl.back();
    }
  }

  async createGroup() {
    const selectedUsers = this.members;
    console.log('selected users', selectedUsers);

    const currentUserId = this.authService.authData?.userId ?? '';
    const currentUserPhone = this.authService.authData?.phone_number ?? '';
    const currentUserName = this.authService.authData?.name ?? '';

    if (!this.groupName?.trim()) {
      alert('Group name is required');
      return;
    }

    const membersForFirebase = selectedUsers.map((u) => ({
      userId: u.userId,
      username: u.name,
      phoneNumber: u.phoneNumber,
    }));

    console.log("members for firebase",membersForFirebase)

    const memberIds: number[] = membersForFirebase
      .map((m) => parseInt(m.userId, 10))
      .filter((id) => !isNaN(id));

    const groupId = `group_${Date.now()}`;

    try {
      await this.firebaseChatService.createGroup({
        groupId,
        groupName: this.groupName,
        members: membersForFirebase,
      });

      this.api
        .createGroup(this.groupName, Number(currentUserId), groupId, memberIds)
        .subscribe({
          next: async (res: any) => {
            const backendGroupId =
              res?.group?.group?.group_id ??
              res?.group?.groupId ??
              res?.group?.id ??
              res?.group_id ??
              res?.data?.group_id ??
              res?.data?.id ??
              res?.id;

            if (backendGroupId) {
              try {
                await this.firebaseChatService.updateBackendGroupId(
                  groupId,
                  backendGroupId
                );
              } catch (err) {
                console.warn('Failed to update backendGroupId:', err);
              }
            }

            // cleanup
            this.firebaseChatService.clearSelectedGroupMembers();
            this.groupName = '';

            alert('Group created successfully');
            localStorage.setItem('shouldRefreshHome', 'true');
            this.router.navigate(['/home-screen']);
          },
          error: (err: any) => {
            console.error('Backend sync failed:', err);
            alert('Failed to sync group to backend');
          },
        });
    } catch (err) {
      console.error('Failed to create group:', err);
      alert('Failed to create group');
    }
  }
}
