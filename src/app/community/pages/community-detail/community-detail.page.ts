// import { Component, OnInit } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import {
//   IonicModule,
//   NavController,
//   PopoverController,
//   ModalController,
//   ToastController,
// } from '@ionic/angular';
// import { ActivatedRoute, Router } from '@angular/router';
// import { FirebaseChatService } from '../../../services/firebase-chat.service';
// import { AuthService } from 'src/app/auth/auth.service';

// // Popover component
// import { CommunityMenuPopoverComponent } from '../../components/community-menu-popover/community-menu-popover.component';

// // Group preview modal component
// import { GroupPreviewModalComponent } from '../../components/group-preview-modal/group-preview-modal.component';

// @Component({
//   selector: 'app-community-detail',
//   templateUrl: './community-detail.page.html',
//   styleUrls: ['./community-detail.page.scss'],
//   standalone: true,
//   imports: [IonicModule, CommonModule],
// })
// export class CommunityDetailPage implements OnInit {
//   communityId: string | null = null;
//   community: any = null;
//   announcementGroup: any = null;
//   generalGroup: any = null;
//   groupsIn: any[] = [];
//   groupsAvailable: any[] = [];
//   loading = false;

//   memberCount = 0;
//   groupCount = 0;

//   currentUserId: string = '';
//   currentUserName: string = '';
//   currentUserPhone: string = '';

//   constructor(
//     private navCtrl: NavController,
//     private route: ActivatedRoute,
//     private router: Router,
//     private firebaseService: FirebaseChatService,
//     private popoverCtrl: PopoverController,
//     private modalCtrl: ModalController,
//     private toastCtrl: ToastController,
//     private authService: AuthService
//   ) {}

//   ngOnInit() {
//     // Get current user info from authService
//     this.currentUserId = this.authService?.authData?.userId
//       ? String(this.authService.authData.userId)
//       : localStorage.getItem('userId') || '';
//     this.currentUserName = this.authService?.authData?.name
//       ? String(this.authService.authData.name)
//       : localStorage.getItem('name') || '';
//     this.currentUserPhone = this.authService?.authData?.phone_number
//       ? String(this.authService.authData.phone_number)
//       : localStorage.getItem('phone') || '';

//     // Get communityId from query params (receiverId)
//   }
//   async ionViewWillEnter() {
//     this.route.queryParams.subscribe((params) => {
//       const cid = params['receiverId'] || params['communityId'] || params['id'];
//       if (!cid) return;
//       this.communityId = cid;
//       this.loadCommunityDetail();
//     });
//   }

//   async loadCommunityDetail() {
//     if (!this.communityId) return;
//     this.loading = true;

//     try {
//       // Fetch community details using service
//       this.community = await this.firebaseService.getCommunityDetails(
//         this.communityId
//       );
//       console.log('this.community', this.community);

//       if (!this.community) {
//         this.memberCount = 0;
//         this.groupCount = 0;
//         this.loading = false;
//         return;
//       }

//       // Get member count
//       this.memberCount = await this.firebaseService.getCommunityMemberCount(
//         this.communityId
//       );

//       // Fetch all groups in the community with details
//       const groupsData =
//         await this.firebaseService.getCommunityGroupsWithDetails(
//           this.communityId,
//           this.currentUserId
//         );

//       // Set groups data
//       this.announcementGroup = groupsData.announcementGroup;
//       this.generalGroup = groupsData.generalGroup;
//       this.groupsIn = groupsData.memberGroups;
//       this.groupsAvailable = groupsData.availableGroups;

//       // Update group count (including ALL groups: Announcements, General, and others)
//       this.groupCount = groupsData.otherGroups.length;
//       if (this.announcementGroup) this.groupCount++;
//       if (this.generalGroup) this.groupCount++;
//     } catch (err) {
//       console.error('loadCommunityDetail error', err);
//       const toast = await this.toastCtrl.create({
//         message: 'Failed to load community details',
//         duration: 2000,
//         color: 'danger',
//       });
//       await toast.present();
//     } finally {
//       this.loading = false;
//     }
//   }

//   goToaddgroupcommunity() {
//     this.router.navigate(['/add-group-community'], {
//       queryParams: { communityId: this.communityId },
//     });
//   }

//   async openGroupPreview(group: any) {
//     if (!group) return;

//     const modal = await this.modalCtrl.create({
//       component: GroupPreviewModalComponent,
//       componentProps: {
//         group,
//         communityName: this.community?.title || this.community?.name || '',
//         currentUserId: this.currentUserId,
//         currentUserName: this.currentUserName,
//         currentUserPhone: this.currentUserPhone,
//       },
//       cssClass: 'group-preview-modal-wrapper',
//       breakpoints: [0, 0.45, 0.9],
//       initialBreakpoint: 0.45,
//       backdropDismiss: true,
//     });

//     await modal.present();
//     const { data } = await modal.onDidDismiss();

//     if (data && data.action === 'join' && data.groupId) {
//       await this.joinGroup(data.groupId);
//     }
//   }

//   async joinGroup(groupId: string) {
//     if (!this.currentUserId) {
//       const t = await this.toastCtrl.create({
//         message: 'Please login to join group',
//         duration: 1800,
//         color: 'danger',
//       });
//       await t.present();
//       return;
//     }

//     try {
//       // Use service method to join group
//       const result = await this.firebaseService.joinCommunityGroup(
//         groupId,
//         this.currentUserId,
//         {
//           username: this.currentUserName,
//           phoneNumber: this.currentUserPhone,
//         }
//       );

//       if (result.success) {
//         // Move group from available to joined
//         const idx = this.groupsAvailable.findIndex((g) => g.id === groupId);
//         if (idx > -1) {
//           const group = this.groupsAvailable.splice(idx, 1)[0];
//           group.membersCount = (group.membersCount || 0) + 1;
//           this.groupsIn.unshift(group);
//         } else {
//           // Reload if group not found locally
//           await this.loadCommunityDetail();
//         }

//         const toast = await this.toastCtrl.create({
//           message: result.message,
//           duration: 1600,
//           color: 'success',
//         });
//         await toast.present();
//       } else {
//         const toast = await this.toastCtrl.create({
//           message: result.message,
//           duration: 1800,
//           color: result.message.includes('already') ? 'medium' : 'danger',
//         });
//         await toast.present();
//       }
//     } catch (err) {
//       console.error('joinGroup error', err);
//       const toast = await this.toastCtrl.create({
//         message: 'Failed to join group',
//         duration: 1800,
//         color: 'danger',
//       });
//       await toast.present();
//     }
//   }

//   async leaveGroup(groupId: string) {
//     if (!this.currentUserId) {
//       const toast = await this.toastCtrl.create({
//         message: 'User not found',
//         duration: 1800,
//         color: 'danger',
//       });
//       await toast.present();
//       return;
//     }

//     try {
//       // Use service method to leave group
//       const result = await this.firebaseService.leaveCommunityGroup(
//         groupId,
//         this.currentUserId
//       );

//       if (result.success) {
//         // Move group from joined to available
//         const idx = this.groupsIn.findIndex((g) => g.id === groupId);
//         if (idx > -1) {
//           const group = this.groupsIn.splice(idx, 1)[0];
//           group.membersCount = Math.max(0, (group.membersCount || 0) - 1);
//           this.groupsAvailable.push(group);

//           // Re-sort available groups
//           this.groupsAvailable.sort((a, b) =>
//             (a.name || '').localeCompare(b.name || '')
//           );
//         }

//         const toast = await this.toastCtrl.create({
//           message: result.message,
//           duration: 1600,
//           color: 'success',
//         });
//         await toast.present();
//       } else {
//         const toast = await this.toastCtrl.create({
//           message: result.message,
//           duration: 1800,
//           color: 'danger',
//         });
//         await toast.present();
//       }
//     } catch (err) {
//       console.error('leaveGroup error', err);
//       const toast = await this.toastCtrl.create({
//         message: 'Failed to leave group',
//         duration: 1800,
//         color: 'danger',
//       });
//       await toast.present();
//     }
//   }

//   async openGroupChat(groupId: string, groupName?: string) {
//     // console.log({})
//     // Check if user is a member
//     const isMember =
//       this.groupsIn.some((g) => g.id === groupId) ||
//       (this.announcementGroup && this.announcementGroup.id === groupId) ||
//       (this.generalGroup && this.generalGroup.id === groupId);

//     if (!isMember) {
//       // If not a member, show preview modal
//       const grp = this.groupsAvailable.find((g) => g.id === groupId) || {
//         id: groupId,
//         name: groupName,
//       };
//       this.openGroupPreview(grp);
//       return;
//     }
//     // ✅ CREATE CHAT OBJECT (similar to home screen)
//     const chatObject = {
//       roomId: groupId,
//       type: 'group',
//       title: groupName || 'Group Chat',
//       communityId: this.communityId,
//     };

//     // ✅ CALL FIREBASE SERVICE (unread count reset)
//     await this.firebaseService.openChat(chatObject);

//     // ✅ NAVIGATE TO CHATTING SCREEN
//     this.router.navigate(['/community-chat'], {
//       queryParams: {
//         receiverId: groupId,
//       },
//     });
//   }

//   // Open announcement group chat
//   async openAnnouncementChat() {
//     if (!this.announcementGroup) return;
//     await this.openGroupChat(
//       this.announcementGroup.id,
//       this.announcementGroup.name
//     );
//   }

//   // Open general group chat
//   async openGeneralChat() {
//     if (!this.generalGroup) return;
//     await this.openGroupChat(this.generalGroup.id, this.generalGroup.name);
//   }
//   back() {
//     this.navCtrl.back();
//   }

//   async presentPopover(ev: any) {
//     const pop = await this.popoverCtrl.create({
//       component: CommunityMenuPopoverComponent,
//       event: ev,
//       translucent: true,
//     });

//     await pop.present();

//     const { data } = await pop.onDidDismiss();
//     if (!data || !data.action) return;

//     const action: string = data.action;
//     switch (action) {
//       case 'info':
//         this.router.navigate(['/community-info'], {
//           queryParams: { communityId: this.communityId },
//         });
//         break;
//       case 'invite':
//         this.router.navigate(['/invite-members'], {
//           queryParams: { communityId: this.communityId },
//         });
//         break;
//       case 'settings':
//         this.router.navigate(['/community-settings'], {
//           queryParams: { communityId: this.communityId },
//         });
//         break;
//       default:
//         break;
//     }
//   }
// }

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  NavController,
  PopoverController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseChatService } from '../../../services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { SqliteService, IConversation } from '../../../services/sqlite.service';

// Popover component
import { CommunityMenuPopoverComponent } from '../../components/community-menu-popover/community-menu-popover.component';

// Group preview modal component
import { GroupPreviewModalComponent } from '../../components/group-preview-modal/group-preview-modal.component';

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

  constructor(
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private router: Router,
    private firebaseService: FirebaseChatService,
    private popoverCtrl: PopoverController,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private sqliteService: SqliteService
  ) {}

  ngOnInit() {
    // Get current user info from authService
    this.currentUserId = this.authService?.authData?.userId
      ? String(this.authService.authData.userId)
      : localStorage.getItem('userId') || '';
    this.currentUserName = this.authService?.authData?.name
      ? String(this.authService.authData.name)
      : localStorage.getItem('name') || '';
    this.currentUserPhone = this.authService?.authData?.phone_number
      ? String(this.authService.authData.phone_number)
      : localStorage.getItem('phone') || '';
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
      // 1️⃣ Load from SQLite first (instant UI)
      // await this.loadGroupsFromSQLite();
      console.time('loading community');
      // 2️⃣ Fetch community details from Firebase
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

      // 3️⃣ Get member count
      // this.memberCount = await this.firebaseService.getCommunityMemberCount(
      //   this.communityId
      // );
      this.memberCount = Object.keys(this.community.members).length;

      // 4️⃣ Sync with Firebase (background update)
      await this.syncGroupsWithFirebase();
      console.timeEnd('loading community');
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
   * 🔹 Load groups from SQLite (instant)
   */
  private async loadGroupsFromSQLite() {
    try {
      // Get all conversations from SQLite
      // const allConversations = await this.sqliteService.getConversations();

      // Filter groups that belong to this community
      const communityGroups = this.firebaseService.currentConversations.filter(
        (conv) => conv.type === 'group' && conv.communityId === this.communityId
      ) as CommunityGroup[];

      console.log('Groups from SQLite:', communityGroups);

      // Reset arrays
      this.announcementGroup = null;
      this.generalGroup = null;
      this.groupsIn = [];
      this.groupsAvailable = [];

      // Categorize groups
      for (const group of communityGroups) {
        const groupTitle = (group.title || '').toLowerCase();
        const isMember = group.members?.includes(this.currentUserId) || false;

        // Add member status and aliases
        group.isMember = isMember;
        group.membersCount = group.members?.length || 0;
        group.name = group.title; // Add name alias
        group.id = group.roomId; // Add id alias
        group.description = ''; // Will be updated from Firebase

        // Categorize by title
        if (groupTitle === 'announcements') {
          this.announcementGroup = group;
        } else if (groupTitle === 'general') {
          this.generalGroup = group;
        } else {
          if (isMember) {
            this.groupsIn.push(group);
          } else {
            this.groupsAvailable.push(group);
          }
        }
      }

      // Update group count
      this.groupCount = communityGroups.length;

      console.log('Categorized groups:', {
        announcement: this.announcementGroup,
        general: this.generalGroup,
        joined: this.groupsIn,
        available: this.groupsAvailable,
      });
    } catch (error) {
      console.error('Error loading groups from SQLite:', error);
    }
  }

  /**
   * 🔹 Check if group belongs to this community
   */
  private isGroupInCommunity(roomId: string): boolean {
    // Groups in community have roomId pattern: communityId_groupname or groupId with communityId prefix
    return roomId.includes(this.communityId || '');
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
      // await this.saveGroupsToSQLite();
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

    const modal = await this.modalCtrl.create({
      component: GroupPreviewModalComponent,
      componentProps: {
        group,
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
    // Validate groupId
    if (!groupId) {
      console.error('Invalid group ID');
      return;
    }

    // Check if user is a member
    const isMember =
      this.groupsIn.some((g) => g.roomId === groupId) ||
      (this.announcementGroup && this.announcementGroup.roomId === groupId) ||
      (this.generalGroup && this.generalGroup.roomId === groupId);

    if (!isMember) {
      // If not a member, show preview modal
      const grp = this.groupsAvailable.find((g) => g.roomId === groupId) || {
        roomId: groupId,
        title: groupName,
      };
      this.openGroupPreview(grp);
      return;
    }

    // ✅ CREATE CHAT OBJECT (similar to home screen)
    const chatObject = {
      roomId: groupId,
      type: 'group',
      title: groupName || 'Group Chat',
      communityId: this.communityId,
    };

    // ✅ CALL FIREBASE SERVICE (unread count reset)
    await this.firebaseService.openChat(chatObject);

    // ✅ NAVIGATE TO CHATTING SCREEN
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
      default:
        break;
    }
  }
}
