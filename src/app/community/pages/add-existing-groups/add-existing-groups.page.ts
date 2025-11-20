import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-add-existing-groups',
  templateUrl: './add-existing-groups.page.html',
  styleUrls: ['./add-existing-groups.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule]
})
export class AddExistingGroupsPage implements OnInit {
  communityId: string | null = null;
  userId: string | null = null;
  groups: Array<any> = [];
  loading = false;
  selectedCount = 0;
  totalGroups = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.userId = this.authService?.authData?.userId 
      ? String(this.authService.authData.userId) 
      : null;
      
    this.route.queryParams.subscribe(params => {
      this.communityId = params['communityId'] || params['id'] || null;
      this.loadAdminGroups();
    });
  }

  /**
   * Load groups where current user is admin
   * Exclude:
   * - Groups that start with 'community'
   * - Groups that already belong to any community (have communityId)
   * - System groups (Announcements, General)
   */
  async loadAdminGroups() {
    if (!this.userId) {
      console.error('No userId available');
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('add_existing_groups_page.toasts.userNotFound') || 'User not found',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
      return;
    }

    this.loading = true;
    this.groups = [];
    let skippedBecauseCommunity = 0;
    let skippedNotAdmin = 0;

    try {
      // Get all groups for this user
      const groupIds = await this.firebaseService.getGroupsForUser(this.userId);
      console.log('User groups:', groupIds);

      for (const groupId of groupIds || []) {
        if (typeof groupId !== 'string') continue;

        // Skip groups that are community-linked by naming convention
        if (groupId.startsWith('community')) {
          skippedBecauseCommunity++;
          continue;
        }

        // Get group info
        const groupData = await this.firebaseService.getGroupInfo(groupId);
        if (!groupData || !groupData.members) continue;

        // Skip groups that already have a communityId
        if (groupData.communityId) {
          skippedBecauseCommunity++;
          continue;
        }

        // Skip system groups (Announcements, General)
        const groupTitle = groupData.title || groupData.name || '';
        if (groupTitle === 'Announcements' || groupTitle === 'General') {
          skippedBecauseCommunity++;
          continue;
        }

        // Check if current user is admin
        const isAdmin = await this.isUserAdminOfGroup(groupId, this.userId);
        
        if (!isAdmin) {
          skippedNotAdmin++;
          continue;
        }

        // Get member preview (first 4 members)
        const memberIds = Object.keys(groupData.members || {});
        const memberNames: string[] = [];
        
        for (let i = 0; i < Math.min(4, memberIds.length); i++) {
          const memberId = memberIds[i];
          const memberData = groupData.members[memberId];
          memberNames.push(memberData?.username || memberData?.name || memberId);
        }
        
        const membersPreview = memberNames.join(', ');

        this.groups.push({
          id: groupId,
          name: groupData.title || groupData.name || this.translate.instant('add_existing_groups_page.unnamedGroup') || 'Unnamed group',
          title: groupData.title || groupData.name || 'Unnamed group',
          avatar: groupData.avatar || groupData.dp || '',
          type: groupData.type || 'group',
          membersCount: memberIds.length,
          membersPreview: membersPreview,
          description: groupData.description || '',
          selected: false,
          raw: groupData
        });
      }

      this.totalGroups = this.groups.length;
      this.reorderGroups();

      console.log(`Loaded ${this.groups.length} admin groups`);
      console.log(`Skipped ${skippedBecauseCommunity} community groups`);
      console.log(`Skipped ${skippedNotAdmin} groups where user is not admin`);

    } catch (err) {
      console.error('loadAdminGroups error:', err);
      
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('add_existing_groups_page.toasts.loadFailed') || 'Failed to load groups',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.loading = false;
      this.selectedCount = this.groups.filter(g => g.selected).length;
    }
  }

  /**
   * Check if user is admin of a group
   */
  async isUserAdminOfGroup(groupId: string, userId: string): Promise<boolean> {
    try {
      const adminIds = await this.firebaseService.getGroupAdminIds(groupId);
      return adminIds.includes(String(userId));
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  toggleSelect(g: any) {
    g.selected = !g.selected;
    this.onSelectChange();
  }

  onSelectChange() {
    this.selectedCount = this.groups.filter(g => g.selected).length;
    this.reorderGroups();
  }

  reorderGroups() {
    const selected = this.groups.filter(g => g.selected);
    const others = this.groups.filter(g => !g.selected);
    this.groups = [...selected, ...others];
  }

  get selectedGroups() {
    return this.groups.filter(g => g.selected).slice(0, 12);
  }

  /**
   * Confirm selection and navigate to confirmation page
   */
  async confirmSelection() {
    const selectedGroups = this.groups.filter(g => g.selected);

    if (!selectedGroups || selectedGroups.length === 0) {
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('add_existing_groups_page.toasts.selectAtLeastOne') || 'Please select at least one group',
        duration: 1500,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    // Get community name
    let communityName = '';
    if (this.communityId) {
      try {
        communityName = await this.firebaseService.getCommunityName(this.communityId);
      } catch (err) {
        console.warn('Failed to get community name:', err);
      }
    }

    this.router.navigate(['/confirm-add-existing-groups'], {
      state: {
        groups: selectedGroups,
        communityId: this.communityId,
        communityName: communityName
      }
    });
  }

  back() {
    this.navCtrl.back();
  }
}