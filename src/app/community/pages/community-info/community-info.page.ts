import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  IonContent,
  NavController,
  IonRouterOutlet,
  ToastController,
  AlertController,
  LoadingController,
  ActionSheetController,
} from '@ionic/angular';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { firstValueFrom } from 'rxjs';
import { ApiService } from 'src/app/services/api/api.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-community-info',
  templateUrl: './community-info.page.html',
  styleUrls: ['./community-info.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class CommunityInfoPage implements OnInit {
  @ViewChild(IonContent, { static: true }) content!: IonContent;

  communityId: string | null = null;
  communityName: string | null = null;
  memberCount = 0;
  groupCount = 0;
  isScrolled: boolean = false;
  chatTitle = 'Test';
  currentUserId: string = '';
  isCreator: boolean = false;
  loading = false;

  communityMembers: any[] = [];
  adminIds: string[] = [];

  activeSection: 'community' | 'announcements' = 'community';

  community: any = {
    name: '',
    icon: '',
    description:
      'Hi everyone! This community is for members to chat in topic-based groups and get important announcements.',
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private service: ApiService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private actionSheetCtrl: ActionSheetController,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const cid = params['communityId'] || '';
      this.communityId = cid;
      console.log('community id is', this.communityId);
    });
  }

  ionViewWillEnter() {
    this.route.queryParams.subscribe((params) => {
      const cid = params['communityId'] || '';
      this.communityId = cid;
      console.log('community id is', this.communityId);
    });

    this.currentUserId = this.authService?.authData?.userId || '';
    const allGroups = this.firebaseService.currentConversations.filter(
      (c) => c.type === 'group' && c.communityId === this.communityId
    );
    this.groupCount = allGroups.length;
    this.loadCommunityDetail();
  }

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
        this.communityMembers = [];
        this.loading = false;
        return;
      }

      this.isCreator = this.community.ownerId === this.currentUserId;
      console.log(
        'Is Owner (Current):',
        this.isCreator,
        'Owner ID:',
        this.community.ownerId,
        'Original Creator:',
        this.community.createdBy,
        'Current User:',
        this.currentUserId
      );

      this.adminIds = this.community.adminIds || [];

      this.memberCount = Object.keys(this.community.members || {}).length;

      await this.fetchCommunityMembersWithProfiles();
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

  async fetchCommunityMembersWithProfiles() {
    if (!this.community?.members) {
      this.communityMembers = [];
      return;
    }

    const members = this.community.members || {};
    console.log({ members });
    const memberIds = Object.keys(members);
    console.log({ memberIds });
    
    // ✅ Use ownerId for current owner, createdBy for original creator
    const currentOwnerId = this.community.ownerId;
    const originalCreatorId = this.community.createdBy;
    
    console.log({ currentOwnerId, originalCreatorId });

    const memberPromises = memberIds.map(async (userId) => {
      const memberData = members[userId];
      console.log({ memberData });

      try {
        const userProfileRes: any = await firstValueFrom(
          this.service.getUserProfilebyId(userId)
        );
        console.log({ userProfileRes });

        return {
          user_id: userId,
          username: userProfileRes?.name || 'Unknown',
          phone: userProfileRes?.phone_number || '',
          phoneNumber: userProfileRes?.phone_number || '',
          avatar: userProfileRes?.profile || 'assets/images/user.jfif',
          isActive: memberData.isActive ?? true,
          isOwner: String(userId) === String(currentOwnerId), // ✅ Current owner
          isCreator: String(userId) === String(originalCreatorId), // ✅ Original creator
          status: userProfileRes.dp_status,
        };
      } catch (err) {
        console.warn(`Failed to fetch profile for user ${userId}`, err);

        return {
          user_id: userId,
          username: memberData.username || 'Unknown',
          phone: memberData.phoneNumber || '',
          phoneNumber: memberData.phoneNumber || '',
          avatar: 'assets/images/user.jfif',
          isActive: memberData.isActive ?? true,
          isOwner: String(userId) === String(currentOwnerId), // ✅ Current owner
          isCreator: String(userId) === String(originalCreatorId), // ✅ Original creator
        };
      }
    });

    let fetchedMembers = await Promise.all(memberPromises);
    fetchedMembers = fetchedMembers.filter((m) => m.isActive !== false);

    this.communityMembers = await this.membersWithDeviceNames(fetchedMembers);

    console.log('Community members with device names:', this.communityMembers);
  }

  async membersWithDeviceNames(communityMembers: any[]): Promise<any[]> {
    try {
      const deviceContacts = this.firebaseService.currentDeviceContacts || [];
      const currentUserId = this.authService.authData?.userId || '';

      return communityMembers.map((member) => {
        if (String(member.user_id) === String(currentUserId)) {
          return {
            ...member,
            username: 'You',
          };
        }

        const deviceContact = deviceContacts.find((dc) => {
          const memberPhone = (
            member.phoneNumber ||
            member.phone ||
            ''
          ).replace(/\D/g, '');
          const dcPhone = (dc.phoneNumber || '').replace(/\D/g, '');

          return memberPhone.slice(-10) === dcPhone.slice(-10);
        });

        return {
          ...member,
          username: deviceContact
            ? deviceContact.username
            : member.phoneNumber || member.phone || member.username,
        };
      });
    } catch (error) {
      console.error('Error mapping members with device names:', error);
      return communityMembers;
    }
  }

  isAdmin(userId: string): boolean {
    return this.adminIds.includes(String(userId));
  }

  // ✅ NEW: Open member action sheet (like userabout page)
  async openMemberActionSheet(member: any) {
    const isCurrentUserAdmin = this.isAdmin(this.currentUserId);
    const isTargetUserAdmin = this.isAdmin(member.user_id);
    const isSelf = String(member.user_id) === String(this.currentUserId);

    // Build buttons array based on permissions
    const buttons: any[] = [];

    // Message option - Available to everyone except self
    if (!isSelf) {
      buttons.push({
        text: this.translate.instant('common.message') || 'Message',
        icon: 'chatbox-outline',
        handler: () => this.messageMember(member),
      });
    }

    // Make Admin - Only for Creator when target is not admin
    if (this.isCreator && !isTargetUserAdmin && !isSelf) {
      buttons.push({
        text: this.translate.instant('community.makeAdmin') || 'Make community admin',
        icon: 'person-add-outline',
        handler: () => this.makeCommunityAdmin(member),
      });
    }

    // Dismiss Admin - Only for Creator when target is admin
    if (this.isCreator && isTargetUserAdmin && !isSelf) {
      buttons.push({
        text: this.translate.instant('community.dismissAdmin') || 'Dismiss as admin',
        icon: 'remove-circle-outline',
        handler: () => this.dismissCommunityAdmin(member),
      });
    }

    // Remove Member - Only for Creator
    if (this.isCreator && !isSelf) {
      buttons.push({
        text: this.translate.instant('community.removeMember') || 'Remove from community',
        icon: 'person-remove-outline',
        role: 'destructive',
        handler: () => this.removeCommunityMember(member),
      });
    }

    // Cancel button
    buttons.push({
      text: this.translate.instant('common.cancel') || 'Cancel',
      role: 'cancel',
    });

    // Create and present ActionSheet
    const actionSheet = await this.actionSheetCtrl.create({
      header: member.username || 'Member',
      buttons: buttons,
    });

    await actionSheet.present();
  }

  // ✅ NEW: Message a member
  async messageMember(member: any) {
    const senderId = this.authService.authData?.userId || '';
    const receiverId = member.user_id;

    if (!senderId || !receiverId) {
      const toast = await this.toastCtrl.create({
        message: 'Unable to open chat',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
      return;
    }

    await this.firebaseService.openChat(
      {
        receiver: {
          userId: receiverId,
          username: member.username || receiverId,
          phoneNumber: member.phoneNumber || member.phone || '',
        },
      },
      true
    );

    this.router.navigate(['/chatting-screen'], {
      queryParams: {
        receiverId: receiverId,
      },
    });
  }

  // ✅ NEW: Make community admin
  async makeCommunityAdmin(member: any) {
    if (!this.communityId || !member?.user_id) {
      console.error('Missing communityId or member.user_id');
      return;
    }

    try {
      const success = await this.firebaseService.makeCommunityAdmin(
        this.communityId,
        member.user_id
      );

      if (success) {
        this.adminIds.push(member.user_id);

        const toast = await this.toastCtrl.create({
          message: this.translate.instant('community.toasts.madeAdmin', {
            name: member.username,
          }),
          duration: 2000,
          color: 'success',
        });
        await toast.present();

        // Refresh members
        await this.loadCommunityDetail();
      } else {
        throw new Error('Failed to make admin');
      }
    } catch (error) {
      console.error('Error making admin:', error);
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('community.errors.makeAdmin', {
          name: member.username,
        }),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  // ✅ NEW: Dismiss community admin
  async dismissCommunityAdmin(member: any) {
    if (!this.communityId || !member?.user_id) {
      console.error('Missing communityId or member.user_id');
      return;
    }

    try {
      const success = await this.firebaseService.dismissCommunityAdmin(
        this.communityId,
        member.user_id
      );

      if (success) {
        this.adminIds = this.adminIds.filter((id) => id !== member.user_id);

        const toast = await this.toastCtrl.create({
          message: this.translate.instant('community.toasts.dismissedAdmin', {
            name: member.username,
          }),
          duration: 2000,
          color: 'medium',
        });
        await toast.present();

        // Refresh members
        await this.loadCommunityDetail();
      } else {
        throw new Error('Failed to dismiss admin');
      }
    } catch (error) {
      console.error('Error dismissing admin:', error);
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('community.errors.dismissAdmin', {
          name: member.username,
        }),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  // ✅ NEW: Remove community member
  async removeCommunityMember(member: any) {
    if (!this.communityId || !member?.user_id) {
      console.error('Missing communityId or member.user_id');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: this.translate.instant('community.alerts.removeMember.header'),
      message: this.translate.instant('community.alerts.removeMember.message', {
        name: member.username,
      }),
      buttons: [
        {
          text: this.translate.instant('common.cancel'),
          role: 'cancel',
        },
        {
          text: this.translate.instant('common.remove'),
          role: 'destructive',
          handler: async () => {
            await this.performRemoveMember(member);
          },
        },
      ],
    });

    await alert.present();
  }

  async performRemoveMember(member: any) {
    const loading = await this.loadingCtrl.create({
      message: 'Removing member...',
    });
    await loading.present();

    try {
      const success = await this.firebaseService.removeCommunityMember(
        this.communityId!,
        member.user_id
      );

      await loading.dismiss();

      if (success) {
        const toast = await this.toastCtrl.create({
          message: this.translate.instant('community.toasts.removedMember', {
            name: member.username,
          }),
          duration: 2000,
          color: 'success',
        });
        await toast.present();

        // Refresh members
        await this.loadCommunityDetail();
      } else {
        throw new Error('Failed to remove member');
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Error removing member:', error);

      const toast = await this.toastCtrl.create({
        message: this.translate.instant('community.errors.removeMember'),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  onScroll(event: any) {
    const scrollTop = event.detail.scrollTop;
    this.isScrolled = scrollTop > 10;
  }

  setDefaultAvatar(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/user.jfif';
  }

  goBackToChat() {
    if (!this.communityId) return;
    this.router.navigate(['/community-detail'], {
      queryParams: {
        communityId: this.communityId,
      },
    });
  }

  setActiveSection(section: 'community' | 'announcements') {
    this.activeSection = section;
  }

  onAddGroups() {
    if (!this.communityId) return;
    this.router.navigate(['/add-group-community'], {
      queryParams: {
        communityId: this.communityId,
      },
    });
  }

  async scrollToSegment(seg: 'community' | 'announcements') {
    await new Promise((r) => setTimeout(r, 80));
    const elId =
      seg === 'community' ? 'section-community' : 'section-announcements';
    const el = document.getElementById(elId);
    if (!el) {
      await this.content.scrollToTop(300);
      return;
    }
    const top = el.offsetTop;
    await this.content.scrollToPoint(0, top, 300);
  }

  invite() {
    console.log('invite');
  }

  addMembers() {
    this.router.navigate(['/add-members-community'], {
      queryParams: {
        communityId: this.communityId,
      },
    });
  }

  addGroups() {
    this.router.navigate(['/add-existing-groups'], {
      queryParams: {
        communityId: this.communityId,
        communityName: this.communityName,
      },
    });
  }

  editCommunity() {
    this.router.navigate(['/edit-community-info'], {
      queryParams: { communityId: this.communityId },
    });
  }

  communitySettings() {
    console.log('open community settings');
  }

  viewGroups() {
    this.router.navigate(['/add-group-community'], {
      queryParams: { communityId: this.communityId },
    });
  }

  assignNewOwner() {
    if (!this.communityId) {
      console.error('No community ID');
      return;
    }

    this.router.navigate(['/select-new-owner'], {
      queryParams: { communityId: this.communityId },
    });
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
        message:
          'Owner cannot exit the community. Please transfer ownership first.',
        duration: 3000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Exit Community',
      message: `Are you sure you want to exit "${
        this.community.name || 'this community'
      }"?`,
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

  reportCommunity() {
    console.log('report community');
  }

   async deactivateCommunity() {
    if (!this.communityId || !this.currentUserId) {
      const toast = await this.toastCtrl.create({
        message: 'Unable to deactivate community',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
      return;
    }

    // Only owner can deactivate
    if (!this.isCreator) {
      const toast = await this.toastCtrl.create({
        message: 'Only the community owner can deactivate the community',
        duration: 3000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Deactivate Community',
      message: `Are you sure you want to deactivate "${
        this.community.title || 'this community'
      }"? This will:\n\n• Remove ALL members from the community\n• Remove ALL members from Announcement & General groups\n• Unlink all groups from the community\n• Delete the community from everyone's chat list\n\nThis action cannot be undone.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Deactivate',
          role: 'destructive',
          handler: async () => {
            await this.performDeactivateCommunity();
          },
        },
      ],
    });

    await alert.present();
  }

  private async performDeactivateCommunity() {
    const loading = await this.loadingCtrl.create({
      message: 'Deactivating community...',
    });
    await loading.present();

    try {
      const result = await this.firebaseService.deactivateCommunity(
        this.communityId!,
        this.currentUserId
      );

      await loading.dismiss();

      if (result.success) {
        const toast = await this.toastCtrl.create({
          message: 'Community deactivated successfully',
          duration: 2000,
          color: 'success',
        });
        await toast.present();

        // Navigate back to home screen
        this.router.navigate(['/home-screen'], { replaceUrl: true });
      } else {
        const toast = await this.toastCtrl.create({
          message: result.message || 'Failed to deactivate community',
          duration: 2000,
          color: 'danger',
        });
        await toast.present();
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Deactivate community error:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to deactivate community. Please try again.',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  notifications() {
    console.log('notifications');
  }

  mediaVisibility() {
    console.log('media visibility');
  }

  disappearingMessages() {
    console.log('disappearing messages');
  }

  chatLock() {
    console.log('chat lock');
  }

  phoneNumberPrivacy() {
    console.log('phone privacy');
  }

  back() {
    this.navCtrl.back();
  }
}