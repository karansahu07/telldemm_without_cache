import { Component, OnInit } from '@angular/core';
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
import { SqliteService, IConversation } from '../../../services/sqlite.service';

// Popover component
import { CommunityMenuPopoverComponent } from '../../components/community-menu-popover/community-menu-popover.component';

// Group preview modal component
import { GroupPreviewModalComponent } from '../../components/group-preview-modal/group-preview-modal.component';
import { AlertController } from '@ionic/angular';

interface CommunityGroup extends IConversation {
  membersCount?: number;
  isMember?: boolean;
  name?: string; // Alias for title
  description?: string; // Group description
  id?: string; // Alias for roomId
}

@Component({
  selector: 'app-community-detail',
  templateUrl: './community-detail.page.html',
  styleUrls: ['./community-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class CommunityDetailPage implements OnInit {
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
  ) {}

  ngOnInit() {
    // Get current user info from authService
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
      this.communityId = cid;
      this.loadCommunityDetail();
    });
  }

  async loadCommunityDetail() {
  if (!this.communityId) return;
  this.loading = true;

  try {
    // Fetch community details from Firebase
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
    console.log('Is Creator:', this.isCreator, 'Created By:', this.community.createdBy, 'Current User:', this.currentUserId);

    // Get member count
    this.memberCount = Object.keys(this.community.members || {}).length;

    // Sync groups with Firebase
    await this.syncGroupsWithFirebase();
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

  /**
   * 🔹 Sync groups with Firebase (background)
   */
  private async syncGroupsWithFirebase() {
    try {
      // Fetch fresh data from Firebase
      // const groupsData =
      //   await this.firebaseService.getCommunityGroupsWithDetails(
      //     this.communityId!,
      //     this.currentUserId
      //   );

      // Update announcement group
      console.log("this.firebaseService.currentConversations",this.firebaseService.currentConversations)
      const announcementGroup = this.firebaseService.currentConversations.find(
        (c) =>
          c.title === 'Announcements' &&
          c.communityId === this.communityId
      );
      // console.log({announcementGroup})
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
      // console.log({generalGroup})
      // Update general group
      if (generalGroup) {
        this.generalGroup = this.convertToConversation(generalGroup, true);
      }

      const allGroups = this.firebaseService.currentConversations.filter(
        (c) => c.type === 'group' && c.communityId === this.communityId
      );
      // Update member groups
      // console.log({allGroups})
      this.groupsIn = allGroups
        .filter(
          (c) =>
            c.members?.includes(this.currentUserId) &&
            c.title != 'Announcements' &&
            c.title != 'General'
        )
        .map((g) => this.convertToConversation(g, true));
        // console.log("this groupIn",this.groupsIn)
      // Update available groups
      this.groupsAvailable = allGroups
        .filter(
          (c) =>
            !c.members?.includes(this.currentUserId) &&
            c.title != 'Announcements' &&
            c.title != 'General'
        )
        .map((g) => this.convertToConversation(g, false));
        // console.log("this.groupsAvailable",this.groupsAvailable)
      // Update group count
      this.groupCount = allGroups.length;
      // console.log("this group count", this.groupCount)
      // if (this.announcementGroup) this.groupCount++;
      // if (this.generalGroup) this.groupCount++;
      //   console.log(this.firebaseService.currentConversations)
      // console.log({announcementGroup})
      // console.log({generalGroup})
      // console.log({allGroups})
      // console.log(this.groupsIn)
      // console.log(this.groupsAvailable)
      // console.log()

      // Save to SQLite for next time
      // await this.saveGroupsToSQLite();            //this will perform
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

    return {
      roomId: roomId,
      id: roomId, // Alias for compatibility
      title: title,
      name: title, // Alias for compatibility
      description: group.description || '', // Add description field
      type: 'group',
      avatar: group.avatar || '',
      members: group.members ? Object.keys(group.members) : [],
      adminIds: group.adminIds || [],
      createdAt: group.createdAt ? new Date(group.createdAt) : new Date(),
      updatedAt: new Date(),
      lastMessage: '',
      lastMessageType: 'text',
      unreadCount: 0,
      isArchived: false,
      isPinned: false,
      isLocked: false,
      membersCount: group.members.length || 0,
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
        await this.sqliteService.createConversation(group);
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

  // Prepare group data with all necessary fields
  const groupData = {
    roomId: group.roomId || group.id,
    id: group.roomId || group.id,
    name: group.name || group.title,
    title: group.name || group.title,
    description: group.description || '',
    membersCount: group.membersCount || 0,
    members: group.members || [],
    createdBy: group.createdBy || '',
    createdByName: group.createdByName || '',
    createdAt: group.createdAt,
    avatar: group.avatar || '',
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
        // Move group from available to joined locally
        const idx = this.groupsAvailable.findIndex((g) => g.roomId === groupId);
        if (idx > -1) {
          const group = this.groupsAvailable.splice(idx, 1)[0];
          group.membersCount = (group.membersCount || 0) + 1;
          group.isMember = true;
          this.groupsIn.unshift(group);

          // Update SQLite
          await this.sqliteService.createConversation(group);
        } else {
          // Reload if not found locally
          await this.loadCommunityDetail();
        }

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
        // Move group from joined to available locally
        const idx = this.groupsIn.findIndex((g) => g.roomId === groupId);
        if (idx > -1) {
          const group = this.groupsIn.splice(idx, 1)[0];
          group.membersCount = Math.max(0, (group.membersCount || 0) - 1);
          group.isMember = false;
          this.groupsAvailable.push(group);

          // Re-sort available groups
          this.groupsAvailable.sort((a, b) =>
            (a.title || '').localeCompare(b.title || '')
          );

          // Update SQLite
          await this.sqliteService.createConversation(group);
        }

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
      isCreator: this.isCreator, // ✅ PASS isCreator prop
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
      // ✅ NEW: Navigate to members page
      this.router.navigate(['/community-members'], {
        queryParams: { communityId: this.communityId },
      });
      break;
    case 'exit':
      // ✅ NEW: Handle exit community
      // this.exitCommunity();
      break;
    default:
      break;
  }
}

// Add exitCommunity() method:
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

      // Navigate back to chats
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
