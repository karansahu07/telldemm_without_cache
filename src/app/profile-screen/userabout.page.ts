import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, PopoverController, ActionSheetController, ToastController, AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { getDatabase, ref, get, remove, set, update, child, off } from 'firebase/database';
import { UseraboutMenuComponent } from '../components/userabout-menu/userabout-menu.component';
import { ActionSheetButton } from '@ionic/angular';
import { FirebaseChatService } from '../services/firebase-chat.service';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';
import { NavController } from '@ionic/angular';
import { NgZone } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { ApiService } from '../services/api/api.service';
import { push } from 'firebase/database';
import { query, limitToLast, onValue } from "firebase/database";
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { GroupMemberDisplay, IGroup, IGroupMember } from '../services/sqlite.service';
// removed unused firstValueFrom import
// import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-userabout',
  templateUrl: './userabout.page.html',
  styleUrls: ['./userabout.page.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [IonicModule, CommonModule,TranslateModule],
})
export class UseraboutPage implements OnInit {
  receiverId: string = '';
  receiver_phone: string = '';
  receiver_name: string = '';
  groupId: string = '';
  isGroup: boolean = false;
  chatType: 'private' | 'group' = 'private';
  groupName: string = '';
  // groupMembers: {
  //   user_id: string;
  //   name: string;
  //   phone: string;
  //   avatar?: string;
  //   role?: string;
  //   phone_number?: string;
  //   publicKeyHex?: string | null;
  // }[] = [];


groupMembers: GroupMemberDisplay[] = [];

  groupData: IGroup | null = null;
groupMemberssda: { userId: string; data: IGroupMember; avatar?: string }[] = [];    //new type of groupMember
  commonGroups: any[] = [];
  receiverAbout: string = '';
  statusTime: string = '';
  receiverAboutUpdatedAt: string = '';

adminIds: string[] = [];
  groupDescription: string = '';
  groupCreatedBy: string = '';
  groupCreatedAt: string = '';
  hasPastMembers = false;
  receiverProfile: string | null = null;
  chatTitle: string | null = null;

  isScrolled: boolean = false;
  currentUserId = "";
  showPastMembersButton: boolean = false;

  isBlocked: boolean = false;

  iBlocked = false;      // I blocked them
theyBlocked = false;   // They blocked me

// to keep refs so we can detach listeners later
private iBlockedRef: any = null;
private theyBlockedRef: any = null;
socialMediaLinks: { platform: string; profile_url: string }[] = [];
 communityId: string = '';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private popoverCtrl: PopoverController,
    private actionSheetCtrl: ActionSheetController,
    private toastCtrl: ToastController,
    private firebaseChatService: FirebaseChatService,
    private secureStorage: SecureStorageService,
    private navCtrl: NavController,
    private zone: NgZone,
    private authService: AuthService,
    private service: ApiService,
    private alertCtrl: AlertController,
    private translate: TranslateService,
  ) { }

  ngOnInit() {
    // this.route.queryParams.subscribe(async params => {
    //   this.receiverId = params['receiverId'] || '';
    //   this.receiver_phone = params['receiver_phone'] || '';
    //   this.isGroup = params['isGroup'] === 'true';
    //   this.chatType = this.isGroup ? 'group' : 'private';
    //   this.receiver_name = (await this.secureStorage.getItem('receiver_name')) || '';
    //   this.currentUserId = this.authService.authData?.userId || '';
    //   this.groupId = this.route.snapshot.queryParamMap.get('receiverId') || '';
    //   //console.log("group id checking:", this.groupId);
    //   //console.log("isGroup:", this.isGroup);

    //   this.loadReceiverProfile();

    //   this.communityId = this.route.snapshot.queryParamMap.get('communityId') || '';

    //   if (this.chatType === 'group') {
    //     // use shared service to fetch group + member profiles
    //     try {
    //       const { groupName, groupMembers } = await this.firebaseChatService.fetchGroupWithProfiles(this.receiverId);
    //       this.groupName = groupName;
    //       this.groupMembers = groupMembers;
    //     } catch (err) {
    //       console.warn('Failed to fetch group with profiles', err);
    //       this.groupName = 'Group';
    //       this.groupMembers = [];
    //     }

    //     await this.fetchGroupMeta(this.receiverId);
    //   } else {
    //     // await this.fetchReceiverAbout(this.receiverId);
    //   }
    // });

    // this.checkForPastMembers();
    // this.findCommonGroups(this.currentUserId, this.receiverId);
    // this.checkIfBlocked();
  }

  isAdmin(userId: string): boolean {
  return this.adminIds.includes(String(userId));
}

async ionViewWillEnter() {
  this.route.queryParams.subscribe(params => {
    this.receiverId = params['receiverId'] || null;
    const isGroupParam = params['isGroup'];
    this.chatType = isGroupParam === 'true' ? 'group' : 'private';
    console.log("this chatType", this.chatType);
    console.log('Receiver ID:', this.receiverId);
  });
  
  this.loadReceiverProfile();
  this.checkForPastMembers();
  
  const currentChat = this.firebaseChatService.currentChat;
  this.receiverProfile = (currentChat as any).avatar || (currentChat as any).groupAvatar || null;
  this.chatTitle = currentChat?.title || null;
  
  if (this.chatType === 'group') {
    try {
      const { groupName, groupMembers } = await this.firebaseChatService.fetchGroupWithProfiles(this.receiverId);
      this.groupName = groupName;
      this.groupMembers = groupMembers;
      
      // Load admin IDs
      this.adminIds = await this.firebaseChatService.getGroupAdminIds(this.receiverId);
      console.log('Loaded admin IDs:', this.adminIds);
      console.log('Group members:', this.groupMembers);
      
    } catch (err) {
      console.warn('Failed to fetch group with profiles', err);
      this.groupName = 'Group';
      this.groupMembers = [];
      this.adminIds = [];
    }
    
    await this.fetchGroupMeta(this.receiverId);
  }

  this.groupId = this.receiverId || '';

  if (!this.groupId) {
    console.warn('No groupId found in route');
    return;
  }
}
  
  loadReceiverProfile() {
  if (!this.receiverId) return;

  if (this.chatType === 'group') {
    this.service.getGroupDp(this.receiverId).subscribe({
      next: (res: any) => {
        this.receiverProfile = res?.group_dp_url || 'assets/images/user.jfif';
      },
      error: (err) => {
        console.error("❌ Error loading group profile:", err);
        this.receiverProfile = 'assets/images/user.jfif';
      }
    });
  } else {
    // User DP API call
    this.service.getUserProfilebyId(this.receiverId).subscribe({
      next: (res: any) => {
        this.receiverProfile = res?.profile || 'assets/images/user.jfif';
        this.receiverAbout = res?.dp_status;
        this.statusTime = res?.dp_status_updated_on;

        // 👇 call social media links here
        console.log("this.receiverId", this.receiverId)
        this.loadReceiverSocialMedia(this.receiverId);
      },
      error: (err) => {
        console.error("❌ Error loading user profile:", err);
        this.receiverProfile = 'assets/images/user.jfif';
      }
    });
  }
}

loadReceiverSocialMedia(userId: string) {
  this.service.getSocialMedia(Number(userId)).subscribe({
    next: (res: any) => {
      if (res?.success && Array.isArray(res.data)) {
        this.socialMediaLinks = res.data;
      }
    },
    error: (err) => {
      console.error("❌ Error loading social media links:", err);
      this.socialMediaLinks = [];
    }
  });
}

openExternalLink(url: string) {
  if (!url) return;
  window.open(url, '_blank');
}


  setDefaultAvatar(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/user.jfif';
  }

  onScroll(event: any) {
    const scrollTop = event.detail.scrollTop;
    this.isScrolled = scrollTop > 10;
  }

goBackToChat() {
  try {
    this.navCtrl.back();
  } catch (err) {
    console.warn('navCtrl.back() failed, fallback:', err);

    if (this.communityId) {
      this.router.navigate(['/community-chat'], {
        queryParams: {
          receiverId: this.receiverId,
          receiver_phone: this.receiver_phone,
          isGroup: this.isGroup,
          communityId: this.communityId
        }
      });
    } else {
      this.router.navigate(['/chatting-screen'], {
        queryParams: {
          receiverId: this.receiverId,
          receiver_phone: this.receiver_phone,
          isGroup: this.isGroup
        }
      });
    }
  }
}



  openProfileDp() {
    const profileToShow = this.receiverProfile || 'assets/images/user.jfif';

    this.router.navigate(['/profile-dp-view'], {
      queryParams: {
        image: profileToShow,
        isGroup: this.chatType === 'group',
        receiverId: this.receiverId,
      }
    });
  }

  onAddMember() {
    // const memberPhones = this.groupMembers.map(member => member.phone);
    this.router.navigate(['/add-members'], {
      queryParams: {
        groupId: this.receiverId,
        // members: JSON.stringify(memberPhones)
      }
    });
  }

  viewPastMembers() {
    this.router.navigate(['/view-past-members'], {
      queryParams: {
        groupId: this.receiverId
      }
    });
  }

  async openMenu(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: UseraboutMenuComponent,
      event: ev,
      translucent: true,
      componentProps: {
        chatType: this.chatType,
        groupId: this.chatType === 'group' ? this.receiverId : ''
      }
    });

    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data?.action === 'memberAdded' || data?.action === 'nameChanged') {
      // refresh members by calling the centralized service
      try {
        const { groupName, groupMembers } = await this.firebaseChatService.fetchGroupWithProfiles(this.receiverId);
        this.groupName = groupName;
        this.groupMembers = groupMembers;
      } catch (err) {
        console.warn('Failed to refresh group with profiles after menu action', err);
      }
    }
  }

  openGroupDescriptionPage() {
    if (this.chatType === 'group') {
      this.navCtrl.navigateForward(`/group-description`, {
        queryParams: {
          receiverId: this.receiverId,
          currentDescription: this.groupDescription,
          receiver_name: this.receiver_name,
          isGroup: this.isGroup
        }
      });
    }
  }

 // ---- ACTION SHEET ----

async openActionSheet(member: any) {
  const t = this.translate;
  // console.log({member});
  
  const buttons: ActionSheetButton[] = [
    {
      text: t.instant('userabout.actions.message'),
      icon: 'chatbox',
      handler: () => this.messageMember(member)
    },
  ];

  const groupId = this.receiverId || this.groupId;
  const currentUserId = this.authService.authData?.userId || '';
  
  try {
    // Get admin details from service
    const { adminIds, isCurrentUserAdmin, isTargetUserAdmin, isSelf } = 
      await this.firebaseChatService.getAdminCheckDetails(groupId, currentUserId, member.user_id);

    console.log('Admin check:', { 
      adminIds, 
      currentUserId,
      isCurrentUserAdmin, 
      isTargetUserAdmin, 
      isSelf 
    });

    if (isCurrentUserAdmin && !isSelf) {
      if (isTargetUserAdmin) {
        buttons.push({
          text: t.instant('userabout.actions.dismissAdmin'),
          icon: 'remove-circle',
          handler: () => this.dismissAdmin(member)
        });
      } else {
        buttons.push({
          text: t.instant('userabout.actions.makeAdmin'),
          icon: 'person-add',
          handler: () => this.makeAdmin(member)
        });
      }

      buttons.push({
        text: t.instant('userabout.actions.removeFromGroup'),
        icon: 'person-remove',
        role: 'destructive',
        handler: () => this.removeMemberFromGroup(member)
      });
    }

    buttons.push({ text: t.instant('common.cancel'), role: 'cancel' });

    const actionSheet = await this.actionSheetCtrl.create({
      header: member.name || member.username || 'Member',
      buttons
    });
    await actionSheet.present();
    
  } catch (error) {
    console.error('Error loading admin data:', error);
    
    // Fallback: show basic options only
    buttons.push({ text: t.instant('common.cancel'), role: 'cancel' });
    
    const actionSheet = await this.actionSheetCtrl.create({
      header: member.name || member.username || 'Member',
      buttons
    });
    await actionSheet.present();
  }
}

async makeAdmin(member: any) {
  const groupId = this.groupId || this.receiverId;

  if (!groupId || !member?.user_id) {
    console.error('Missing groupId or member.user_id');
    return;
  }

  try {
    const success = await this.firebaseChatService.makeGroupAdmin(groupId, member.user_id);
    
    if (success) {
      // Update local groupMembers array to show admin badge
      const memberIndex = this.groupMembers.findIndex(m => m.user_id === member.user_id);
      if (memberIndex !== -1) {
        this.groupMembers[memberIndex].role = 'admin';
      }
      this.adminIds.push(member.user_id);
      
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('userabout.toasts.madeAdmin', { 
          name: member.name || member.username 
        }),
        duration: 2000,
        color: 'success'
      });
      await toast.present();
    } else {
      throw new Error('Failed to make admin');
    }
  } catch (error) {
    console.error('Error making admin:', error);
    const toast = await this.toastCtrl.create({
      message: this.translate.instant('userabout.errors.makeAdmin', { 
        name: member.name || member.username 
      }),
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
}

async dismissAdmin(member: any) {
  const groupId = this.groupId || this.receiverId;

  if (!groupId || !member?.user_id) {
    console.error('Missing groupId or member.user_id');
    return;
  }

  try {
    const success = await this.firebaseChatService.dismissGroupAdmin(groupId, member.user_id);
    
    if (success) {
      // Update local groupMembers array
      const memberIndex = this.groupMembers.findIndex(m => m.user_id === member.user_id);
      if (memberIndex !== -1) {
        this.groupMembers[memberIndex].role = 'member';
      }

      this.adminIds = this.adminIds.filter((id) => id != member.user_id);

      const toast = await this.toastCtrl.create({
        message: this.translate.instant('userabout.toasts.dismissedAdmin', { 
          name: member.name || member.username 
        }),
        duration: 2000,
        color: 'medium'
      });
      await toast.present();
    } else {
      throw new Error('Failed to dismiss admin');
    }
  } catch (error) {
    console.error('Error dismissing admin:', error);
    const toast = await this.toastCtrl.create({
      message: this.translate.instant('userabout.errors.dismissAdmin', { 
        name: member.name || member.username 
      }),
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
}



 async messageMember(member: any) {
    const senderId = this.authService.authData?.userId || '';
    const receiverId = member.user_id;

    if (!senderId || !receiverId) {
      alert('Missing sender or receiver ID');
      return;
    }

    // const roomId = senderId < receiverId ? `${senderId}_${receiverId}` : `${receiverId}_${senderId}`;
    // const receiverPhone = member.phone_number || member.phone;

    // await this.firebaseChatService.openChat(chat);

    await this.firebaseChatService.openChat(
      { receiver: { userId: receiverId } },
      true
    );

    this.router.navigate(['/chatting-screen'], {
      queryParams: {
        receiverId: receiverId,
      }
    });
  }

  async removeMemberFromGroup(member: any) {
    const groupId = this.groupId || this.receiverId;
    
    try {
      if (!groupId || !member?.user_id) {
        console.error('Missing groupId or member.user_id');
        return;
      }
      // console.log("groupId and memmber.userId", groupId, member.user_id)
      await this.firebaseChatService.removeMembersToGroup(groupId, [member.user_id])
      
      const backendGroupId = await this.firebaseChatService.getBackendGroupId(groupId);
  
      if (backendGroupId) {
        this.service.updateMemberStatus(backendGroupId, Number(member.user_id), false).subscribe({
          next: (res: any) => {
            console.log('Member status updated in backend:', res);
          },
          error: (error: any) => {
            console.error('Error updating member status in backend:', error);
          }
        });
      }
  
      this.groupMembers = this.groupMembers.filter(m => m.user_id !== member.user_id);
  
      const toast = await this.toastCtrl.create({
      message: this.translate.instant('userabout.toasts.removedFromGroup', { name: member.username }),
      duration: 2000,
      color: 'success'
    });
    await toast.present();
    } catch (error) {
      console.error('Error moving member to pastmembers:', error);
       const toast = await this.toastCtrl.create({
      message: this.translate.instant('userabout.errors.removeMember'),
      duration: 2000,
      color: 'danger'
    });
      await toast.present();
      
    }
  }

  async checkForPastMembers() {
    if (!this.receiverId) return;

    const db = getDatabase();
    const pastRef = ref(db, `groups/${this.receiverId}/pastmembers`);

    try {
      const snapshot = await get(pastRef);
      const exists = snapshot.exists();

      this.zone.run(() => {
        this.hasPastMembers = exists;
      });
      console.log("checking for past members", this.hasPastMembers)
    } catch (error) {
      console.error('Error checking past members:', error);
      this.zone.run(() => {
        this.hasPastMembers = false;
      });
    }
  }

   async confirmExitGroup() {
    // console.log("this exit group function is called")
    const alert = await this.alertCtrl.create({
      header: this.translateText('userabout.exitGroupConfirmHeader', 'Exit group'),
      message: this.translateText('userabout.exitGroupConfirmMsg', 'Are you sure you want to exit this group?'),
      buttons: [
        {
          text: this.translateText('common.cancel', 'Cancel'),
          role: 'cancel'
        },
        {
          text: this.translateText('common.exit', 'Exit'),
          handler: () => {
            this.exitGroup();
          }
        }
      ]
    });

    await alert.present();
  }

  async exitGroup() {
    try {
      this.currentUserId = this.authService.authData?.userId || '';
      console.log("this.currentUserId", this.currentUserId)
      this.firebaseChatService.exitGroup(this.receiverId, [this.currentUserId])
      const toast = await this.toastCtrl.create({
        message: this.translateText('userabout.exitSuccess', 'You have exited the group.'),
        duration: 2000,
        position: 'bottom'
      });
      await toast.present();

      // this.navCtrl.back();

    } catch (err) {
      console.error('Error exiting group:', err);
      const toast = await this.toastCtrl.create({
        message: this.translateText('userabout.exitError', 'Failed to exit group. Please try again.'),
        duration: 2500,
        position: 'bottom'
      });
      await toast.present();
    }
  }

  translateText(key: string, fallback: string) {
    return fallback;
  }

  async createGroupWithMember() {
    const currentUserId = this.authService.authData?.userId;
    const currentUserPhone = this.authService.authData?.phone_number;
    const currentUserName = this.authService.authData?.name || currentUserPhone;

    if (!currentUserId || !this.receiverId || !this.receiver_name) {
      console.error('Missing data for group creation');
      return;
    }

    const groupId = `group_${Date.now()}`;
    const groupName = `${currentUserName}, ${this.receiver_name}`;

    const members = [
      {
        userId: currentUserId,
        username: currentUserName as string,
        phoneNumber: currentUserPhone as  string
      },
      {
        userId: this.receiverId,
        username: this.receiver_name,
        phoneNumber: this.receiver_phone
      }
    ];

    try {
      await this.firebaseChatService.createGroup({groupId,groupName,members });
      this.router.navigate(['/chatting-screen'], {
        queryParams: { receiverId: groupId, isGroup: true }
      });
    } catch (error) {
      console.error('Error creating group:', error);
    }
  }

  async findCommonGroups(currentUserId: string, receiverId: string) {
    if (!currentUserId || !receiverId) return;

    const db = getDatabase();
    const groupsRef = ref(db, 'groups');

    try {
      const snapshot = await get(groupsRef);
      if (snapshot.exists()) {
        const allGroups = snapshot.val();
        const matchedGroups: any[] = [];

        Object.entries(allGroups).forEach(([groupId, groupData]: any) => {
          const members = groupData.members || {};

          if (members[currentUserId] && members[receiverId]) {
            matchedGroups.push({
              groupId,
              name: groupData.name || 'Unnamed Group'
            });
          }
        });

        this.commonGroups = matchedGroups;
        //console.log('Common Groups:', this.commonGroups);
      }
    } catch (error) {
      console.error('Error fetching common groups:', error);
    }
  }

  async fetchGroupMeta(groupId: string) {
    const db = getDatabase();
    const groupRef = ref(db, `groups/${groupId}`);

    try {
      const snapshot = await get(groupRef);
      if (snapshot.exists()) {
        const groupData = snapshot.val();
        this.groupDescription = groupData.description || 'No group description.';
        this.groupCreatedBy = groupData.createdByName || 'Unknown';
        this.groupCreatedAt = groupData.createdAt || '';
      }
    } catch (error) {
      console.error('Error fetching group meta:', error);
    }
  }

  //yeh delete nhi krna
  // async fetchReceiverAbout(userId: string) {
  //   const db = getDatabase();
  //   const userRef = ref(db, `users/${userId}`);

  //   try {
  //     const snapshot = await get(userRef);
  //     if (snapshot.exists()) {
  //       const userData = snapshot.val();
  //       this.receiverAbout = userData.about || 'Hey there! I am using WhatsApp.';
  //       this.receiverAboutUpdatedAt = userData.updatedAt || '';
  //     }
  //   } catch (error) {
  //     console.error('Error fetching receiver about info:', error);
  //   }
  // }

  // async checkIfBlocked() {  //need some change
  //   const db = getDatabase();
  //   const blockRef = ref(db, `blockedContacts/${this.currentUserId}/${this.receiverId}`);
  //   onValue(blockRef, (snapshot) => {
  //     this.isBlocked = snapshot.exists();
  //   });
  // }

  // async blockUser() {
  //   const alert = await this.alertCtrl.create({
  //     header: 'Block Contact',
  //     message: `You will no longer receive messages or calls from ${this.receiver_name}.`,
  //     buttons: [
  //       { text: 'Cancel', role: 'cancel' },
  //       {
  //         text: 'Block',
  //         handler: async () => {
  //           const db = getDatabase();
  //           const blockRef = ref(db, `blockedContacts/${this.currentUserId}/${this.receiverId}`);
  //           await set(blockRef, true);

  //           this.isBlocked = true;

  //           const toast = await this.toastCtrl.create({
  //             message: `${this.receiver_name} has been blocked.`,
  //             duration: 2000,
  //             color: 'danger'
  //           });
  //           toast.present();
  //         }
  //       }
  //     ]
  //   });
  //   await alert.present();
  // }

  // async unblockUser() {
  //   const alert = await this.alertCtrl.create({
  //     header: 'Unblock Contact',
  //     message: `Are you sure you want to unblock ${this.receiver_name}?`,
  //     buttons: [
  //       {
  //         text: 'Cancel',
  //         role: 'cancel',
  //       },
  //       {
  //         text: 'OK',
  //         handler: async () => {
  //           const db = getDatabase();
  //           const blockRef = ref(db, `blockedContacts/${this.currentUserId}/${this.receiverId}`);
  //           await remove(blockRef);

  //           this.isBlocked = false;

  //           const toast = await this.toastCtrl.create({
  //             message: `${this.receiver_name} has been unblocked.`,
  //             duration: 2000,
  //             color: 'success'
  //           });
  //           toast.present();
  //         }
  //       }
  //     ]
  //   });

  //   await alert.present();
  // }

  async checkIfBlocked() {
  // make sure we have both IDs
  if (!this.receiverId) return;

  // ensure currentUserId is set (try authService first, then fallback to secureStorage)
  this.currentUserId = this.authService.authData?.userId || (await this.secureStorage.getItem('userId')) || this.currentUserId;
  if (!this.currentUserId) {
    console.warn('checkIfBlocked: no currentUserId available yet');
    return;
  }

  const db = getDatabase();

  // detach old listeners (if any)
  try {
    if (this.iBlockedRef) off(this.iBlockedRef);
    if (this.theyBlockedRef) off(this.theyBlockedRef);
  } catch (e) { /* ignore if nothing to off */ }

  // set up new refs
  this.iBlockedRef = ref(db, `blockedContacts/${this.currentUserId}/${this.receiverId}`);
  this.theyBlockedRef = ref(db, `blockedContacts/${this.receiverId}/${this.currentUserId}`);

  onValue(this.iBlockedRef, (snapshot) => {
    this.zone.run(() => {
      this.iBlocked = snapshot.exists();
      // keep boolean used by templates
      // //console.log('iBlocked ->', this.iBlocked);
    });
  });

  onValue(this.theyBlockedRef, (snapshot) => {
    this.zone.run(() => {
      this.theyBlocked = snapshot.exists();
      // //console.log('theyBlocked ->', this.theyBlocked);
    });
  });
}
async blockUser() {
  const t = this.translate;
  const alert = await this.alertCtrl.create({
    header: t.instant('userabout.alerts.block.header'),
    message: t.instant('userabout.alerts.block.message', { name: this.receiver_name }),
    buttons: [
      { text: t.instant('common.cancel'), role: 'cancel' },
      {
        text: t.instant('userabout.alerts.block.cta'),
        handler: async () => {
          const db = getDatabase();
          const blockRef = ref(db, `blockedContacts/${this.currentUserId}/${this.receiverId}`);
          await set(blockRef, true);
          this.iBlocked = true;
          const toast = await this.toastCtrl.create({
            message: t.instant('userabout.toasts.blocked', { name: this.receiver_name }),
            duration: 2000,
            color: 'danger'
          });
          toast.present();
        }
      }
    ]
  });
  await alert.present();
}

async unblockUser() {
  const t = this.translate;
  const alert = await this.alertCtrl.create({
    header: t.instant('userabout.alerts.unblock.header'),
    message: t.instant('userabout.alerts.unblock.message', { name: this.receiver_name }),
    buttons: [
      { text: t.instant('common.cancel'), role: 'cancel' },
      {
        text: t.instant('common.ok'),
        handler: async () => {
          const db = getDatabase();
          const blockRef = ref(db, `blockedContacts/${this.currentUserId}/${this.receiverId}`);
          await remove(blockRef);
          this.iBlocked = false;
          const toast = await this.toastCtrl.create({
            message: t.instant('userabout.toasts.unblocked', { name: this.receiver_name }),
            duration: 2000,
            color: 'success'
          });
          toast.present();
        }
      }
    ]
  });
  await alert.present();
}
 async reportUser() {
  const t = this.translate;
  const alert = await this.alertCtrl.create({
    header: t.instant('userabout.alerts.report.header'),
    message: t.instant('userabout.alerts.report.message', { name: this.receiver_name }),
    inputs: [{ type: 'checkbox', label: t.instant('userabout.alerts.report.alsoBlock'), value: 'block' }],
    buttons: [
      { text: t.instant('common.cancel'), role: 'cancel' },
      {
        text: t.instant('userabout.alerts.report.cta'),
        handler: async (data) => {
          // ... your existing report logic
          const alsoBlock = data.includes('block');
          const msg = alsoBlock
            ? t.instant('userabout.toasts.reportedAndBlocked', { name: this.receiver_name })
            : t.instant('userabout.toasts.reported', { name: this.receiver_name });

          const toast = await this.toastCtrl.create({
            message: msg,
            duration: 2000,
            color: 'warning'
          });
          toast.present();
        }
      }
    ]
  });
  await alert.present();
}
}