import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonicModule,
  PopoverController,
  ToastController,
} from '@ionic/angular';
import { MenuPopoverComponent } from '../../components/menu-popover/menu-popover.component';
import { FooterTabsComponent } from '../../components/footer-tabs/footer-tabs.component';
import { FirebaseChatService } from '../../services/firebase-chat.service';
import { AuthService } from '../../auth/auth.service';
import { Database, get, ref } from 'firebase/database';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

interface CommunityGroup {
  id: string;
  name: string;
  type: string;
  createdAt?: number;
  isSystemGroup?: boolean;
}

interface Community {
  id: string;
  name: string;
  icon: string;
  groups: CommunityGroup[];
  displayGroups: CommunityGroup[]; // max 3 for list
  totalGroups: number;
  hasMore: boolean;
}

@Component({
  selector: 'app-community',
  templateUrl: './community.page.html',
  styleUrls: ['./community.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FooterTabsComponent, TranslateModule],
})
export class CommunityPage implements OnInit {
  userId = this.authService.authData?.userId as string;
  joinedCommunities: Community[] = [];
  selectedCommunity: any = null;
  communityGroups: any[] = [];
  loading = false;

  // 🔹 skeleton placeholders (3 fake communities)
  skeletonCommunities = Array(3);

  constructor(
    private router: Router,
    private popoverCtrl: PopoverController,
    private actionSheetCtrl: ActionSheetController,
    private firebaseService: FirebaseChatService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.loadUserCommunities();
  }

  async presentPopover(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();
  }

  /**
   * Load communities with group sorting and limiting
   */
  async loadUserCommunities() {
    try {
      this.loading = true;
      this.joinedCommunities = [];

      const communityIds = await this.firebaseService.getUserCommunities(
        this.userId
      );

      for (const cid of communityIds) {
        try {
          const commSnap = await get(
            ref(this.firebaseService['db'] as Database, `communities/${cid}`)
          );

          if (!commSnap.exists()) continue;

          const commData = commSnap.val();
          const groupIds = await this.firebaseService.getGroupsInCommunity(cid);

          const allGroups: CommunityGroup[] = [];

          for (const gid of groupIds) {
            const gData = await this.firebaseService.getGroupInfo(gid);
            if (gData) {
              const groupName = gData.title || gData.name || 'Unnamed Group';
              const isSystemGroup =
                groupName === 'Announcements' ||
                groupName === 'General' ||
                gData.type === 'announcement';

              allGroups.push({
                id: gid,
                name: groupName,
                type: gData.type || 'normal',
                createdAt: gData.createdAt || 0,
                isSystemGroup,
              });
            }
          }

          // sort + slice
          const sortedGroups = this.sortGroups(allGroups);
          const displayGroups = sortedGroups.slice(0, 3);
          const hasMore = sortedGroups.length > 3;

          this.joinedCommunities.push({
            id: cid,
            name:
              commData.title ||
              commData.name ||
              this.translate.instant('community.unnamedCommunity'),
            icon: commData.avatar || commData.icon || 'assets/images/user.jfif',
            groups: sortedGroups,
            displayGroups,
            totalGroups: sortedGroups.length,
            hasMore,
          });
        } catch (err) {
          console.error(`Error loading community ${cid}:`, err);
        }
      }
    } catch (error) {
      console.error('Error loading communities:', error);
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('community.errors.loadFailed'),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.loading = false;
    }
  }

  /**
   * Sort groups: Announcement → General → Others (by creation date)
   */
  private sortGroups(groups: CommunityGroup[]): CommunityGroup[] {
    return groups.sort((a, b) => {
      if (a.isSystemGroup && !b.isSystemGroup) return -1;
      if (!a.isSystemGroup && b.isSystemGroup) return 1;

      if (a.isSystemGroup && b.isSystemGroup) {
        if (a.name === 'Announcements') return -1;
        if (b.name === 'Announcements') return 1;
        if (a.name === 'General') return -1;
        if (b.name === 'General') return 1;
      }

      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  /**
   * Create new community
   */
  async createCommunityPrompt() {
    this.router.navigate(['/new-community']);
  }

  /**
   * Legacy method (if still used anywhere)
   */
  async openCommunityGroups(community: any) {
    this.selectedCommunity = community;
    this.communityGroups = [];

    const groupIds = await this.firebaseService.getGroupsInCommunity(
      community.id
    );
    for (const gid of groupIds) {
      const groupData = await this.firebaseService.getGroupInfo(gid);
      if (groupData) {
        this.communityGroups.push({
          id: gid,
          name: groupData.title || groupData.name,
          type: groupData.type,
        });
      }
    }
  }

  /**
   * Navigate to group chat
   */
  goToGroupChat(groupId: string) {
    this.router.navigate(['/chatting-screen'], {
      queryParams: {
        receiverId: groupId,
        isGroup: true,
      },
    });
  }

  /**
   * View all groups in community detail page
   */
  goToAddGroupCommunity(community: Community) {
    this.router.navigate(['/community-detail'], {
      queryParams: { communityId: community.id },
      state: {
        communityName: community.name,
        communityIcon: community.icon,
      },
    });
  }

  /**
   * Get icon based on group type
   */
  getGroupIcon(group: CommunityGroup): string {
    if (group.name === 'Announcements' || group.type === 'announcement') {
      return 'megaphone-outline';
    }
    if (group.name === 'General') {
      return 'people-outline';
    }
    return 'chatbox-outline';
  }

  /**
   * Get translated group type (if needed somewhere else)
   */
  getGroupTypeLabel(group: CommunityGroup): string {
    const typeKey = group.type || 'normal';
    return this.translate.instant(`community.groupType.${typeKey}`);
  }

  /**
   * Pull-to-refresh support
   */
  async refreshCommunities(event?: any) {
    await this.loadUserCommunities();
    if (event) {
      event.target.complete();
    }
  }
}
