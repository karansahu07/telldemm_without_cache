import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  NavController,
  PopoverController,
  ModalController,
  ToastController,
  LoadingController,
} from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseChatService } from '../../../services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { SqliteService, IConversation, IGroup } from '../../../services/sqlite.service';

// Popover component
import { CommunityMenuPopoverComponent } from '../../components/community-menu-popover/community-menu-popover.component';

// Group preview modal component
import { GroupPreviewModalComponent } from '../../components/group-preview-modal/group-preview-modal.component';
import { AlertController } from '@ionic/angular';
import { Database, get, ref, onValue, off } from 'firebase/database';
import { get as rtdbGet, getDatabase } from 'firebase/database';
import { ApiService } from 'src/app/services/api/api.service';
import { firstValueFrom } from 'rxjs';

interface CommunityGroup extends IConversation {
  membersCount?: number;
  isMember?: boolean;
  name?: string;
  description?: string;
  id?: string;
}

@Component({
  selector: 'app-community-detail',
  templateUrl: './community-detail.page.html',
  styleUrls: ['./community-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class CommunityDetailPage implements OnInit, OnDestroy {
  communityId: string | null = null;
  community: any = null;
  announcementGroup: CommunityGroup | null = null;
  generalGroup: CommunityGroup | null = null;
  groupsIn: CommunityGroup[] = [];
  groupsAvailable: CommunityGroup[] = [];
  loading = false;

  memberCount = 0;
  groupCount = 0;

  currentUserId: string = '';
  currentUserName: string = '';
  currentUserPhone: string = '';
  isCreator: boolean = false;
  allCommunityGroups: IGroup[] = [];

  // ✅ Real-time listener cleanup functions
  private communityListener: (() => void) | null = null;
  private groupListeners: Map<string, () => void> = new Map();

  constructor(
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private router: Router,
    private firebaseService: FirebaseChatService,
    private popoverCtrl: PopoverController,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private sqliteService: SqliteService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private api : ApiService
  ) {}

  ngOnInit() {
    this.currentUserId = this.authService?.authData?.userId
      ? String(this.authService.authData.userId)
      : localStorage.getItem('userId') || '';
    this.currentUserName = this.authService?.authData?.name
      ? String(this.authService.authData.name)
      : localStorage.getItem('name') || '';
    this.currentUserPhone = this.authService?.authData?.phone_number || '';
  }

  async ionViewWillEnter() {
    this.route.queryParams.subscribe((params) => {
      const cid = params['receiverId'] || params['communityId'] || params['id'];
      if (!cid) return;
      
      // ✅ If community changed, cleanup old listeners
      if (this.communityId && this.communityId !== cid) {
        this.cleanupListeners();
      }
      
      this.communityId = cid;
      this.setupRealtimeListeners();
    });
  }

  ionViewWillLeave() {
    // ✅ Cleanup when leaving page
    this.cleanupListeners();
  }

  ngOnDestroy() {
    // ✅ Cleanup when component destroyed
    this.cleanupListeners();
  }

  /**
   * ✅ NEW: Setup real-time listeners for community and its groups
   */
  private async setupRealtimeListeners() {
    if (!this.communityId) return;
    
    this.loading = true;

    try {
      const db = getDatabase();
      const communityRef = ref(db, `communities/${this.communityId}`);

      // ✅ Listen to community changes
      this.communityListener = onValue(communityRef, async (snapshot) => {
        if (!snapshot.exists()) {
          console.warn('Community not found');
          this.loading = false;
          return;
        }

        this.community = snapshot.val();
        console.log('Community updated:', this.community);

        this.isCreator = this.community.createdBy === this.currentUserId;
        this.memberCount = Object.keys(this.community.members || {}).length;

        // ✅ Get group IDs from community
        const groupIds = Object.keys(this.community.groups || {});
        this.groupCount = groupIds.length;

        // ✅ Remove listeners for groups that no longer exist
        for (const [gid, cleanup] of this.groupListeners.entries()) {
          if (!groupIds.includes(gid)) {
            cleanup();
            this.groupListeners.delete(gid);
            this.removeGroupFromUI(gid);
          }
        }

        // ✅ Setup listeners for each group
        for (const groupId of groupIds) {
          if (!this.groupListeners.has(groupId)) {
            this.listenToGroup(groupId);
          }
        }

        this.loading = false;
      });

    } catch (err) {
      console.error('setupRealtimeListeners error', err);
      this.loading = false;
      
      const toast = await this.toastCtrl.create({
        message: 'Failed to load community details',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  /**
   * ✅ NEW: Listen to individual group changes
   */
  private listenToGroup(groupId: string) {
    const db = getDatabase();
    const groupRef = ref(db, `groups/${groupId}`);

    const unsubscribe = onValue(groupRef, async (snapshot) => {
      if (!snapshot.exists()) {
        // Group deleted
        this.removeGroupFromUI(groupId);
        return;
      }

      const groupData = snapshot.val();
      const isMember = groupData.members && 
                       Object.keys(groupData.members).includes(this.currentUserId);

      const group = this.convertToConversation(
        {
          ...groupData,
          id: groupId,
          roomId: groupId,
        },
        isMember
      );

      this.updateGroupInUI(group);
    });

    this.groupListeners.set(groupId, unsubscribe);
  }

  /**
   * ✅ NEW: Update group in UI
   */
  private updateGroupInUI(group: CommunityGroup) {
    const groupName = group.name || group.title || '';
    
    // ✅ Update Announcement Group
    if (groupName === 'Announcements') {
      this.announcementGroup = group;
      return;
    }

    // ✅ Update General Group
    if (groupName === 'General') {
      this.generalGroup = group;
      return;
    }

    // ✅ Update other groups
    if (group.isMember) {
      // Remove from available if exists
      this.groupsAvailable = this.groupsAvailable.filter(
        g => g.roomId !== group.roomId
      );

      // Update or add to groupsIn
      const existingIndex = this.groupsIn.findIndex(
        g => g.roomId === group.roomId
      );
      
      if (existingIndex >= 0) {
        this.groupsIn[existingIndex] = group;
      } else {
        this.groupsIn.push(group);
      }

      // Sort by creation date
      this.groupsIn.sort((a, b) => 
        (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0)
      );
    } else {
      // Remove from groupsIn if exists
      this.groupsIn = this.groupsIn.filter(
        g => g.roomId !== group.roomId
      );

      // Update or add to groupsAvailable
      const existingIndex = this.groupsAvailable.findIndex(
        g => g.roomId === group.roomId
      );
      
      if (existingIndex >= 0) {
        this.groupsAvailable[existingIndex] = group;
      } else {
        this.groupsAvailable.push(group);
      }

      // Sort alphabetically
      this.groupsAvailable.sort((a, b) =>
        (a.title || '').localeCompare(b.title || '')
      );
    }

    console.log('UI updated for group:', group.roomId);
  }

  /**
   * ✅ NEW: Remove group from UI
   */
  private removeGroupFromUI(groupId: string) {
    // Remove from announcement
    if (this.announcementGroup?.roomId === groupId) {
      this.announcementGroup = null;
    }

    // Remove from general
    if (this.generalGroup?.roomId === groupId) {
      this.generalGroup = null;
    }

    // Remove from groupsIn
    this.groupsIn = this.groupsIn.filter(g => g.roomId !== groupId);

    // Remove from groupsAvailable
    this.groupsAvailable = this.groupsAvailable.filter(g => g.roomId !== groupId);

    console.log('Group removed from UI:', groupId);
  }

  /**
   * ✅ NEW: Cleanup all listeners
   */
  private cleanupListeners() {
    // Cleanup community listener
    if (this.communityListener) {
      try {
        this.communityListener();
      } catch (e) {
        console.warn('Error cleaning up community listener:', e);
      }
      this.communityListener = null;
    }

    // Cleanup group listeners
    for (const [gid, cleanup] of this.groupListeners.entries()) {
      try {
        cleanup();
      } catch (e) {
        console.warn(`Error cleaning up listener for group ${gid}:`, e);
      }
    }
    this.groupListeners.clear();

    console.log('All listeners cleaned up');
  }

  /**
   * ✅ LEGACY: Keep for manual refresh (if needed)
   */
  async loadCommunityDetail() {
    if (!this.communityId) return;
    this.loading = true;

    try {
      this.community = await this.firebaseService.getCommunityDetails(
        this.communityId
      );
      console.log('Community details:', this.community);

      if (!this.community) {
        this.memberCount = 0;
        this.groupCount = 0;
        this.loading = false;
        return;
      }

      this.isCreator = this.community.createdBy === this.currentUserId;
      this.memberCount = Object.keys(this.community.members || {}).length;

      await this.syncGroupsWithFirebase();
      await this.getAllGroups();
    } catch (err) {
      console.error('loadCommunityDetail error', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to load community details',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.loading = false;
    }
  }

  async getAllGroups() {
    try {
      const groupIds = Object.keys(this.community.groups);
      const db = getDatabase();
      
      this.allCommunityGroups = [];
      
      for (const groupId of groupIds) {
        const groupRef = ref(db, `groups/${groupId}`);
        const groupSnapshot = await rtdbGet(groupRef);
        const group = groupSnapshot.val();
        
        if (group) {
          this.allCommunityGroups.push(group);
        }
      }
      
      console.log("all groups", this.allCommunityGroups);
    } catch (error) {
      console.error("something went wrong", error);
    }
  }

  /**
   * 🔹 Sync groups with Firebase (background)
   */
  private async syncGroupsWithFirebase() {
    try {
      const announcementGroup = this.firebaseService.currentConversations.find(
        (c) =>
          c.title === 'Announcements' &&
          c.communityId === this.communityId
      );
      
      if (announcementGroup) {
        this.announcementGroup = this.convertToConversation(
          announcementGroup,
          true
        );
      }

      const generalGroup = this.firebaseService.currentConversations.find(
        (c) =>
          c.title === 'General' &&
          c.communityId === this.communityId
      );
      
      if (generalGroup) {
        this.generalGroup = this.convertToConversation(generalGroup, true);
      }

      const allGroups = this.firebaseService.currentConversations.filter(
        (c) => c.type === 'group' && c.communityId === this.communityId
      );

      this.groupsIn = allGroups
        .filter(
          (c) =>
            c.members?.includes(this.currentUserId) &&
            c.title != 'Announcements' &&
            c.title != 'General'
        )
        .map((g) => this.convertToConversation(g, true));

      this.groupsAvailable = allGroups
        .filter(
          (c) =>
            !c.members?.includes(this.currentUserId) &&
            c.title != 'Announcements' &&
            c.title != 'General'
        )
        .map((g) => this.convertToConversation(g, false));

      this.groupCount = allGroups.length;
    } catch (error) {
      console.error('Error syncing with Firebase:', error);
    }
  }

  /**
   * 🔹 Convert Firebase group to IConversation format
   */
  private convertToConversation(group: any, isMember: boolean): CommunityGroup {
    const title = group.name || group.title || 'Unnamed Group';
    const roomId = group.id || group.roomId;
    const members = group.members ? Object.keys(group.members) : [];

    return {
      roomId: roomId,
      id: roomId,
      title: title,
      name: title,
      description: group.description || '',
      type: 'group',
      avatar: group.avatar || '',
      members: members,
      adminIds: group.adminIds || [],
      createdAt: group.createdAt ? new Date(group.createdAt) : new Date(),
      updatedAt: new Date(),
      lastMessage: '',
      lastMessageType: 'text',
      unreadCount: 0,
      isArchived: false,
      isPinned: false,
      isLocked: false,
      membersCount: members.length || 0,
      isMember: isMember,
    } as CommunityGroup;
  }

  /**
   * 🔹 Save groups to SQLite
   */
  private async saveGroupsToSQLite() {
    try {
      const allGroups = [
        this.announcementGroup,
        this.generalGroup,
        ...this.groupsIn,
        ...this.groupsAvailable,
      ].filter(Boolean) as CommunityGroup[];

      for (const group of allGroups) {
        await this.sqliteService.createConversation({
          ...group,
          ownerId: this.currentUserId
        });
      }

      console.log('✅ Groups saved to SQLite');
    } catch (error) {
      console.error('Error saving groups to SQLite:', error);
    }
  }

  goToaddgroupcommunity() {
    this.router.navigate(['/add-group-community'], {
      queryParams: { communityId: this.communityId },
    });
  }

async openGroupPreview(group: any) {
    if (!group) return;
    
    const groupId = group.roomId || group.id;
    
    // Fetch group avatar from API
    let groupAvatar = 'assets/images/user.jfif';
    try {
      const res: any = await firstValueFrom(this.api.getGroupDp(groupId));
      groupAvatar = res?.group_dp_url || 'assets/images/user.jfif';
      console.log('✅ Group avatar fetched:', groupAvatar);
    } catch (err) {
      console.error('❌ Error loading group avatar:', err);
      groupAvatar = 'assets/images/user.jfif';
    }
    // console.log("group avatar",groupAvatar)
    
    const groupData = {
      roomId: groupId,
      id: groupId,
      name: group.name || group.title,
      title: group.name || group.title,
      description: group.description || '',
      membersCount: group.membersCount || 0,
      members: group.members || [],
      createdBy: group.createdBy || '',
      createdByName: group.createdByName || '',
      createdAt: group.createdAt,
      avatar: groupAvatar,
      communityId: this.communityId,
    };
    
    console.log('Opening group preview with data:', groupData);
    
    const modal = await this.modalCtrl.create({
      component: GroupPreviewModalComponent,
      componentProps: {
        group: groupData,
        communityName: this.community?.title || this.community?.name || '',
        currentUserId: this.currentUserId,
        currentUserName: this.currentUserName,
        currentUserPhone: this.currentUserPhone,
      },
      cssClass: 'group-preview-modal-wrapper',
      breakpoints: [0, 0.45, 0.9],
      initialBreakpoint: 0.45,
      backdropDismiss: true,
    });
    
    await modal.present();
    
    const { data } = await modal.onDidDismiss();
    if (data && data.action === 'join' && data.groupId) {
      await this.joinGroup(data.groupId);
    }
  }

  async joinGroup(groupId: string) {
    if (!this.currentUserId) {
      const t = await this.toastCtrl.create({
        message: 'Please login to join group',
        duration: 1800,
        color: 'danger',
      });
      await t.present();
      return;
    }

    try {
      const result = await this.firebaseService.joinCommunityGroup(
        groupId,
        this.currentUserId,
        {
          username: this.currentUserName,
          phoneNumber: this.currentUserPhone,
        }
      );

      if (result.success) {
        // ✅ Real-time listener will automatically update UI
        const toast = await this.toastCtrl.create({
          message: result.message,
          duration: 1600,
          color: 'success',
        });
        await toast.present();
      } else {
        const toast = await this.toastCtrl.create({
          message: result.message,
          duration: 1800,
          color: result.message.includes('already') ? 'medium' : 'danger',
        });
        await toast.present();
      }
    } catch (err) {
      console.error('joinGroup error', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to join group',
        duration: 1800,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async leaveGroup(groupId: string) {
    if (!this.currentUserId) {
      const toast = await this.toastCtrl.create({
        message: 'User not found',
        duration: 1800,
        color: 'danger',
      });
      await toast.present();
      return;
    }

    try {
      const result = await this.firebaseService.leaveCommunityGroup(
        groupId,
        this.currentUserId
      );

      if (result.success) {
        // ✅ Real-time listener will automatically update UI
        const toast = await this.toastCtrl.create({
          message: result.message,
          duration: 1600,
          color: 'success',
        });
        await toast.present();
      } else {
        const toast = await this.toastCtrl.create({
          message: result.message,
          duration: 1800,
          color: 'danger',
        });
        await toast.present();
      }
    } catch (err) {
      console.error('leaveGroup error', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to leave group',
        duration: 1800,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async openGroupChat(groupId: string | undefined, groupName?: string) {
    if (!groupId) {
      console.error('Invalid group ID');
      return;
    }

    const isMember =
      this.groupsIn.some((g) => g.roomId === groupId) ||
      (this.announcementGroup && this.announcementGroup.roomId === groupId) ||
      (this.generalGroup && this.generalGroup.roomId === groupId);

    if (!isMember) {
      const grp = this.groupsAvailable.find((g) => g.roomId === groupId) || {
        roomId: groupId,
        title: groupName,
      };
      this.openGroupPreview(grp);
      return;
    }

    const chatObject = {
      roomId: groupId,
      type: 'group',
      title: groupName || 'Group Chat',
      communityId: this.communityId,
    };

    await this.firebaseService.openChat(chatObject);

    this.router.navigate(['/community-chat'], {
      queryParams: {
        receiverId: groupId,
      },
    });
  }

  async openAnnouncementChat() {
    if (!this.announcementGroup) return;
    await this.openGroupChat(
      this.announcementGroup.roomId,
      this.announcementGroup.title
    );
  }

  async openGeneralChat() {
    if (!this.generalGroup) return;
    await this.openGroupChat(this.generalGroup.roomId, this.generalGroup.title);
  }

  back() {
    this.navCtrl.back();
  }

  async presentPopover(ev: any) {
    const pop = await this.popoverCtrl.create({
      component: CommunityMenuPopoverComponent,
      componentProps: {
        isCreator: this.isCreator,
      },
      event: ev,
      translucent: true,
    });

    await pop.present();

    const { data } = await pop.onDidDismiss();
    if (!data || !data.action) return;

    const action: string = data.action;
    switch (action) {
      case 'info':
        this.router.navigate(['/community-info'], {
          queryParams: { communityId: this.communityId },
        });
        break;
      case 'invite':
        this.router.navigate(['/invite-members'], {
          queryParams: { communityId: this.communityId },
        });
        break;
      case 'settings':
        this.router.navigate(['/community-settings'], {
          queryParams: { communityId: this.communityId },
        });
        break;
      case 'members':
        this.router.navigate(['/community-members'], {
          queryParams: { communityId: this.communityId },
        });
        break;
      case 'exit':
        this.exitCommunity();
        break;
      default:
        break;
    }
  }

  async exitCommunity() {
    if (!this.communityId || !this.currentUserId) {
      const toast = await this.toastCtrl.create({
        message: 'Unable to exit community',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
      return;
    }

    if (this.isCreator) {
      const toast = await this.toastCtrl.create({
        message: 'Creator cannot exit the community. Please assign a new owner first.',
        duration: 3000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Exit Community',
      message: `Are you sure you want to exit "${this.community.name || 'this community'}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Exit',
          role: 'destructive',
          handler: async () => {
            await this.performExitCommunity();
          },
        },
      ],
    });

    await alert.present();
  }

  private async performExitCommunity() {
    console.log("this exit community function called");
    const loading = await this.loadingCtrl.create({
      message: 'Exiting community...',
    });
    await loading.present();

    try {
      const result = await this.firebaseService.exitCommunity(
        this.communityId!,
        this.currentUserId
      );

      await loading.dismiss();

      if (result.success) {
        const toast = await this.toastCtrl.create({
          message: 'Successfully exited the community',
          duration: 2000,
          color: 'success',
        });
        await toast.present();

        this.router.navigate(['/home-screen'], { replaceUrl: true });
      } else {
        const toast = await this.toastCtrl.create({
          message: result.message,
          duration: 2000,
          color: 'danger',
        });
        await toast.present();
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Exit community error:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to exit community. Please try again.',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }
}