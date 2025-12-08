import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  AlertController,
  IonicModule,
  LoadingController,
  ModalController,
  PopoverController,
  ToastController,
} from '@ionic/angular';
import { FooterTabsComponent } from '../components/footer-tabs/footer-tabs.component';
import { Router } from '@angular/router';
import { MenuPopoverComponent } from '../components/menu-popover/menu-popover.component';
import { FormsModule } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import { ApiService } from '../services/api/api.service';
import { FirebaseChatService } from '../services/firebase-chat.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { EncryptionService } from '../services/encryption.service';
import { Capacitor } from '@capacitor/core';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';
import { decodeBase64 } from '../utils/decodeBase64.util';
import { AuthService } from '../auth/auth.service';
import { Observable } from 'rxjs';
import { onValue } from '@angular/fire/database';
import { Database } from '@angular/fire/database';
import { ContactSyncService } from '../services/contact-sync.service';
import { NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Device, DeviceInfo } from '@capacitor/device';
import Cropper from 'cropperjs';

// Firebase modular imports
import {
  getDatabase,
  ref as rtdbRef,
  onValue as rtdbOnValue,
  off as rtdbOff,
  get,
  update,
  remove,
  set,
} from 'firebase/database';
import { TypingService } from '../services/typing.service';
import { Resetapp } from '../services/resetapp';
import { VersionCheck } from '../services/version-check';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MenuHomePopoverComponent } from '../components/menu-home-popover/menu-home-popover.component';
import { CommunityChat, GroupChat } from 'src/types';

import { SqliteService, IConversation } from '../services/sqlite.service';
import { ImageCropperModalComponent } from 'src/app/components/image-cropper-modal/image-cropper-modal.component';
import { CropResult } from 'src/types';

@Component({
  selector: 'app-home-screen',
  templateUrl: './home-screen.page.html',
  styleUrls: ['./home-screen.page.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FooterTabsComponent,
    FormsModule,
    TranslateModule,
  ],
})
export class HomeScreenPage implements OnInit, OnDestroy {
  searchText = '';
  selectedFilter = 'all';
  currUserId: string | null = null;
  senderUserId: string | null = null;

  scannedText = '';
  capturedImage = '';
  chatList: any[] = [];
  toggleGroupCreator = false;
  newGroupName = '';
  unreadSubs: Subscription[] = [];
  selectedImage: string | null = null;
  showPopup = false;
  sender_name: string | undefined;

  private avatarErrorIds = new Set<string>();
  isLoading: boolean = true;

  // typing listeners: map roomId -> unsubscribe fn
  private typingUnsubs: Map<string, () => void> = new Map();
  private communityUnreadSubs: Map<string, any> = new Map();

  selectedChats: any[] = [];
  selectedConversations: Set<string> = new Set();
  private longPressTimer: any = null;
  private readonly MAX_PINNED = 3;
  private pinUnsub: (() => void) | null = null;
  private archiveUnsub: (() => void) | null = null;

  // private archiveUnsub: (() => void) | null = null;

  // maps to track counts
  private archivedMap: Record<
    string,
    { archivedAt: number; isArchived: boolean }
  > = {};
  private lockedMap: Record<string, { lockedAt: number; isLocked: boolean }> =
    {};

  conversations: (IConversation & {
    isTyping: boolean;
    isSelected: boolean;
  })[] = [];
  archievedCount: number = 0;

  selectedAttachment: any = null;
showPreviewModal: boolean = false;
messageText = '';
isSending = false;
receiver_name = '';

 private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  isChatsLoaded: boolean = false;
   selectedChat: any = null;

  constructor(
    private router: Router,
    private popoverCtrl: PopoverController,
    private service: ApiService,
    private firebaseChatService: FirebaseChatService,
    private encryptionService: EncryptionService,
    private secureStorage: SecureStorageService,
    private authService: AuthService,
    private db: Database,
    private contactSyncService: ContactSyncService,
    private typingService: TypingService,
    private alertCtrl: AlertController,
    private resetapp: Resetapp,
    private versionService: VersionCheck,
    private translate: TranslateService,
    private sqlite: SqliteService,
    private toastCtrl: ToastController,
    private modalController: ModalController,
    private loadingController: LoadingController,
  ) { }

  async ngOnInit() {
    this.currUserId = this.authService.authData?.phone_number || '';
    this.senderUserId = this.authService.authData?.userId || '';
    this.isLoading = true;

    this.trackRouteChanges();
    // this.sqlite.getMessages('78_76', 100, 0).then(console.log).catch(console.error)

  }

  // 1) First check server for force-logout decision every time user revisits home
async ionViewWillEnter() {
    try {
      // await this.initApp()

      console.info('Loading home page ....');
      await this.firebaseChatService.initApp(
        this.authService.senderId as string
      );

      this.firebaseChatService.conversations.subscribe((convs) => {
        this.archievedCount = convs.filter((c) => c.isArchived).length || 0;
        // console.log('this archievwed count', this.archievedCount);
        this.conversations = convs
          .map((c) => ({
            ...c,
            // unreadCount : c.unreadCount || 0,
            isTyping: false,
            isSelected: false,
            lastMessage: c.lastMessage ?? 'hello this is last message', // use actual lastMessage if available
          }))
          .filter((c) => !c.isLocked && !c.isArchived);

          this.isChatsLoaded = true
        console.log('Conversations updated:', convs);
        console.log('this.conversations:', this.conversations);
      });
      this.isLoading = false;
      console.info('Loading home page complete!');

      this.senderUserId =
        this.authService.authData?.userId || this.senderUserId || '';
      await this.checkForceLogout(); // will show popup & call resetApp() if server says force_logout === 0
    } catch (err) {
      console.warn('checkForceLogout error (ignored):', err);
    }

    const verified = await this.verifyDeviceOnEnter();
    if (!verified) return;

    this.clearChatData();
    this.sender_name = this.authService.authData?.name || '';
    await this.sqlite.printAllTables();
  }


  get showNewChatPrompt(): boolean {
    return !this.isLoading &&
      this.firebaseChatService.currentConversations.length === 0
      // !this.searchText.trim();
  }

  async verifyDeviceOnEnter(): Promise<boolean> {
    if (!this.senderUserId) {
      console.warn('Skipping device verification: senderUserId is missing');
      return false;
    }

    try {
      // 1️⃣ Get device info (with web fallback)
      let info: any;
      const platform = Capacitor.getPlatform();
      if (platform === 'web') {
        // Fallback for web platform
        info = {
          model: navigator.userAgent.includes('Mobile')
            ? 'Mobile Web'
            : 'Desktop Web',
          operatingSystem: 'Web',
          osVersion: 'N/A',
          uuid: localStorage.getItem('device_uuid') || crypto.randomUUID(),
        };
        // Persist UUID if new
        if (!localStorage.getItem('device_uuid')) {
          localStorage.setItem('device_uuid', info.uuid);
        }
      } else {
        info = await Device.getInfo();
      }
      //console.log('Device info retrieved:', info);

      // 2️⃣ Get current app version (with web fallback)
      let appVersion = '1.0.0'; // Default fallback
      if (platform !== 'web') {
        try {
          const versionResult = await this.versionService.checkVersion();
          appVersion = versionResult.currentVersion || '1.0.0';
        } catch (versionErr) {
          console.warn('Version check failed:', versionErr);
          appVersion = '1.0.0';
        }
      } else {
        // For web, use a placeholder or read from manifest.json if needed
        appVersion = 'web.1.0.0';
      }
      //console.log('App version retrieved:', appVersion);

      // 3️⃣ Use persistent UUID
      let uuid =
        localStorage.getItem('device_uuid') || info.uuid || crypto.randomUUID();
      if (!localStorage.getItem('device_uuid')) {
        localStorage.setItem('device_uuid', uuid);
      }
      //console.log('UUID used:', uuid);

      // 4️⃣ Create device payload
      const devicePayload = {
        device_uuid: uuid,
        device_model: info.model,
        os_name: info.operatingSystem,
        os_version: info.osVersion,
        app_version: appVersion,
      };

      // 5️⃣ Prepare payload
      const payload = {
        user_id: this.senderUserId,
        device_details: devicePayload, // Note: device_details expects an object, not array like in OTP
      };
      //console.log('📨 Device verification payload:', payload);

      // 6️⃣ Call backend API
      //console.log('🔄 Calling verifyDevice API...');
      const res: any = await this.authService.verifyDevice(payload);
      //console.log('✅ API Response:', res);

      if (res.device_mismatch) {
        const backButtonHandler = (ev: any) =>
          ev.detail.register(10000, () => { });
        document.addEventListener('ionBackButton', backButtonHandler);

        const alert = await this.alertCtrl.create({
          header: 'Logged in on another device',
          message:
            'Your account is currently active on a different device. For security reasons, please log in again to continue.',
          backdropDismiss: false,
          keyboardClose: false,
          buttons: [
            {
              text: 'OK',
              handler: () => {
                this.resetapp.resetApp();
              },
            },
          ],
        });

        await alert.present();

        alert.onDidDismiss().then(() => {
          document.removeEventListener('ionBackButton', backButtonHandler);
        });

        return false;
      }

      //console.log('✅ Device verified:', res.message);
      return true;
    } catch (err) {
      console.error('Verify Device API error:', err); // Changed to error for visibility
      return false;
    }
  }

  private async checkForceLogout(): Promise<void> {
    try {
      const uidStr = this.senderUserId || this.authService.authData?.userId;
      const uid = Number(uidStr);
      if (!uid) return;

      this.service.checkUserLogout(uid).subscribe({
        next: async (res: any) => {
          if (!res) return;
          const force = Number(res.force_logout);

          // force === 1 → show alert and reset
          if (force === 1) {
            const alert = await this.alertCtrl.create({
              header: this.translate.instant('home.logout.header'),
              message: this.translate.instant('home.logout.message'),
              backdropDismiss: false,
              buttons: [
                {
                  text: this.translate.instant('common.ok'),
                  handler: () => {
                    try {
                      this.resetapp.resetApp();
                    } catch { }
                  },
                },
              ],
            });
            await alert.present();
          }
        },
        error: () => { },
      });
    } catch { }
  }

  private clearChatData() {
    this.unreadSubs.forEach((sub) => sub.unsubscribe());
    this.unreadSubs = [];

    // stop typing listeners
    this.typingUnsubs.forEach((unsub) => {
      try {
        unsub();
      } catch (e) { }
    });
    this.typingUnsubs.clear();

    this.chatList = [];
  }

  ngOnDestroy() {
    this.unreadSubs.forEach((sub) => sub.unsubscribe());
    this.unreadSubs = [];
    this.typingUnsubs.forEach((unsub) => {
      try {
        unsub();
      } catch (e) { }
    });
    this.typingUnsubs.clear();

    try {
      this.pinUnsub?.();
    } catch { }
    this.pinUnsub = null;

    try {
      this.archiveUnsub?.();
    } catch { }
    this.archiveUnsub = null;
  }

  goToUserAbout() {  
  this.showPopup = false;
  
  setTimeout(async () => {
    try {
      const chat = this.selectedChat;

      if (!chat) {
        console.error("❌ No chat selected");
        const toast = await this.toastCtrl.create({
          message: 'Chat not found',
          duration: 2000,
          color: 'warning',
        });
        await toast.present();
        return;
      }

      if (!chat.roomId) {
        console.error("❌ Chat missing roomId");
        const toast = await this.toastCtrl.create({
          message: 'Invalid chat data',
          duration: 2000,
          color: 'warning',
        });
        await toast.present();
        return;
      }

      await this.firebaseChatService.openChat(chat);

      let receiverId: string;

      if (chat.type === 'private') {
        const parts = chat.roomId.split('_');
        receiverId = parts.find((p: string) => p !== this.senderUserId) 
          ?? parts[parts.length - 1];
      } else if (chat.type === 'group') {
        receiverId = chat.roomId;
      } else if (chat.type === 'community') {
        receiverId = chat.roomId;
      } else {
        console.error("❌ Unknown chat type:", chat.type);
        return;
      }

      const queryParams: any = {
        receiverId: receiverId,
        isGroup: chat.type === 'group',
      };

      this.router.navigate(['/profile-screen'], { queryParams });

      this.selectedChat = null;
      this.selectedImage = null;

    } catch (error) {
      console.error('❌ Error opening profile:', error);
      
      const toast = await this.toastCtrl.create({
        message: 'Failed to open profile',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }, 100);
}

async goToUserchat() {  
  this.showPopup = false;
  
  setTimeout(async () => {
    try {
      const chat = this.selectedChat;

      if (!chat) {
        console.error("❌ No chat selected");
        const toast = await this.toastCtrl.create({
          message: 'Chat not found',
          duration: 2000,
          color: 'warning',
        });
        await toast.present();
        return;
      }

      if (!chat.roomId) {
        console.error("❌ Chat missing roomId");
        const toast = await this.toastCtrl.create({
          message: 'Invalid chat data',
          duration: 2000,
          color: 'warning',
        });
        await toast.present();
        return;
      }

      await this.firebaseChatService.openChat(chat);

      if (chat.type === 'private') {
        const parts = chat.roomId.split('_');
        const receiverId = parts.find((p: string) => p !== this.senderUserId) 
          ?? parts[parts.length - 1];
        
        this.router.navigate(['/chatting-screen'], {
          queryParams: { receiverId: receiverId },
        });
      } else if (chat.type === 'group') {        
        this.router.navigate(['/chatting-screen'], {
          queryParams: { receiverId: chat.roomId },
        });
      } else if (chat.type === 'community') {        
        this.router.navigate(['/community-detail'], {
          queryParams: { receiverId: chat.roomId },
        });
      } else {
        console.warn("⚠️ Unknown chat type:", chat.type);
      }

      this.selectedChat = null;
      this.selectedImage = null;
      
    } catch (error) {
      console.error('❌ Error opening chat:', error);
      
      const toast = await this.toastCtrl.create({
        message: 'Failed to open chat',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }, 100);
}

  goToUsercall() {
    this.showPopup = false;
    setTimeout(() => {
      // this.router.navigate(['/calls-screen']);
    }, 100);
  }

  goToUservideocall() {
    this.showPopup = false;
    setTimeout(() => {
      // this.router.navigate(['/calling-screen']);
    }, 100);
  }

openImagePopup(chat: any) {

  if (!chat) {
    console.error("❌ No chat object provided");
    this.toastCtrl.create({
      message: 'Unable to open chat details',
      duration: 2000,
      color: 'warning'
    }).then(t => t.present());
    return;
  }

  if (!chat.roomId) {
    console.error("❌ Chat missing roomId:", chat);
    this.toastCtrl.create({
      message: 'Invalid chat data',
      duration: 2000,
      color: 'warning'
    }).then(t => t.present());
    return;
  }

  this.selectedChat = chat;
  this.selectedImage = chat.avatar || 'assets/images/user.jfif';
  
  this.showPopup = true;
}

  closeImagePopup() {
    this.selectedImage = null;
     this.selectedChat = null;
    this.showPopup = false;
  }

  /* ===== Selection mode logic ===== */

  onChatRowClick(chat: any, ev: Event) {
    if (this.selectedChats.length > 0) {
      console.log('this selectedChats', this.selectedChats);
      this.toggleChatSelection(chat, ev);
      return;
    }
    this.openChat(chat);
  }

  isConvSelected(roomId: string): boolean {
    return this.selectedConversations.has(roomId);
  }

  isChatSelected(chat: any): boolean {
    if (chat.roomId) {
      return this.selectedConversations.has(chat.roomId);
    }
    return this.selectedChats.some((c) => {
      const sameId = c.receiver_Id === chat.receiver_Id;
      const sameGroup = !!c.group === !!chat.group;
      const sameCommunity = !!c.isCommunity === !!chat.isCommunity;
      return sameId && sameGroup && sameCommunity;
    });
  }

  get selectedCount(): number {
    return this.selectedChats.length;
  }

  get hasSelection(): boolean {
    return this.selectedChats.length > 0;
  }

  toggleChatSelection(chat: any, ev?: Event) {
    if (ev) ev.stopPropagation();

    const isCommunity = !!chat.isCommunity;
    const already = this.selectedChats.find((c) => this.sameItem(c, chat));

    // --- COMMUNITY SELECTION RULES ---
    if (isCommunity) {
      if (this.hasNonCommunitySelected()) return;

      const previouslySelectedCommunity = this.selectedChats.find(
        (c) => !!c.isCommunity
      );

      if (already) {
        // Unselect
        this.selectedChats = this.selectedChats.filter(
          (c) => !this.sameItem(c, chat)
        );
        if (chat.roomId) this.selectedConversations.delete(chat.roomId);
      } else if (previouslySelectedCommunity) {
        // Switch to this community
        if (previouslySelectedCommunity.roomId) {
          this.selectedConversations.delete(previouslySelectedCommunity.roomId);
        }
        this.selectedChats = [chat];
        if (chat.roomId) this.selectedConversations.add(chat.roomId);
      } else {
        // First community
        this.selectedChats = [chat];
        if (chat.roomId) this.selectedConversations.add(chat.roomId);
      }

      if (this.selectedChats.length === 0) this.cancelHomeLongPress();
      return;
    }

    // --- NON-COMMUNITY (PRIVATE/GROUP) RULES ---
    if (this.hasCommunitySelected()) {
      // Clear community selection
      this.selectedChats.forEach((c) => {
        if (c.roomId) this.selectedConversations.delete(c.roomId);
      });
      this.selectedChats = [];
    }

    if (already) {
      // Toggle off
      this.selectedChats = this.selectedChats.filter(
        (c) => !this.sameItem(c, chat)
      );
      if (chat.roomId) this.selectedConversations.delete(chat.roomId);
      if (this.selectedChats.length === 0) this.cancelHomeLongPress();
    } else {
      // Add
      this.selectedChats.push(chat);
      if (chat.roomId) this.selectedConversations.add(chat.roomId);
    }
  }

  /** selection guards */
  private hasCommunitySelected(): boolean {
    return this.selectedChats.some((c) => !!c.isCommunity);
  }

  private hasNonCommunitySelected(): boolean {
    return this.selectedChats.some((c) => !c.isCommunity);
  }

  private sameItem(a: any, b: any): boolean {
    // Prefer roomId comparison
    if (a?.roomId && b?.roomId) {
      return a.roomId === b.roomId;
    }

    // Fallback to old logic
    return (
      a?.receiver_Id === b?.receiver_Id &&
      !!a?.group === !!b?.group &&
      !!a?.isCommunity === !!b?.isCommunity
    );
  }

  // ✅ Fix: Clear selection (sync both arrays)
  clearChatSelection() {
    this.selectedChats = [];
    this.selectedConversations.clear();
    this.cancelHomeLongPress();
  }

  // ✅ Unchanged: Long press handlers
  startHomeLongPress(chat: any) {
    this.cancelHomeLongPress();
    this.longPressTimer = setTimeout(() => {
      if (!this.isChatSelected(chat)) {
        this.selectedChats = [chat];
        if (chat.roomId) {
          this.selectedConversations.clear();
          this.selectedConversations.add(chat.roomId);
        }
      }
    }, 500);
  }

  cancelHomeLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /* ===== Selection meta (for header icon logic) ===== */
  // get selectionMeta() {
  //   const sel = this.selectedChats || [];
  //   // console.log({sel})
  //   const count = sel.length;
  //   const includesCommunity = sel.some((c) => c.isCommunity);
  //   const includesGroup = sel.some((c) => c.group && !c.isCommunity);
  //   const includesUser = sel.some((c) => !c.group && !c.isCommunity);
  //   const onlyUsers =
  //     includesUser &&
  //     !includesGroup &&
  //     !includesCommunity &&
  //     sel.every((c) => !c.group && !c.isCommunity);
  //   return {
  //     count,
  //     includesCommunity,
  //     includesGroup,
  //     includesUser,
  //     isSingleUser: count === 1 && onlyUsers && !(sel[0]?.isPinned === true),
  //     isSinglePinned: count === 1 && onlyUsers && sel[0]?.isPinned === true,
  //     isMultiUsersOnly: count > 1 && onlyUsers,
  //   };
  // }

  get selectionMeta() {
    const sel = this.selectedChats || [];
    const count = sel.length;

    // ✅ Check for types directly
    const includesCommunity = sel.some((c) => c.type === 'community');
    const includesGroup = sel.some((c) => c.type === 'group');
    const includesUser = sel.some((c) => c.type === 'private');

    // ✅ Only users selected
    const onlyUsers =
      includesUser &&
      !includesGroup &&
      !includesCommunity &&
      sel.every((c) => c.type === 'private');

    return {
      count,
      includesCommunity,
      includesGroup,
      includesUser,

      // ✅ Single non-pinned user chat
      isSingleUser: count === 1 && onlyUsers && !(sel[0]?.isPinned === true),

      // ✅ Single pinned user chat
      isSinglePinned: count === 1 && onlyUsers && sel[0]?.isPinned === true,

      // ✅ Multiple user chats (no groups/communities)
      isMultiUsersOnly: count > 1 && onlyUsers,
    };
  }

  async onPinSelected() {
    const userId = this.senderUserId || this.authService.authData?.userId || '';
    if (!userId) {
      this.clearChatSelection();
      return;
    }
    await this.firebaseChatService.setPinConversation(
      this.selectedChats.map((c) => c.roomId)
    );
    this.clearChatSelection();
  }

  async onUnpinSelected() {
    // console.log("the unpin function is selected")
    const userId = this.senderUserId || this.authService.authData?.userId || '';
    if (!userId) {
      this.clearChatSelection();
      return;
    }
    await this.firebaseChatService.setPinConversation(
      this.selectedChats.map((c) => c.roomId),
      false
    );
    this.clearChatSelection();
  }

  // delete chat code start

  async deleteMultipleChats() {
    console.log("multiple delete selected");
    try {
      const result = await this.firebaseChatService.deleteChats(
        this.selectedChats.map((c) => c.roomId),
      );
    } catch (error) {
      console.error('Error deleting chats:', error);
    }
    this.clearChatSelection();
  }

  async onDeleteSelected() {
    try {
      const deletables = this.selectedChats.filter((c) => !c.isCommunity);

      if (deletables.length === 0) {
        const alert = await this.alertCtrl.create({
          header: "Can't Delete",
          message: 'Communities cannot be deleted from here',
          buttons: ['OK'],
        });
        await alert.present();
        this.clearChatSelection();
        return;
      }

      const alert = await this.alertCtrl.create({
        header: 'Delete Chat',
        message:
          deletables.length === 1
            ? 'Delete this chat?'
            : `Delete ${deletables.length} chats?`,
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
          },
          {
            text: 'Delete',
            handler: async () => {
              await this.deleteChatsForMe(deletables);
            },
          },
          // Delete for Everyone - only for single private chat
          // ...(deletables.length === 1 && !deletables[0].group ? [{
          //   text: 'Delete for Everyone',
          //   cssClass: 'danger-button',
          //   handler: async () => {
          //     await this.deleteChatsForEveryone(deletables);
          //   }
          // }] : [])
        ],
      });

      await alert.present();
    } catch (error) {
      console.error('❌ Delete error:', error);
      this.clearChatSelection();
    }
  }

  // Delete for Me (soft delete) - UPDATED
  private async deleteChatsForMe(chats: any[]) {
    try {
      const userId = this.senderUserId;
      if (!userId) return;

      for (const chat of chats) {
        const roomId = chat.group
          ? chat.receiver_Id
          : this.getRoomId(userId, chat.receiver_Id);

        // Firebase soft delete
        await this.firebaseChatService.deleteChatForUser(roomId, userId);

        // ✅ Remove from local chatList (row + placeholder)
        this.chatList = this.chatList.filter((c) => {
          if (chat.group && c.group) {
            return c.receiver_Id !== chat.receiver_Id;
          }
          if (chat.isCommunity && c.isCommunity) {
            return c.receiver_Id !== chat.receiver_Id;
          }
          if (!chat.group && !chat.isCommunity && !c.group && !c.isCommunity) {
            return c.receiver_Id !== chat.receiver_Id;
          }
          return true;
        });

        // cleanup listeners
        this.stopTypingListenerForChat(chat);
        const unreadSub = this.unreadSubs.find(() => true);
        if (unreadSub) {
          unreadSub.unsubscribe();
          this.unreadSubs = this.unreadSubs.filter((s) => s !== unreadSub);
        }
      }

      //console.log('✅ Chats deleted for me (placeholders removed)');
      this.clearChatSelection();
    } catch (error) {
      console.error('❌ Error deleting chats:', error);
    }
  }

  // Delete for Everyone (hard delete) - same as before
  private async deleteChatsForEveryone(chats: any[]) {
    try {
      const userId = this.senderUserId;
      if (!userId) return;

      for (const chat of chats) {
        if (chat.group) {
          await this.firebaseChatService.deleteGroup(chat.receiver_Id);
        } else {
          const roomId = this.getRoomId(userId, chat.receiver_Id);
          await this.firebaseChatService.deleteChatPermanently(roomId);
        }

        // Remove from local chatList
        this.chatList = this.chatList.filter(
          (c) =>
            !(c.receiver_Id === chat.receiver_Id && !!c.group === !!chat.group)
        );

        this.stopTypingListenerForChat(chat);
      }

      //console.log('✅ Chats deleted for everyone');
      this.clearChatSelection();
    } catch (error) {
      console.error('❌ Error deleting chats permanently:', error);
    }
  }
  //delete chat code end here
  async onMuteSelected() {
    // const c = this.selectedChats[0]; if (c) c.muted = true;
    const alert = await this.alertCtrl.create({
      header: 'Mute notification',
      message: 'Work in progress',
      buttons: ['OK'],
    });
    await alert.present();
    this.clearChatSelection();
  }

  async onArchievedSelected() {
    try {
      const userId =
        this.senderUserId || this.authService.authData?.userId || '';
      if (!userId) {
        this.clearChatSelection();
        return;
      }

      const archivables = this.selectedChats.filter((c) => !c.isCommunity);

      console.log({ archivables });
      await this.firebaseChatService.setArchiveConversation(
        this.selectedChats.map((c) => c.roomId)
      );
      this.clearChatSelection();
      return;
    } catch (error) {
      console.error('❌ Error archiving chats:', error);
    }
  }

  get lockedCount(): number {
    return Object.values(this.lockedMap).filter((v) => v?.isLocked).length;
  }
  get archivedCount(): number {
    return Object.values(this.archivedMap).filter((v) => v?.isArchived).length;
  }

  openLockedChats() {
    this.router.navigate(['/locked-chats']);
  }
  openArchived() {
    this.router.navigate(['/archieved-screen']);
  }

  async onMoreSelected(ev: any) {
    const sel = this.selectedChats || [];
    // console.log({ sel });

    const users = sel.filter((c) => c.type === 'private');
    const groups = sel.filter(
      (c) => c.type === 'group' || c.type === 'community'
    );

    const isSingleUser = users.length === 1 && groups.length === 0;
    const isMultiUsers = users.length > 1 && groups.length === 0;
    const isSingleGroup = groups.length === 1 && users.length === 0;
    const isMultiGroups = groups.length > 1 && users.length === 0;
    const isMixedChats = users.length > 0 && groups.length > 0;

    const unreadOf = (x: any) => Number(x?.unreadCount || 0) > 0;

    const single = sel.length === 1 ? sel[0] : null;
    const canMarkReadSingle = !!single && unreadOf(single);
    const canMarkUnreadSingle = !!single && !unreadOf(single);

    const anyUnreadSelected = sel.some(unreadOf);
    const allSelectedRead = sel.length > 0 && sel.every((x) => !unreadOf(x));
    const canMarkReadMulti = !single && anyUnreadSelected;
    const canMarkUnreadMulti = !single && allSelectedRead;

    const pop = await this.popoverCtrl.create({
      component: MenuHomePopoverComponent,
      event: ev,
      translucent: true,
      componentProps: {
        canLock: true,
        allSelected: this.areAllVisibleSelected(),
        isAllSelectedMode: this.areAllVisibleSelected(),

        isSingleUser,
        isMultiUsers,
        isSingleGroup,
        isMultiGroups,
        isMixedChats,

        canMarkReadSingle,
        canMarkUnreadSingle,
        canMarkReadMulti,
        canMarkUnreadMulti,
      },
    });
    await pop.present();

    const { data } = await pop.onDidDismiss();
    if (!data?.action) return;

    switch (data.action) {
      case 'viewContact':
        this.openSelectedContactProfile();
        break;

      case 'groupInfo':
        this.openSelectedGroupInfo();
        break;

      case 'markUnread':
        this.markAsUnread();
        break;
      case 'markRead':
        this.markRoomAsRead();
        break;
      case 'selectAll':
        this.selectAllVisible();
        break;
      case 'lockChat':
      case 'lockChats':
        break;
      case 'favorite':
        break;
      case 'addToList':
        break;
      case 'exitGroup':
        await this.confirmAndExitSingleSelectedGroup();
        break;
      case 'exitGroups':
        await this.confirmAndExitMultipleSelectedGroups();
        break;
      case 'exitCommunity':
        break;
      case 'communityInfo':
        break;
    }
  }

  private openSelectedContactProfile(): void {
    // //console.log("selectedChats",this.selectedChats);
    // const sel = this.selectedChats.filter((c) => c.type === 'private');
    //  console.log("selected contact",sel)
    const chat = this.selectedChats[0];
    this.firebaseChatService.openChat(chat);
    console.log({ chat });
    if (!chat) return;

    const parts = chat.roomId.split('_');
    const receiverId =
      parts.find((p: string | null) => p !== this.senderUserId) ??
      parts[parts.length - 1];

    // console.log({receiverId})

    const queryParams: any = {
      receiverId: receiverId,
    };

    this.router.navigate(['/profile-screen'], { queryParams });
    this.clearChatSelection();
  }

  private openSelectedGroupInfo(): void {
    // console.log("this group info options is selected")
    // const sel = this.selectedChats.filter((c) => c.group && !c.isCommunity);
    const chat = this.selectedChats[0];
    this.firebaseChatService.openChat(chat);
    console.log({ chat });
    if (!chat) return;

    const queryParams: any = {
      receiverId: chat.roomId,
      isGroup: chat.type === "group",
    };

    this.router.navigate(['/profile-screen'], { queryParams });
    this.clearChatSelection();
  }

  // returns only the currently visible chats that are NOT communities
  private get visibleNonCommunityChats(): any[] {
    return this.filteredChats.filter((c) => c.type !== 'community');
  }

  // are all visible non-community chats currently selected?
  private areAllVisibleSelected(): boolean {
    const visible = this.visibleNonCommunityChats;
    if (visible.length === 0) return false;
    // compare by receiver_Id + group flag (community already excluded)
    const key = (c: any) => `${c.receiver_Id}::${!!c.group}`;
    // console.log({key});
    const selectedKeys = new Set(this.selectedChats.map(key));
    return visible.every((c) => selectedKeys.has(key(c)));
  }

  // select all visible (non-community) chats; if already all selected, clear selection (toggle behavior)
  private selectAllVisible(): void {
    if (this.areAllVisibleSelected()) {
      this.clearChatSelection();
      return;
    }
    this.selectedChats = [...this.visibleNonCommunityChats];
  }

  /** Exit ONE selected group (with confirm) */
  private async confirmAndExitSingleSelectedGroup(): Promise<void> {
    const sel = this.selectedChats.filter((c) => c.type == 'group');
    console.log({sel})
    const chat = sel[0];
    if (!chat) return;

    const alert = await this.alertCtrl.create({
      header: 'Exit Group',
      message: `Are you sure you want to exit "${chat.title
        }"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Exit',
          handler: async () => {
            await this.exitGroup(chat.roomId);
            // remove row from UI
            this.chatList = this.chatList.filter(
              (c) =>
                !(
                  c.receiver_Id === chat.receiver_Id &&
                  c.group &&
                  !c.isCommunity
                )
            );
            this.stopTypingListenerForChat(chat);
            // unsubscribe unread for this group
            this.unreadSubs = this.unreadSubs.filter((s) => {
              try {
                /* keep; we don’t track per-row ref here */ return true;
              } catch {
                return true;
              }
            });
            this.clearChatSelection();

            const t = await this.alertCtrl.create({
              header: 'Exited',
              message: 'You exited the group.',
              buttons: ['OK'],
            });
            await t.present();
          },
        },
      ],
    });
    await alert.present();
  }

  /** Exit MANY selected groups (with confirm) */
  private async confirmAndExitMultipleSelectedGroups(): Promise<void> {
    const groups = this.selectedChats.filter((c) => c.group && !c.isCommunity);
    if (groups.length === 0) return;

    const alert = await this.alertCtrl.create({
      header: 'Exit Groups',
      message: `Exit ${groups.length} selected groups?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Exit',
          handler: async () => {
            let success = 0,
              fail = 0;
            for (const g of groups) {
              try {
                await this.exitGroup(g.receiver_Id);
                // remove from UI and cleanup listeners
                this.chatList = this.chatList.filter(
                  (c) =>
                    !(
                      c.receiver_Id === g.receiver_Id &&
                      c.group &&
                      !c.isCommunity
                    )
                );
                this.stopTypingListenerForChat(g);
                success++;
              } catch (e) {
                console.warn('exit group failed:', g.receiver_Id, e);
                fail++;
              }
            }
            this.clearChatSelection();

            const msg =
              fail === 0
                ? `Exited ${success} groups`
                : `Exited ${success} groups, ${fail} failed`;
            const done = await this.alertCtrl.create({
              header: 'Done',
              message: msg,
              buttons: ['OK'],
            });
            await done.present();
          },
        },
      ],
    });
    await alert.present();
  }

  /** Core: exit a group and reassign admin if needed */
  private async exitGroup(groupId: string): Promise<void> {
    const userId = this.senderUserId || this.authService.authData?.userId || '';
    if (!groupId || !userId) throw new Error('Missing groupId/userId');

    // const db = getDatabase();

    // 🔹 Read my member record
    const memberPath = `groups/${groupId}/members/${userId}`;
    const memberSnap = await get(rtdbRef(this.db, memberPath));
    if (!memberSnap.exists()) {
      // already not a member
      return;
    }

    const myMember = memberSnap.val();
    const wasAdmin = String(myMember?.role || '').toLowerCase() === 'admin';

    // 🔹 Move to pastmembers, then remove from members
    const pastMemberPath = `groups/${groupId}/pastmembers/${userId}`;
    const updatedMember = {
      ...myMember,
      status: 'inactive',
      removedAt: new Date().toISOString(),
    };

    await Promise.all([
      set(rtdbRef(this.db, pastMemberPath), updatedMember),
      (async () => {
        try {
          await update(rtdbRef(this.db, memberPath), { status: 'inactive' });
        } catch { }
        await remove(rtdbRef(this.db, memberPath));
      })(),
    ]);

    // 🔹 If I was admin, check if any admins remain
    if (wasAdmin) {
      const membersSnap = await get(rtdbRef(this.db, `groups/${groupId}/members`));
      if (membersSnap.exists()) {
        const members = membersSnap.val() || {};
        const remainingIds: string[] = Object.keys(members).filter(
          (mid) => String(mid) !== String(userId)
        );

        if (remainingIds.length > 0) {
          // check if another admin already exists
          const otherAdmins = remainingIds.filter(
            (mid) => String(members[mid]?.role || '').toLowerCase() === 'admin'
          );

          if (otherAdmins.length === 0) {
            const nonAdmins = remainingIds.filter(
              (mid) =>
                String(members[mid]?.role || '').toLowerCase() !== 'admin'
            );
            const pool = nonAdmins.length > 0 ? nonAdmins : remainingIds;
            const newAdminId = pool[Math.floor(Math.random() * pool.length)];

            await update(
              rtdbRef(this.db, `groups/${groupId}/members/${newAdminId}`),
              { role: 'admin' }
            );
            //console.log(`Assigned new admin: ${newAdminId}`);
          } else {
            //console.log('Another admin already exists, no reassignment needed.');
          }
        }
      }
    }

    // 🔹 Optional: clear my unread count node
    try {
      await this.firebaseChatService.resetUnreadCount(groupId, userId);
    } catch (e) {
      console.warn('resetUnreadCount failed:', e);
    }
  }

  async markRoomAsRead() {
    console.log("message object is called 1")
    const me = this.senderUserId || this.authService.authData?.userId || '';
    if (!me) return;

    const selected = this.selectedChats || [];
    const roomIds = selected
      .filter((c) => !c.isCommunity)
      .map((c) =>
        c.roomId
      );

    // optimistic UI
    selected.forEach((c) => {
      c.unreadCount = 0;
      c.unread = false;
    });
    console.log("message object is called 2", roomIds)

    for (const roomId of roomIds) {
      try {
        const metaPath = `userchats/${me}/${roomId}`;
        const meta = await this.firebaseChatService.fetchOnce(metaPath);
        console.log("message object is called 3")

        const unreadCount = Number((meta && meta.unreadCount) || 0);
        if (!unreadCount) continue;

        const messagesSnap = await this.firebaseChatService.getMessagesSnap(
          roomId,
          unreadCount
        );

        const messagesObj = messagesSnap.exists() ? messagesSnap.val() : {};
        const messages = Object.keys(messagesObj)
          .map((k) => ({
            ...messagesObj[k],
            msgId: k,
            timestamp: messagesObj[k].timestamp ?? 0,
          }))
          .sort((a, b) => a.timestamp - b.timestamp);

        for (const m of messages) {

          if (m.msgId)
            console.log("message object is called")
          await this.firebaseChatService.markAsRead(
            m.msgId,
            roomId as string
          );
        }
        this.firebaseChatService.setUnreadCount(roomId);
      } catch (err) {
        console.error(`Error processing room ${roomId}`, err);
      }
    }
    this.clearChatSelection();
  }

  async markAsUnread() {
    const me = this.senderUserId || this.authService.authData?.userId || '';
    if (!me) return;

    // Build roomIds for selected chats (ignore communities)
    const roomIds = (this.selectedChats || [])
      .filter((c) => !c.isCommunity)
      .map(
        (c) =>
          c.roomId
      );

    if (roomIds.length === 0) return;

    for (const roomId of roomIds) {
      await this.firebaseChatService.setUnreadCount(roomId, 1);
    }

    this.clearChatSelection();
  }

  async prepareAndNavigateToChat(chat: any) {
    try {
      if (!chat) return;

      const receiverIdRaw = chat.receiver_Id || chat.receiverId || '';
      const isGroup = !!chat.group;
      const backendPhoneRaw =
        chat.receiver_phone || chat.phone_number || chat.phone || '';
      const deviceName = chat.name || '';
      const backendName = chat.name || '';
      const displayNameFromDeviceOrBackend =
        deviceName || backendPhoneRaw || backendName || 'Unknown';

      const cleanPhone = !isGroup
        ? this.normalizePhone(backendPhoneRaw || receiverIdRaw)
        : null;

      const receiverNameToSave =
        deviceName && deviceName !== 'Unknown'
          ? deviceName
          : backendPhoneRaw
            ? backendPhoneRaw
            : backendName || 'Unknown';

      if (isGroup) {
        await this.secureStorage.setItem(
          'receiver_name',
          chat.group_name || receiverNameToSave
        );
        await this.secureStorage.setItem('receiver_phone', chat.receiver_Id);
        this.router.navigate(['/chatting-screen'], {
          queryParams: { receiverId: receiverIdRaw, isGroup: true },
        });
      } else {
        const phoneToSave = cleanPhone || receiverIdRaw;
        await this.secureStorage.setItem('receiver_name', receiverNameToSave);
        await this.secureStorage.setItem('receiver_phone', phoneToSave);

        this.router.navigate(['/chatting-screen'], {
          queryParams: { receiverId: phoneToSave, receiver_phone: phoneToSave },
        });
      }
    } catch (err) {
      console.error('Error preparing navigation to chat:', err);
    }
  }

  private normalizePhone(num?: string): string {
    if (!num) return '';
    return num.replace(/\D/g, '').slice(-10);
  }

  /**
   * ---------- Chat loading (users) ----------
   */

  getChatAvatarUrl(chat: any): string | null {
    console.log("display chat from home page", chat)
    const id = chat.group ? chat.receiver_Id : chat.receiver_Id;
    if (id && this.avatarErrorIds.has(String(id))) return null;

    const url = chat.avatar;

    return url && String(url).trim() ? url : null;
  }

  getChatAlt(chat: any): string {
    const name = chat.group ? chat.group_name || chat.name : chat.name;
    return name || this.translate.instant('home.alt.profile');
  }

  getChatInitial(chat: any): string {
    const name = (chat.group ? chat.group_name || chat.name : chat.name) || '';
    const letter = name.trim().charAt(0);
    return letter ? letter.toUpperCase() : '?';
  }

  onAvatarError(chat: any): void {
    const id = chat.group ? chat.receiver_Id : chat.receiver_Id;
    if (id) this.avatarErrorIds.add(String(id));
  }

  userRooms(): Observable<string[]> {
    return new Observable((observer) => {
      const chatsRef = rtdbRef(getDatabase(), 'roomIds');

      // Firebase listener
      const unsub = rtdbOnValue(chatsRef, (snapshot: any) => {
        const data = snapshot.val();
        observer.next(!!data ? Object.keys(data) : []);
      });

      return {
        unsubscribe() {
          try {
            unsub();
          } catch (e) { }
        },
      };
    });
  }

  get isSelectionMode(): boolean {
    return this.selectedChats.length > 0;
  }

  private trackRouteChanges() {
    // this.versionService.checkVersion();
    this.versionService.checkAndNotify();
  }

  private mediaPreviewLabels: Record<string, string> = {
    image: '📷 Photo',
    video: '🎥 Video',
    audio: '🎵 Audio',
    file: '📎 Attachment',
    document: '📎 Document',
    contact: '👤 Contact',
    location: '📍 Location',
  };

  private truncatePreview(text: string | undefined | null, max = 60): string {
    if (!text) return '';
    const s = String(text).trim();
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
  }

  getPreviewText(chat: any): string {
    try {
      const type = (chat?.lastMessageType || '').toString().toLowerCase();

      if (type && this.mediaPreviewLabels[type]) {
        return this.mediaPreviewLabels[type];
      }
      const lm = chat?.lastMessage;
      if (lm && typeof lm === 'string') {
        if (/^(https?:\/\/)|mediaId|data:image\/|^\/?uploads\//i.test(lm)) {
          // assume image/file generic
          return this.mediaPreviewLabels['file'];
        }
      }
      const text = lm ?? '';
      return this.truncatePreview(text);
    } catch (err) {
      console.warn('getPreviewText error', err);
      return '';
    }
  }


  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();

    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } else if (isYesterday) {
      // return 'Yesterday';
      return this.translate.instant('home.time.yesterday');
    } else if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    } else {
      return date.toLocaleDateString();
    }
  }

  getTimeStamp(lastMessageAt: string | Date | undefined): string {
    if (!lastMessageAt) return '';
 
    const date = new Date(lastMessageAt);
    const now = new Date();
 
    // Check if the date is today
    const isToday = date.toDateString() === now.toDateString();
 
    // Check if the date is yesterday
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
 
    if (isToday) {
      // Return only time (e.g., "02:00 PM")
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } else if (isYesterday) {
      return this.translate.instant('home.time.yesterday');
    } else if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], {
        day: 'numeric', 
        month: 'short' 
      });
    } else {
      return date.toLocaleDateString();
    }
}

  private async getPreviewFromMessages(
    messages: any[]
  ): Promise<{ previewText: string; timestamp?: string } | null> {
    if (!messages || messages.length === 0) return null;

    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];

      // skip deleted / deleted for everyone
      if (m.isDeleted || m.deletedForEveryone) continue;

      // skip if deleted for current user
      try {
        if (
          m.deletedFor &&
          this.senderUserId &&
          m.deletedFor[String(this.senderUserId)]
        ) {
          continue;
        }
      } catch {
        /* ignore */
      }

      // media preview
      if (m.attachment?.type && m.attachment.type !== 'text') {
        let txt = this.translate.instant('home.preview.media.generic');
        switch ((m.attachment.type || '').toString()) {
          case 'image':
            txt = '📷 ' + this.translate.instant('home.preview.media.photo');
            break;
          case 'video':
            txt = '🎥 ' + this.translate.instant('home.preview.media.video');
            break;
          case 'audio':
            txt = '🎵 ' + this.translate.instant('home.preview.media.audio');
            break;
          case 'file':
            txt = '📎 ' + this.translate.instant('home.preview.media.file');
            break;
          default:
            txt = this.translate.instant('home.preview.media.generic');
        }
        return { previewText: txt, timestamp: m.timestamp };
      }

      // text (decrypt → fallback → skip empties)
      try {
        const dec = await this.encryptionService.decrypt(m.text || '');
        if (dec && String(dec).trim() !== '') {
          return { previewText: dec, timestamp: m.timestamp };
        } else if (m.text && String(m.text).trim() !== '') {
          return { previewText: m.text, timestamp: m.timestamp };
        } else {
          continue;
        }
      } catch {
        return {
          previewText: this.translate.instant('home.preview.encrypted'),
          timestamp: m.timestamp,
        };
      }
    }

    return null;
  }

  // get filteredChats() {
  //   // console.log("visible.length",this.chatList)
  //   let filtered = this.conversations;
  //   // console.log({filtered})
  //   // console.log("this.selectedFilter", this.selectedFilter);

  //   if (this.selectedFilter === 'read') {
  //     filtered = filtered.filter((chat) => chat.unreadCount === 0);
  //   } else if (this.selectedFilter === 'unread') {
  //     filtered = filtered.filter((chat) => (chat.unreadCount as number) > 0);
  //   } else if (this.selectedFilter === 'groups') {
  //     filtered = filtered.filter((chat) => chat.type === 'group');
  //   }

  //   if (this.searchText.trim() !== '') {
  //     const q = this.searchText.toLowerCase();
  //     filtered = filtered.filter(
  //       (chat) =>
  //         (chat.title || '').toLowerCase().includes(q)
  //         // (chat.message || '').toLowerCase().includes(q)
  //     );
  //   }

  //   return [...filtered].sort((a: any, b: any) => {
  //     const ap = a.pinned ? 1 : 0;
  //     const bp = b.pinned ? 1 : 0;
  //     if (ap !== bp) return bp - ap;

  //     if (ap === 1 && bp === 1) {
  //       const pa = Number(a.pinnedAt || 0);
  //       const pb = Number(b.pinnedAt || 0);
  //       if (pa !== pb) return pb - pa; // newest pin first
  //     }

  //     const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
  //     const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
  //     return tb - ta; // newest activity first
  //   });
  // }

  get filteredChats() {
    // console.log("visible.length",this.chatList)
    let filtered = this.conversations;
    console.log({filtered})
    // console.log("this.selectedFilter", this.selectedFilter);

    filtered = filtered.filter((chat) => {
      if (chat.type === 'group') {
        const roomId = chat.roomId || '';
        const title = (chat.title || '').toLowerCase();

        if (
          roomId.includes('_announcement') ||
          roomId.includes('_general') ||
          title === 'announcements' ||
          title === 'general'
        ) {
          return false;
        }
      }
      return true;
    });

    if (this.selectedFilter === 'read') {
      filtered = filtered.filter((chat) => chat.unreadCount === 0);
    } else if (this.selectedFilter === 'unread') {
      filtered = filtered.filter((chat) => (chat.unreadCount as number) > 0);
    } else if (this.selectedFilter === 'groups') {
      filtered = filtered.filter((chat) => chat.type === 'group');
    }

    if (this.searchText.trim() !== '') {
      const q = this.searchText.toLowerCase();
      filtered = filtered.filter(
        (chat) =>
          (chat.title || '').toLowerCase().includes(q)
        // (chat.message || '').toLowerCase().includes(q)
      );
    }

    return [...filtered].sort((a: any, b: any) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;

      if (ap === 1 && bp === 1) {
        const pa = Number(a.pinnedAt || 0);
        const pb = Number(b.pinnedAt || 0);
        if (pa !== pb) return pb - pa;
      }

      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
  }

  get totalUnreadCount(): number {
    return this.conversations.reduce(
      (sum, chat) => sum + ((chat?.unreadCount || 0) > 0 ? 1:0),
      0
    );
  }

  setFilter(filter: string) {
    this.selectedFilter = filter;
  }

  async openChat(chat: any) {
    console.log({ chat });
    await this.firebaseChatService.openChat(chat);
    try {
      if (chat.type == 'private') {
      const parts = chat.roomId.split('_');
      const receiverId =
        parts.find((p: string | null) => p !== this.senderUserId) ??
        parts[parts.length - 1];
      console.log({ receiverId });
      this.router.navigate(['/chatting-screen'], {
        queryParams: { receiverId: receiverId },
      });
    } else if (chat.type == 'community') {
      const receiverId = chat.roomId;
      this.router.navigate(['/community-detail'], {
        queryParams: { receiverId: receiverId },
      });
    } else {
      const receiverId = chat.roomId;
      this.router.navigate(['/chatting-screen'], {
        queryParams: { receiverId: receiverId },
      });
    }
    return;
    } catch (error) {
      console.error("chat not open", error)
    }
  }

  async loadUserCommunitiesForHome() {
    try {
      const userid = this.senderUserId;
      if (!userid) return;

      const communityIds: string[] =
        (await this.firebaseChatService.getUserCommunities(userid)) || [];

      for (const cid of communityIds) {
        // avoid duplicates
        const exists = this.chatList.find(
          (c: any) => c.receiver_Id === cid && c.isCommunity
        );
        if (exists) continue;

        // fetch community meta
        const commSnap = await get(
          rtdbRef(getDatabase(), `communities/${cid}`)
        );
        if (!commSnap.exists()) continue;
        const comm = commSnap.val();

        // fetch groups list under community
        const groupIds = await this.firebaseChatService.getGroupsInCommunity(
          cid
        );

        // choose preview group: announcement -> general -> first
        let previewGroupId: string | null = null;
        let previewGroupName = '';
        if (groupIds && groupIds.length > 0) {
          // try announcement
          for (const gid of groupIds) {
            const g = await this.firebaseChatService.getGroupInfo(gid);
            if (!g) continue;
            if (g.type === 'announcement') {
              previewGroupId = gid;
              previewGroupName = g.name || 'Announcements';
              break;
            }
          }
          // fallback to General
          if (!previewGroupId) {
            for (const gid of groupIds) {
              const g = await this.firebaseChatService.getGroupInfo(gid);
              if (!g) continue;
              if ((g.name || '').toLowerCase() === 'general') {
                previewGroupId = gid;
                previewGroupName = g.name || 'General';
                break;
              }
            }
          }
          // final fallback use first group id
          if (!previewGroupId) {
            previewGroupId = groupIds[0];
            const g = await this.firebaseChatService.getGroupInfo(
              previewGroupId
            );
            previewGroupName = g?.name || 'Group';
          }
        }

        // fetch last message for previewGroup (one-time)
        let previewText = '';
        let previewTime = '';
        if (previewGroupId) {
          try {
            const chatsSnap = await get(
              rtdbRef(getDatabase(), `chats/${previewGroupId}`)
            );
            const chatsVal = chatsSnap.val();
            if (chatsVal) {
              const msgs = Object.entries(chatsVal).map(([k, v]: any) => ({
                key: k,
                ...(v as any),
              }));
              const last = msgs[msgs.length - 1];
              if (last) {
                // derive preview text similar to other code
                if (last.isDeleted) previewText = 'This message was deleted';
                else if (
                  last.attachment?.type &&
                  last.attachment.type !== 'text'
                ) {
                  switch (last.attachment.type) {
                    case 'image':
                      previewText = '📷 Photo';
                      break;
                    case 'video':
                      previewText = '🎥 Video';
                      break;
                    case 'audio':
                      previewText = '🎵 Audio';
                      break;
                    case 'file':
                      previewText = '📎 Attachment';
                      break;
                    default:
                      previewText = '[Media]';
                  }
                } else {
                  try {
                    const dec = await this.encryptionService.decrypt(last.text);
                    previewText = dec;
                  } catch {
                    previewText = '[Encrypted]';
                  }
                }
                if (last.timestamp)
                  previewTime = this.formatTimestamp(last.timestamp);
              }
            }
          } catch (err) {
            console.warn(
              'failed to fetch last message for previewGroup',
              previewGroupId,
              err
            );
          }
        }

        // create typed community row
        const communityChat: CommunityChat = {
          name: comm.name || 'Community',
          receiver_Id: cid,
          group: true,
          isCommunity: true,
          group_name: previewGroupName || '',
          message: previewText || '',
          time: previewTime || '',
          unread: false,
          unreadCount: 0,
          dp: comm.icon || 'assets/images/multiple-users-silhouette (1).png',
        };

        // push typed object into list
        this.chatList.push(communityChat as any);

        // subscribe to unread count for previewGroup (if exists)
        if (previewGroupId) {
          const sub = this.firebaseChatService
            .listenToUnreadCount(previewGroupId, userid)
            .subscribe((count: number) => {
              // find target row and update typed fields
              const target = this.chatList.find(
                (c: any) => c.receiver_Id === cid && c.isCommunity
              ) as CommunityChat | undefined;
              if (target) {
                target.unreadCount = count;
                target.unread = count > 0;
              }
            });
          this.unreadSubs.push(sub);
          // keep a reference too if you want to cancel separately later
          this.communityUnreadSubs.set(cid, sub);
        }
      }

      // sort chatList same as other lists (by unread/time etc.)
      this.chatList.sort((a: any, b: any) => b.unreadCount - a.unreadCount);
    } catch (err) {
      console.error('loadUserCommunitiesForHome error', err);
    }
  }

  async presentPopover(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data?.action === 'readAll') {
      //console.log("Mark All Read clicked")
      await this.markAllAsReadOnHome();
    }
  }

  private async markAllAsReadOnHome(): Promise<void> {
    const me = this.senderUserId || this.authService.authData?.userId || '';
    if (!me) return;

    // collect roomIds for every visible chat (ignore communities unless they have previewGroupId)
    const roomIds: string[] = [];

    for (const chat of this.chatList || []) {
      // communities: use stored previewGroupId (see change below in loadUserCommunitiesForHome)
      if (chat.isCommunity) {
        if (chat.previewGroupId) roomIds.push(String(chat.previewGroupId));
        continue;
      }

      // groups: groupId is the roomId
      if (chat.group) {
        roomIds.push(String(chat.receiver_Id));
      } else {
        // private: build a_roomId
        roomIds.push(this.getRoomId(String(me), String(chat.receiver_Id)));
      }
    }

    // de-duplicate & filter empty
    const uniqueRoomIds = Array.from(new Set(roomIds)).filter((r) => !!r);

    if (uniqueRoomIds.length === 0) return;

    try {
      // use your firebase helper (same used elsewhere)
      await this.firebaseChatService.markManyRoomsAsRead(
        uniqueRoomIds,
        String(me)
      );

      // optimistic UI update
      this.chatList.forEach((c) => {
        c.unread = false;
        c.unreadCount = 0;
      });
    } catch (err) {
      console.warn('markAllAsReadFromHome failed', err);
    }
  }

  goToContact() {
    this.router.navigate(['/contact-screen']);
  }

/**
   * Open camera and handle image cropping
   */
  // async openCamera() {
  //   try {
  //     // Capture image from camera
  //     const image = await Camera.getPhoto({
  //       source: CameraSource.Camera,
  //       quality: 90,
  //       resultType: CameraResultType.Uri,
  //     });

  //     if (!image.webPath) {
  //       throw new Error('No image path returned');
  //     }

  //     // Show loading indicator
  //     const loading = await this.loadingController.create({
  //       message: 'Processing image...',
  //       duration: 10000,
  //     });
  //     await loading.present();

  //     // Convert image to blob
  //     const response = await fetch(image.webPath);
  //     const blob = await response.blob();

  //     // Validate file size
  //     if (blob.size > this.MAX_FILE_SIZE) {
  //       await loading.dismiss();
  //       const toast = await this.toastCtrl.create({
  //         message: 'Image size should be less than 5MB',
  //         duration: 3000,
  //         color: 'danger',
  //       });
  //       await toast.present();
  //       return;
  //     }

  //     // Convert blob to data URL for cropper
  //     const imageUrl = await this.blobToDataURL(blob);
  //     await loading.dismiss();

  //     // Open image cropper modal
  //     await this.openImageCropperForCamera(imageUrl, blob, image.format || 'jpg');

  //   } catch (error) {
  //     console.error('Camera error:', error);
      
  //     const toast = await this.toastCtrl.create({
  //       message: 'Failed to capture photo. Please try again.',
  //       duration: 2000,
  //       color: 'danger',
  //     });
  //     await toast.present();
  //   }
  // }

async openCamera() {
    try {
      // Capture photo from camera
      const image = await Camera.getPhoto({
        source: CameraSource.Camera,
        quality: 90,
        resultType: CameraResultType.Uri,
      });

      if (!image.webPath) {
        throw new Error('No image path returned');
      }

      // Fetch the image blob from the webPath
      const response = await fetch(image.webPath);
      const blob = await response.blob();

      // Generate filename with timestamp
      const timestamp = Date.now();
      const fileName = `camera_${timestamp}.${image.format || 'jpg'}`;
      const mimeType = `image/${image.format || 'jpeg'}`;

      // Create preview URL (same as pickAttachment)
      const previewUrl = URL.createObjectURL(blob);

      // Set selectedAttachment exactly like pickAttachment does
      this.selectedAttachment = {
        type: 'image',
        blob: blob,
        fileName: fileName,
        mimeType: mimeType,
        fileSize: blob.size,
        previewUrl: previewUrl,
      };
      console.log("this selected attachment", this.selectedAttachment);

      // Show preview modal (same as pickAttachment)
      this.showPreviewModal = true;
    } catch (error) {
      console.error('Camera error:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to capture photo. Please try again.',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

/**
 * 🖼️ Open cropper modal for image editing
 */
async openCropperModal(attachment: any) {
  if (!attachment || attachment.type !== 'image') {
    console.warn('⚠️ No image attachment to crop');
    return;
  }

  try {
    const modal = await this.modalController.create({
      component: ImageCropperModalComponent,
      componentProps: {
        imageUrl: attachment.previewUrl,
        aspectRatio: 0, // Free aspect ratio (set to 1 for square, 16/9 for landscape)
        cropQuality: 0.9
      },
      cssClass: 'image-cropper-modal',
      backdropDismiss: false, // Prevent accidental dismissal
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<CropResult>();

    if (data && data.success && data.originalBlob) {
      // ✅ Revoke old preview URL to free memory
      if (attachment.previewUrl) {
        try {
          URL.revokeObjectURL(attachment.previewUrl);
        } catch (e) {
          console.warn('Failed to revoke old preview URL:', e);
        }
      }

      // ✅ Create new preview URL from cropped blob
      const newPreviewUrl = URL.createObjectURL(data.originalBlob);

      // ✅ Generate new filename with timestamp
      const timestamp = Date.now();
      const fileExtension = attachment.fileName.split('.').pop() || 'jpg';
      const newFileName = `cropped_${timestamp}.${fileExtension}`;

      // ✅ Update selectedAttachment with cropped image data
      this.selectedAttachment = {
        ...attachment,
        blob: data.originalBlob,
        previewUrl: newPreviewUrl,
        fileName: newFileName,
        fileSize: data.originalBlob.size,
        mimeType: data.originalBlob.type || attachment.mimeType,
        caption: '' // Initialize empty caption
      };

      console.log('✅ Cropped attachment ready:', this.selectedAttachment);

      // ✅ Store in Firebase service for cross-page access
      this.firebaseChatService.setSelectedAttachment(this.selectedAttachment);

      // ✅ Show preview modal
      this.showPreviewModal = true;

      // ✅ Show success toast
      const toast = await this.toastCtrl.create({
        message: 'Image cropped successfully',
        duration: 1500,
        color: 'success'
      });
      await toast.present();

    } else if (data && data.cancelled) {
      // User cancelled cropping - clean up
      console.log('🚫 Cropping cancelled by user');
      
      if (attachment.previewUrl) {
        try {
          URL.revokeObjectURL(attachment.previewUrl);
        } catch (e) {
          console.warn('Failed to revoke preview URL:', e);
        }
      }
      
    } else if (data && data.error) {
      // Show error toast
      const toast = await this.toastCtrl.create({
        message: data.error,
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
    }

  } catch (error) {
    console.error('❌ Error opening cropper modal:', error);
    
    const toast = await this.toastCtrl.create({
      message: 'Failed to open image editor',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
}

/**
 * ❌ Cancel attachment and close preview modal
 */
cancelAttachment() {
  // Revoke object URL to prevent memory leaks
  if (this.selectedAttachment?.previewUrl) {
    try {
      URL.revokeObjectURL(this.selectedAttachment.previewUrl);
    } catch (e) {
      console.warn('Failed to revoke preview URL:', e);
    }
  }

  this.selectedAttachment = null;
  this.showPreviewModal = false;
  this.messageText = '';
  
  console.log('🗑️ Attachment cancelled');
}

/**
 * 📤 Navigate to contact list with attachment and caption
 */
async goToContactList() {
  if (!this.selectedAttachment) {
    const toast = await this.toastCtrl.create({
      message: 'No attachment to send',
      duration: 2000,
      color: 'warning'
    });
    await toast.present();
    return;
  }

  console.log('📤 Navigating to contact list with attachment');
  
  // ✅ Add caption to attachment object
  this.selectedAttachment.caption = this.messageText.trim();
  
  // ✅ Update in Firebase service
  this.firebaseChatService.setSelectedAttachment(this.selectedAttachment);
  
  // ✅ Close preview modal
  this.showPreviewModal = false;
  
  // ✅ Navigate with state
  setTimeout(() => {
    this.router.navigate(['/select-contact-list'], {
      state: {
        attachmentData: this.selectedAttachment,
        caption: this.messageText.trim(),
        fromCamera: true
      }
    });
    
    // ✅ Clear local state after navigation
    this.messageText = '';
  }, 100);
}

  /**
   * Convert blob to data URL
   */
  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Open image cropper modal for camera images
   */
  private async openImageCropperForCamera(
    imageUrl: string, 
    originalBlob: Blob, 
    format: string
  ) {
    const modal = await this.modalController.create({
      component: ImageCropperModalComponent,
      componentProps: {
        imageUrl: imageUrl,
        cropQuality: 0.9,
      },
      cssClass: 'image-cropper-modal',
      backdropDismiss: false,
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<CropResult>();

    if (data?.success && data.croppedImage && data.originalBlob) {
      // Generate filename
      const timestamp = Date.now();
      const fileName = `camera_cropped_${timestamp}.${format}`;
      const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`;

      const previewUrl = URL.createObjectURL(originalBlob);

      // Set cropped image as selected attachment
      this.selectedAttachment = {
        type: 'image',
        blob: data.originalBlob, // Use cropped blob
        fileName: fileName,
        mimeType: mimeType,
        fileSize: data.originalBlob.size,
        previewUrl: data.croppedImage, // Use cropped data URL for preview
      };

      console.log('Cropped attachment:', this.selectedAttachment);
      this.firebaseChatService.setSelectedAttachment(this.selectedAttachment);

      // Show preview modal
      this.showPreviewModal = true;

      // Show success toast
      const toast = await this.toastCtrl.create({
        message: 'Image cropped successfully!',
        duration: 2000,
        color: 'success',
      });
      await toast.present();

    } else if (data?.error) {
      // Show error toast
      const toast = await this.toastCtrl.create({
        message: data.error,
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    }
    // If cancelled, do nothing
  }

  /**
   * Cancel attachment and close preview
   */
  // cancelAttachment() {
  //   if (this.selectedAttachment?.previewUrl) {
  //     try {
  //       URL.revokeObjectURL(this.selectedAttachment.previewUrl);
  //     } catch (e) {
  //       console.warn('Failed to revoke preview URL:', e);
  //     }
  //   }
    
  //   this.selectedAttachment = null;
  //   this.showPreviewModal = false;
  //   this.messageText = '';
  // }

  // /**
  //  * Navigate to contact list with attachment
  //  */
  // async goToContactList() {
  //   console.log('Navigating to contact list with attachment');
    
  //   this.showPreviewModal = false;
    
  //   setTimeout(() => {
  //     this.router.navigate(['/select-contact-list'], {
  //       state: {
  //         attachmentData: this.selectedAttachment,
  //         caption: this.messageText.trim(),
  //         fromCamera: true
  //       }
  //     });
  //   }, 100);
  // }

  async scanBarcode() {
    // try {
    //   if (!Capacitor.isNativePlatform()) {
    //     alert(this.translate.instant('home.scan.onlyDevice'));
    //     return;
    //   }
    //   const permission = await BarcodeScanner.checkPermission({ force: true });
    //   if (!permission.granted) {
    //     alert(this.translate.instant('home.scan.permission'));
    //     return;
    //   }
    //   await BarcodeScanner.prepare();
    //   await BarcodeScanner.hideBackground();
    //   document.body.classList.add('scanner-active');

    //   const result = await BarcodeScanner.startScan();
    //   if (result?.hasContent) {
    //     this.scannedText = result.content;
    //   } else {
    //     alert(this.translate.instant('home.scan.notFound'));
    //   }
    // } catch (error) {
    //   console.error('Barcode Scan Error:', error);
    //   alert(this.translate.instant('home.scan.error'));
    // } finally {
    //   await BarcodeScanner.showBackground();
    //   await BarcodeScanner.stopScan();
    //   document.body.classList.remove('scanner-active');
    // }
  }

  getRoomId(a: string, b: string): string {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  /**
   * ------------- Typing listeners helpers -------------
   *
   * startTypingListenerForChat(chat) : starts an onValue listener on typing/{roomId}
   * stopTypingListenerForChat(chat)  : stops that listener
   *
   * The typing node format expected:
   * typing/{roomId}/{userId} => { typing: true, name: 'Rahul', lastUpdated: <ms> }
   */
  private startTypingListenerForChat(chat: any) {
    try {
      // compute roomId
      const db = getDatabase();
      const roomId = chat.group
        ? chat.receiver_Id
        : this.getRoomId(this.senderUserId || '', chat.receiver_Id);
      if (!roomId) return;

      if (this.typingUnsubs.has(roomId)) return; // already listening

      const typingRef = rtdbRef(db, `typing/${roomId}`);

      const unsub = rtdbOnValue(typingRef, (snapshot) => {
        const val = snapshot.val() || {};
        const now = Date.now();

        if (!chat.group) {
          // For private: see if the other user has a node set
          const otherUserKey = chat.receiver_Id;
          const entry = val[otherUserKey] || null;

          // If writer writes boolean directly or object
          const isTyping = entry
            ? !!entry.typing
            : Object.keys(val).length === 0
              ? false
              : !!val;

          chat.isTyping = !!isTyping;
          chat.typingText = isTyping ? chat.name || 'typing...' : null;
        } else {
          // Group: count recent typers (exclude current user)
          const entries = Object.keys(val).map((k) => ({
            userId: k,
            typing: val[k]?.typing ?? !!val[k],
            lastUpdated: val[k]?.lastUpdated ?? 0,
            name: val[k]?.name ?? null,
          }));

          const recent = entries.filter(
            (e) =>
              e.userId !== this.senderUserId &&
              e.typing &&
              now - (e.lastUpdated || 0) < 10000
          );

          chat.typingCount = recent.length;
          chat.isTyping = recent.length > 0;

          if (recent.length === 1) {
            const r = recent[0];
            // name prefer from DB entry, fallback to group members map
            chat.typingText =
              r.name || this.lookupMemberName(chat, r.userId) || null;
          } else {
            chat.typingText = null;
          }
        }
      });

      // store unsubscribe
      this.typingUnsubs.set(roomId, unsub);
    } catch (err) {
      console.warn('startTypingListenerForChat error', err);
    }
  }

  private stopTypingListenerForChat(chat: any) {
    try {
      const roomId = chat.group
        ? chat.receiver_Id
        : this.getRoomId(this.senderUserId || '', chat.receiver_Id);
      if (!roomId) return;
      const unsub = this.typingUnsubs.get(roomId);
      if (unsub) {
        try {
          unsub();
        } catch (e) { }
        this.typingUnsubs.delete(roomId);
      }
    } catch (err) { }
  }

  // try to lookup member name from loaded group members (if available)
  private lookupMemberName(groupChat: any, userId: string): string | null {
    try {
      if (!groupChat || !groupChat.members) return null;
      const m = groupChat.members[userId];
      return m?.name || null;
    } catch (e) {
      return null;
    }
  }
}
