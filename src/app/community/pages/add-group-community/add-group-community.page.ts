import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, IonicModule, NavController, ToastController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-add-group-community',
  templateUrl: './add-group-community.page.html',
  styleUrls: ['./add-group-community.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule]
})
export class AddGroupCommunityPage implements OnInit {
  communityId: string | null = null;
  communityName = '';
  groupsInCommunity: Array<{
    id: string;
    name: string;
    title: string;
    type: string;
    membersCount: number;
    isSystemGroup: boolean;
  }> = [];
  loading = false;

  constructor(
    private route: ActivatedRoute,
    private firebaseService: FirebaseChatService,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      const cid = params['communityId'] || params['id'];
      if (cid) {
        this.communityId = cid;
        
        // Get community name
        try {
          this.communityName = await this.firebaseService.getCommunityName(cid);
        } catch (err) {
          console.warn('Failed to get community name:', err);
        }
        
        await this.loadGroupsForCommunity();
      }
    });
  }

  goToCreateNewGroup() {
    this.navCtrl.navigateForward(['/create-new-group'], {
      queryParams: { 
        communityId: this.communityId, 
        communityName: this.communityName 
      }
    });
  }

  async loadGroupsForCommunity() {
    if (!this.communityId) return;
    
    this.loading = true;
    this.groupsInCommunity = [];

    try {
      // Use service function to get all groups
      const groups = await this.firebaseService.getCommunityGroupsList(this.communityId);
      this.groupsInCommunity = groups;
      
      console.log('Loaded groups:', this.groupsInCommunity);
    } catch (err) {
      console.error('loadGroupsForCommunity error:', err);
      
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('community.manageGroups.toasts.loadFailed') || 'Failed to load groups',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.loading = false;
    }
  }

  async removeGroupFromCommunity(groupId: string, groupName: string) {
    if (!this.communityId || !groupId) return;

    const t = this.translate;

    // Show confirmation alert
    const alert = await this.alertCtrl.create({
      header: t.instant('community.manageGroups.remove.header') || 'Remove Group',
      message: t.instant('community.manageGroups.remove.message') || `Are you sure you want to remove "${groupName}" from this community?`,
      inputs: [
        {
          name: 'removeMembers',
          type: 'checkbox',
          label: t.instant('community.manageGroups.remove.alsoRemoveMembers') || 'Also remove members from community',
          value: 'removeMembers',
          checked: false
        }
      ],
      buttons: [
        { 
          text: t.instant('community.actions.cancel') || 'Cancel', 
          role: 'cancel' 
        },
        { 
          text: t.instant('community.manageGroups.remove.cta') || 'Remove', 
          role: 'ok',
          cssClass: 'alert-button-danger'
        }
      ]
    });
    
    await alert.present();

    const res = await alert.onDidDismiss();
    if (res.role === 'cancel') return;

    // Normalize checkbox value
    let removeMembers = false;
    try {
      const data: any = res?.data;
      removeMembers =
        Array.isArray(data?.values) ? data.values.includes('removeMembers') :
        Array.isArray(data?.data) ? data.data.includes('removeMembers') :
        Array.isArray(data) ? data.includes('removeMembers') :
        !!data?.removeMembers;
    } catch {
      removeMembers = false;
    }

    this.loading = true;

    try {
      // Use service function to remove group
      const result = await this.firebaseService.removeGroupFromCommunitys(
        this.communityId,
        groupId,
        {
          removeMembers: removeMembers
        }
      );

      if (result.success) {
        // Show success message
        let message = t.instant('community.manageGroups.toasts.removed') || 'Group removed successfully';
        
        if (removeMembers && result.removedMembersCount && result.removedMembersCount > 0) {
          message += ` (${result.removedMembersCount} member${result.removedMembersCount !== 1 ? 's' : ''} removed from community)`;
        }

        const successToast = await this.toastCtrl.create({
          message: message,
          duration: 3000,
          color: 'success'
        });
        await successToast.present();

        // Reload groups list
        await this.loadGroupsForCommunity();
      } else {
        // Show error message
        const errorToast = await this.toastCtrl.create({
          message: result.message || t.instant('community.manageGroups.toasts.removeFailed') || 'Failed to remove group',
          duration: 3000,
          color: 'danger'
        });
        await errorToast.present();
      }
    } catch (err) {
      console.error('removeGroupFromCommunity failed:', err);
      
      const errToast = await this.toastCtrl.create({
        message: t.instant('community.manageGroups.toasts.removeFailed') || 'Failed to remove group',
        duration: 3000,
        color: 'danger'
      });
      await errToast.present();
    } finally {
      this.loading = false;
    }
  }

  goToAddExistingGroups() {
    this.navCtrl.navigateForward(['/add-existing-groups'], {
      queryParams: { communityId: this.communityId }
    });
  }

  // Helper method to check if group can be removed
  canRemoveGroup(group: any): boolean {
    // System groups (Announcements, General) cannot be removed
    return !group.isSystemGroup;
  }

  // Get group icon based on type
  getGroupIcon(group: any): string {
    if (group.title === 'Announcements' || group.type === 'announcement') {
      return 'megaphone-outline';
    }
    if (group.title === 'General' || group.type === 'general') {
      return 'chatbubbles-outline';
    }
    return 'people-outline';
  }

  // Get group type label
  getGroupTypeLabel(group: any): string {
    if (group.isSystemGroup) {
      return 'System Group';
    }
    return `${group.membersCount} member${group.membersCount !== 1 ? 's' : ''}`;
  }
}