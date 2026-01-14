import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
import { Subscription } from 'rxjs';
import { EncryptionService } from '../services/encryption.service';
import { Capacitor } from '@capacitor/core';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';
import { AuthService } from '../auth/auth.service';
import { Observable } from 'rxjs';
import { Database } from '@angular/fire/database';
import { ContactSyncService } from '../services/contact-sync.service';
import { Device } from '@capacitor/device';
import { PushNotifications } from '@capacitor/push-notifications';
import { FcmService } from '../services/fcm-service';
import { NetworkService } from '../services/network-connection/network.service';

// Firebase modular imports
import {
  getDatabase,
  ref as rtdbRef,
  onValue as rtdbOnValue,
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
import { CommunityChat } from 'src/types';

import { SqliteService, IConversation } from '../services/sqlite.service';
import { ImageCropperModalComponent } from 'src/app/components/image-cropper-modal/image-cropper-modal.component';
import { CropResult } from 'src/types';
import { ChatPouchDb } from '../services/chat-pouch-db';

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
  // Search & Filter
  searchText = '';
  selectedFilter = 'all';

  // User Info
  currUserId: string | null = null;
  senderUserId: string | null = null;
  sender_name: string | undefined;

  // UI State
  isLoading: boolean = true;
  isChatsLoaded: boolean = false;
  showPopup = false;
  showPreviewModal: boolean = false;
  isOffline: boolean = false; // 🔥 NEW: Offline indicator

  // Selection Mode
  selectedChats: any[] = [];
  selectedConversations: Set<string> = new Set();
  private longPressTimer: any = null;

  // Conversations
  conversations: (IConversation & {
    isTyping: boolean;
    isSelected: boolean;
    isSelfChat?: boolean;
  })[] = [];
  archievedCount: number = 0;

  // Attachment & Preview
  selectedAttachment: any = null;
  selectedChat: any = null;
  selectedImage: string | null = null;
  messageText = '';

  // Maps & Sets
  private avatarErrorIds = new Set<string>();
  private typingUnsubs: Map<string, () => void> = new Map();
  private communityUnreadSubs: Map<string, any> = new Map();
  private archivedMap: Record<
    string,
    { archivedAt: number; isArchived: boolean }
  > = {};
  private lockedMap: Record<string, { lockedAt: number; isLocked: boolean }> =
    {};

  // Subscriptions
  unreadSubs: Subscription[] = [];
  private pinUnsub: (() => void) | null = null;
  private archiveUnsub: (() => void) | null = null;
  private networkSub: Subscription | null = null; // 🔥 NEW: Network subscription

  // Constants
  private readonly MAX_PINNED = 3;
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  // Legacy compatibility (kept for HTML template)
  chatList: any[] = [];
  toggleGroupCreator = false;
  newGroupName = '';
  scannedText = '';
  capturedImage = '';
  isSending = false;
  receiver_name = '';
  typingUsers$: any;
  isTyping$: any;
  private isInitialLoadComplete = false;
  private conversationsSubscription: any = null;
  private prefetchedConversations = new Map<string, any>();
  private prefetchTimeout: any = null;
  isSyncing: boolean = false;

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
    private alertController: AlertController,
    private fcmService: FcmService,
    private networkService: NetworkService,
    private cdr: ChangeDetectorRef,
    private chatPouchDb : ChatPouchDb
  ) {}

  async ngOnInit() {
    this.currUserId = this.authService.authData?.phone_number || '';
    this.senderUserId = this.authService.authData?.userId || '';
    this.isLoading = true;
    this.trackRouteChanges();

    // 🔥 NEW: Setup network monitoring
    this.setupNetworkMonitoring();
  }

  /**
   * 🔥 NEW: Setup network status monitoring
   */
  private setupNetworkMonitoring(): void {
    this.networkSub = this.networkService.isOnline$.subscribe(
      async (isOnline) => {
        const wasOffline = this.isOffline;
        this.isOffline = !isOnline;

        console.log(
          `🌐 Network status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`
        );

        if (isOnline && wasOffline) {
          // Just came back online - sync data
          console.log('📡 Back online - syncing data...');
          await this.showToast('Back online - syncing...', 'success');
          await this.syncDataWhenOnline();
        } else if (!isOnline && !wasOffline) {
          // Just went offline
          console.log('📴 Went offline - using cached data');
          await this.showToast('You are offline', 'warning');
        }
      }
    );

    // Set initial state
    this.isOffline = !this.networkService.isOnline.value;
  }

  /**
   * 🔥 NEW: Sync data when coming back online
   */
  private async syncDataWhenOnline(): Promise<void> {
    try {
      if (!this.authService.senderId) return;

      // Process pending actions from queue
      await this.firebaseChatService.processPendingActions?.();

      // Refresh conversations from server
      await this.firebaseChatService.syncConversationWithServer();

      console.log('✅ Data synced successfully');
    } catch (error) {
      console.error('❌ Error syncing data:', error);
    }
  }

 async ionViewWillEnter() {
    try {
      // ✅ Phase 1: Show loading indicator
      if (!this.isInitialLoadComplete) {
        this.isLoading = true;
      }

      await this.firebaseChatService.closeChat();

      if (!this.isInitialLoadComplete) {
        console.info('🚀 First time initialization...');

        const isOnline = this.networkService.isOnline.value;
        console.log(`📡 Network status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

        // ✅ Phase 2: Load cache FIRST (instant - 0.5s)
        await this.loadChatsFromCache();
        
        // ✅ Phase 3: Hide loading, show cached data
        this.isLoading = false;
        
        // ✅ Phase 4: Start background sync (non-blocking)
        if (isOnline) {
          this.isSyncing = true;
          this.initializeApp()
            .catch(err => console.warn('Init error:', err))
            .finally(() => this.isSyncing = false);
        } else {
          // Offline: Just initialize without sync
          await this.initializeApp();
        }

        // ✅ Phase 5: Subscribe to conversations
        if (!this.conversationsSubscription) {
          this.conversationsSubscription =
            this.firebaseChatService.conversations.subscribe((convs) => {
              this.archievedCount = convs.filter((c) => c.isArchived).length || 0;

              this.conversations = convs
                .map((c) => ({
                  ...c,
                  isTyping: false,
                  isSelected: false,
                  lastMessage: c.lastMessage ?? '',
                  isSelfChat: this.isSelfChat(c),
                }))
                .filter((c) => !c.isLocked && !c.isArchived);

              this.isChatsLoaded = true;
              this.cdr.detectChanges();
              console.log(`📊 Conversations updated: ${this.conversations.length}`);
            });
        }

        // ✅ Phase 6: Online-only checks (background)
        if (isOnline) {
          this.performOnlineChecks().catch(err => 
            console.warn('Online checks error:', err)
          );
        }

        this.isInitialLoadComplete = true;
      } else {
        // ✅ Subsequent visits: instant
        this.isLoading = false;
      }

      this.senderUserId = this.authService.authData?.userId || this.senderUserId || '';
      this.sender_name = this.authService.authData?.name || '';
      this.clearChatSelection();
      
    } catch (err) {
      console.warn('❌ ionViewWillEnter error:', err);
      this.isLoading = false;
      this.isSyncing = false;

      if (!this.networkService.isOnline.value) {
        await this.showToast('Using cached data (offline)', 'warning');
      } else {
        await this.showToast('Failed to load some data', 'danger');
      }
    }
  }

  private async loadChatsFromCache(): Promise<void> {
    try {
      console.log('📦 Loading chats from PouchDB cache...');
      
      const startTime = performance.now();
      
      const cachedConversations = await this.chatPouchDb.getConversations(
        this.authService.senderId as string
      );

      const loadTime = performance.now() - startTime;
      console.log(`⏱️ Cache load time: ${loadTime.toFixed(2)}ms`);

      if (cachedConversations.length > 0) {
        // ✅ Update UI immediately
        this.conversations = cachedConversations
          .map((c) => ({
            ...c,
            isTyping: false,
            isSelected: false,
            lastMessage: c.lastMessage ?? '',
            isSelfChat: this.isSelfChat(c),
          }))
          .filter((c) => !c.isLocked && !c.isArchived);

        this.archievedCount = cachedConversations.filter((c) => c.isArchived).length || 0;
        this.isChatsLoaded = true;

        console.log(`✅ Loaded ${this.conversations.length} chats from cache`);
      } else {
        console.log('📭 No cached chats found');
      }
    } catch (error) {
      console.error('❌ Error loading from cache:', error);
      // Don't throw - let the app continue with server sync
    }
  }


  /**
   * 🔥 NEW: Initialize app with network awareness
   */
private async initializeApp(): Promise<void> {
    try {
      const isOnline = this.networkService.isOnline.value;

      // ✅ Start Firebase init (triggers background sync)
      const initPromise = this.firebaseChatService.initApp(
        this.authService.senderId as string
      );

      if (isOnline) {
        // ✅ Run notification check in parallel (non-blocking)
        this.checkAndUpdateNotificationPermission().catch(err => 
          console.warn('Notification check failed:', err)
        );
        
        // ✅ Wait for Firebase init to complete
        await initPromise;
      } else {
        // ✅ Offline: just init without waiting
        await initPromise;
      }
    } catch (error) {
      console.error('❌ initializeApp error:', error);
      // Don't throw - allow app to continue with cached data
      await this.showToast('Using cached data', 'warning');
    }
  }

  /**
   * 🔥 NEW: Perform online-only checks
   */
  private async performOnlineChecks(): Promise<void> {
    try {
      // Sequential checks (don't block UI if they fail)
      await this.checkForceLogout().catch((err) =>
        console.warn('Force logout check failed:', err)
      );

      const verified = await this.verifyDeviceOnEnter().catch((err) => {
        console.warn('Device verification failed:', err);
        return true; // Continue even if verification fails
      });

      if (!verified) {
        console.warn('⚠️ Device verification failed');
      }
    } catch (error) {
      console.warn('❌ performOnlineChecks error:', error);
      // Don't throw - allow app to continue with cached data
    }
  }

  /**
   * ✅ Check notification permission and update Firebase (ONLINE ONLY)
   */
  private async checkAndUpdateNotificationPermission(): Promise<void> {
    try {
      // 🔥 Skip if offline
      if (!this.networkService.isOnline.value) {
        console.log('⚠️ Skipping notification check - device is offline');
        return;
      }

      const userId = this.senderUserId || this.authService.authData?.userId;

      if (!userId) {
        console.warn(
          '⚠️ Cannot check notification permission: userId is missing'
        );
        return;
      }

      console.log('🔔 Checking notification permission status...');

      const permStatus = await PushNotifications.checkPermissions();
      const isGranted = permStatus.receive === 'granted';

      await this.fcmService.updatePermissionStatus(userId, isGranted);

      console.log(`✅ Firebase isPermission updated to: ${isGranted}`);
    } catch (error) {
      console.error(
        '❌ Error checking/updating notification permission:',
        error
      );
      // Don't throw - this is not critical
    }
  }

  /**
   * ✅ Get typing status for conversation
   */
  getTypingStatusForConv(roomId: string) {
    return this.firebaseChatService.getTypingStatusForRoom(roomId);
  }

  /**
   * ✅ Check if chat is self chat
   */
  isSelfChat(chat: any): boolean {
    if (chat.type !== 'private' || !chat.roomId || !this.senderUserId) {
      return false;
    }

    const parts = chat.roomId.split('_');
    return (
      parts.length === 2 &&
      parts[0] === this.senderUserId &&
      parts[1] === this.senderUserId
    );
  }

  /**
   * ✅ Show new chat prompt
   */
  get showNewChatPrompt(): boolean {
    return (
      !this.isLoading &&
      this.firebaseChatService.currentConversations.length === 0
    );
  }

  /**
   * ✅ Verify device on enter (ONLINE ONLY)
   */
  async verifyDeviceOnEnter(): Promise<boolean> {
    // 🔥 Skip if offline
    if (!this.networkService.isOnline.value) {
      console.log('⚠️ Skipping device verification - device is offline');
      return true;
    }

    if (!this.senderUserId) {
      console.warn('Skipping device verification: senderUserId is missing');
      return false;
    }

    try {
      const platform = Capacitor.getPlatform();
      let info: any;

      if (platform === 'web') {
        info = {
          model: navigator.userAgent.includes('Mobile')
            ? 'Mobile Web'
            : 'Desktop Web',
          operatingSystem: 'Web',
          osVersion: 'N/A',
          uuid: localStorage.getItem('device_uuid') || crypto.randomUUID(),
        };
        if (!localStorage.getItem('device_uuid')) {
          localStorage.setItem('device_uuid', info.uuid);
        }
      } else {
        info = await Device.getInfo();
      }

      let appVersion = '1.0.0';
      if (platform !== 'web') {
        try {
          const versionResult = await this.versionService.checkVersion();
          appVersion = versionResult.currentVersion || '1.0.0';
        } catch (versionErr) {
          console.warn('Version check failed:', versionErr);
        }
      } else {
        appVersion = 'web.1.0.0';
      }

      const uuid =
        localStorage.getItem('device_uuid') || info.uuid || crypto.randomUUID();
      if (!localStorage.getItem('device_uuid')) {
        localStorage.setItem('device_uuid', uuid);
      }

      const payload = {
        user_id: this.senderUserId,
        device_details: {
          device_uuid: uuid,
          device_model: info.model,
          os_name: info.operatingSystem,
          os_version: info.osVersion,
          app_version: appVersion,
        },
      };

      const res: any = await this.authService.verifyDevice(payload);

      if (res.device_mismatch) {
        const backButtonHandler = (ev: any) =>
          ev.detail.register(10000, () => {});
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

      return true;
    } catch (err) {
      console.error('Verify Device API error:', err);
      return true; // 🔥 Allow app to continue even if verification fails
    }
  }

  /**
   * ✅ Check force logout (ONLINE ONLY)
   */
  private async checkForceLogout(): Promise<void> {
    try {
      // 🔥 Skip if offline
      if (!this.networkService.isOnline.value) {
        console.log('⚠️ Skipping force logout check - device is offline');
        return;
      }

      const uidStr = this.senderUserId || this.authService.authData?.userId;
      const uid = Number(uidStr);
      if (!uid) return;

      this.service.checkUserLogout(uid).subscribe({
        next: async (res: any) => {
          if (!res) return;
          const force = Number(res.force_logout);

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
                    } catch {}
                  },
                },
              ],
            });
            await alert.present();
          }
        },
        error: (err) => {
          console.warn('Force logout check failed:', err);
        },
      });
    } catch (error) {
      console.warn('checkForceLogout error:', error);
    }
  }

  /**
   * ✅ Clear chat data
   */
  private clearChatData() {
    this.unreadSubs.forEach((sub) => sub.unsubscribe());
    this.unreadSubs = [];

    this.typingUnsubs.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {}
    });
    this.typingUnsubs.clear();

    this.chatList = [];
  }

  /**
   * ✅ Component cleanup
   */
  ngOnDestroy() {
    this.unreadSubs.forEach((sub) => sub.unsubscribe());
    this.unreadSubs = [];

    this.typingUnsubs.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {}
    });
    this.typingUnsubs.clear();

    try {
      this.pinUnsub?.();
    } catch {}
    this.pinUnsub = null;

    try {
      this.archiveUnsub?.();
    } catch {}
    this.archiveUnsub = null;

    if (this.conversationsSubscription) {
      this.conversationsSubscription.unsubscribe();
      this.conversationsSubscription = null;
    }

    // 🔥 NEW: Cleanup network subscription
    if (this.networkSub) {
      this.networkSub.unsubscribe();
      this.networkSub = null;
    }

    if (this.firebaseChatService._userChatsListener) {
      try {
        this.firebaseChatService._userChatsListener();
      } catch {}
    }
  }

  // ========================================
  // 🎯 POPUP & NAVIGATION
  // ========================================

  /**
   * ✅ Navigate to user profile
   */
  goToUserAbout() {
    this.showPopup = false;

    setTimeout(async () => {
      try {
        const chat = this.selectedChat;

        if (!chat?.roomId) {
          await this.showToast('Invalid chat data', 'warning');
          return;
        }

        await this.firebaseChatService.openChat(chat);

        let receiverId: string;

        if (chat.type === 'private') {
          const parts = chat.roomId.split('_');
          receiverId =
            parts.find((p: string) => p !== this.senderUserId) ??
            parts[parts.length - 1];
        } else {
          receiverId = chat.roomId;
        }

        this.router.navigate(['/profile-screen'], {
          queryParams: {
            receiverId: receiverId,
            isGroup: chat.type === 'group',
          },
        });

        this.selectedChat = null;
        this.selectedImage = null;
      } catch (error) {
        console.error('❌ Error opening profile:', error);
        await this.showToast('Failed to open profile', 'danger');
      }
    }, 100);
  }

  /**
   * ✅ Navigate to user chat
   */
  async goToUserchat() {
    this.showPopup = false;

    setTimeout(async () => {
      try {
        const chat = this.selectedChat;

        if (!chat?.roomId) {
          await this.showToast('Invalid chat data', 'warning');
          return;
        }

        await this.firebaseChatService.openChat(chat);

        if (chat.type === 'private') {
          const parts = chat.roomId.split('_');
          const receiverId =
            parts.find((p: string) => p !== this.senderUserId) ??
            parts[parts.length - 1];
          this.router.navigate(['/chatting-screen'], {
            queryParams: { receiverId },
          });
        } else if (chat.type === 'group') {
          this.router.navigate(['/chatting-screen'], {
            queryParams: { receiverId: chat.roomId },
          });
        } else if (chat.type === 'community') {
          this.router.navigate(['/community-detail'], {
            queryParams: { receiverId: chat.roomId },
          });
        }

        this.selectedChat = null;
        this.selectedImage = null;
      } catch (error) {
        console.error('❌ Error opening chat:', error);
        await this.showToast('Failed to open chat', 'danger');
      }
    }, 100);
  }

  goToUsercall() {
    // 🔥 Check network before allowing calls
    if (this.isOffline) {
      this.showToast('Calls require internet connection', 'warning');
      return;
    }
    this.showPopup = false;
    setTimeout(() => {
      // this.router.navigate(['/calls-screen']);
    }, 100);
  }

  goToUservideocall() {
    // 🔥 Check network before allowing video calls
    if (this.isOffline) {
      this.showToast('Video calls require internet connection', 'warning');
      return;
    }
    this.showPopup = false;
    setTimeout(() => {
      // this.router.navigate(['/calling-screen']);
    }, 100);
  }

  /**
   * ✅ Open image popup
   */
  openImagePopup(chat: any) {
    if (!chat?.roomId) {
      this.showToast('Invalid chat data', 'warning');
      return;
    }

    this.selectedChat = chat;
    this.selectedImage = chat.avatar || 'assets/images/user.jfif';
    this.showPopup = true;
  }

  /**
   * ✅ Close image popup
   */
  closeImagePopup() {
    this.selectedImage = null;
    this.selectedChat = null;
    this.showPopup = false;
  }

  // ========================================
  // 🎯 SELECTION MODE
  // ========================================

  /**
   * ✅ Handle chat row click
   */
  onChatRowClick(chat: any, ev: Event) {
    if (this.selectedChats.length > 0) {
      this.toggleChatSelection(chat, ev);
      return;
    }
    this.openChat(chat);
  }

  /**
   * ✅ Check if conversation is selected
   */
  isConvSelected(roomId: string): boolean {
    return this.selectedConversations.has(roomId);
  }

  /**
   * ✅ Check if chat is selected
   */
  isChatSelected(chat: any): boolean {
    if (chat.roomId) {
      return this.selectedConversations.has(chat.roomId);
    }
    return this.selectedChats.some((c) => this.sameItem(c, chat));
  }

  get selectedCount(): number {
    return this.selectedChats.length;
  }

  get hasSelection(): boolean {
    return this.selectedChats.length > 0;
  }

  /**
   * ✅ Toggle chat selection
   */
  toggleChatSelection(chat: any, ev?: Event) {
    if (ev) ev.stopPropagation();

    const isCommunity = chat.type === 'community';
    const already = this.selectedChats.find((c) => this.sameItem(c, chat));

    if (isCommunity) {
      if (this.hasNonCommunitySelected()) {
        console.log(
          '❌ Cannot select community while other chats are selected'
        );
        return;
      }

      const previouslySelectedCommunity = this.selectedChats.find(
        (c) => c.type === 'community'
      );

      if (already) {
        this.selectedChats = this.selectedChats.filter(
          (c) => !this.sameItem(c, chat)
        );
        if (chat.roomId) this.selectedConversations.delete(chat.roomId);
      } else if (previouslySelectedCommunity) {
        if (previouslySelectedCommunity.roomId) {
          this.selectedConversations.delete(previouslySelectedCommunity.roomId);
        }
        this.selectedChats = [chat];
        if (chat.roomId) this.selectedConversations.add(chat.roomId);
      } else {
        this.selectedChats = [chat];
        if (chat.roomId) this.selectedConversations.add(chat.roomId);
      }

      if (this.selectedChats.length === 0) this.cancelHomeLongPress();
      return;
    }

    if (this.hasCommunitySelected()) {
      console.log('❌ Cannot select other chats while community is selected');
      return;
    }

    if (already) {
      this.selectedChats = this.selectedChats.filter(
        (c) => !this.sameItem(c, chat)
      );
      if (chat.roomId) this.selectedConversations.delete(chat.roomId);
      if (this.selectedChats.length === 0) this.cancelHomeLongPress();
    } else {
      this.selectedChats.push(chat);
      if (chat.roomId) this.selectedConversations.add(chat.roomId);
    }
  }

  private hasCommunitySelected(): boolean {
    return this.selectedChats.some((c) => c.type === 'community');
  }

  private hasNonCommunitySelected(): boolean {
    return this.selectedChats.some((c) => c.type !== 'community');
  }

  private sameItem(a: any, b: any): boolean {
    if (a?.roomId && b?.roomId) {
      return a.roomId === b.roomId;
    }
    return (
      a?.receiver_Id === b?.receiver_Id &&
      !!a?.group === !!b?.group &&
      !!a?.isCommunity === !!b?.isCommunity
    );
  }

  /**
   * ✅ Clear selection
   */
  clearChatSelection() {
    this.selectedChats = [];
    this.selectedConversations.clear();
    this.cancelHomeLongPress();
  }

  /**
   * ✅ Start long press
   */
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

  /**
   * ✅ Cancel long press
   */
  cancelHomeLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /**
   * ✅ Selection metadata
   */
  get selectionMeta() {
    const sel = this.selectedChats || [];
    const count = sel.length;

    const includesCommunity = sel.some((c) => c.type === 'community');
    const includesGroup = sel.some((c) => c.type === 'group');
    const includesPrivate = sel.some((c) => c.type === 'private');

    const isSingleSelection = count === 1;
    const singleChat = isSingleSelection ? sel[0] : null;
    const isChatPinned = singleChat?.isPinned === true;

    const isSinglePrivate = isSingleSelection && singleChat?.type === 'private';
    const isSingleGroup = isSingleSelection && singleChat?.type === 'group';

    const isMultiPrivateOnly =
      count > 1 &&
      includesPrivate &&
      !includesGroup &&
      !includesCommunity &&
      sel.every((c) => c.type === 'private');

    const isMultiGroupsOnly =
      count > 1 &&
      includesGroup &&
      !includesPrivate &&
      !includesCommunity &&
      sel.every((c) => c.type === 'group');

    const isMixedPrivateAndGroups =
      count > 1 && includesPrivate && includesGroup && !includesCommunity;

    return {
      count,
      includesCommunity,
      includesGroup,
      includesPrivate,
      isSinglePrivatePinned: isSinglePrivate && isChatPinned,
      isSinglePrivateUnpinned: isSinglePrivate && !isChatPinned,
      isSingleGroupPinned: isSingleGroup && isChatPinned,
      isSingleGroupUnpinned: isSingleGroup && !isChatPinned,
      isMultiPrivateOnly,
      isMultiGroupsOnly,
      isMixedPrivateAndGroups,
      // Legacy properties
      isSingleUser: isSinglePrivate && !isChatPinned,
      isSinglePinned: (isSinglePrivate || isSingleGroup) && isChatPinned,
      isMultiUsersOnly: isMultiPrivateOnly,
    };
  }

  // ========================================
  // 🎯 SELECTION ACTIONS
  // ========================================

  /**
   * ✅ Pin selected chats
   */
  async onPinSelected() {
    const userId = this.senderUserId || this.authService.authData?.userId || '';
    if (!userId) {
      this.clearChatSelection();
      return;
    }

    const result = await this.firebaseChatService.setPinConversation(
      this.selectedChats.map((c) => c.roomId),
      true
    );

    if (!result.success && result.message) {
      const alert = await this.alertCtrl.create({
        header: 'Cannot Pin',
        message: result.message,
        buttons: ['OK'],
      });
      await alert.present();
    }

    this.clearChatSelection();
  }

  /**
   * ✅ Unpin selected chats
   */
  async onUnpinSelected() {
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

  /**
   * ✅ Delete multiple chats
   */
  async deleteMultipleChats() {
    if (!this.selectedChats || this.selectedChats.length === 0) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Delete Chats',
      message: 'Are you sure you want to delete selected chats?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.firebaseChatService.deleteChats(
                this.selectedChats.map((c) => c.roomId)
              );
              this.clearChatSelection();
            } catch (error) {
              console.error('Error deleting chats:', error);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * ✅ Delete selected chats
   */
  async onDeleteSelected() {
    try {
      const deletables = this.selectedChats.filter(
        (c) => c.type !== 'community'
      );

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
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Delete',
            handler: async () => {
              await this.deleteChatsForMe(deletables);
            },
          },
        ],
      });

      await alert.present();
    } catch (error) {
      console.error('❌ Delete error:', error);
      this.clearChatSelection();
    }
  }

  /**
   * ✅ Delete chats for me
   */
  private async deleteChatsForMe(chats: any[]) {
    try {
      const userId = this.senderUserId;
      if (!userId) return;

      for (const chat of chats) {
        const roomId = chat.group
          ? chat.receiver_Id
          : this.getRoomId(userId, chat.receiver_Id);

        await this.firebaseChatService.deleteChatForUser(roomId, userId);

        this.chatList = this.chatList.filter((c) => {
          if (chat.group && c.group) return c.receiver_Id !== chat.receiver_Id;
          if (chat.isCommunity && c.isCommunity)
            return c.receiver_Id !== chat.receiver_Id;
          if (!chat.group && !chat.isCommunity && !c.group && !c.isCommunity) {
            return c.receiver_Id !== chat.receiver_Id;
          }
          return true;
        });

        this.stopTypingListenerForChat(chat);
        const unreadSub = this.unreadSubs.find(() => true);
        if (unreadSub) {
          unreadSub.unsubscribe();
          this.unreadSubs = this.unreadSubs.filter((s) => s !== unreadSub);
        }
      }

      this.clearChatSelection();
    } catch (error) {
      console.error('❌ Error deleting chats:', error);
    }
  }

  /**
   * ✅ Mute selected
   */
  async onMuteSelected() {
    const alert = await this.alertCtrl.create({
      header: 'Mute notification',
      message: 'Work in progress',
      buttons: ['OK'],
    });
    await alert.present();
    this.clearChatSelection();
  }

  /**
   * ✅ Archive selected
   */
  async onArchievedSelected() {
    try {
      const userId =
        this.senderUserId || this.authService.authData?.userId || '';
      if (!userId) {
        this.clearChatSelection();
        return;
      }

      await this.firebaseChatService.setArchiveConversation(
        this.selectedChats.map((c) => c.roomId)
      );
      this.clearChatSelection();
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

  /**
   * ✅ More options menu
   */
  async onMoreSelected(ev: any) {
    const sel = this.selectedChats || [];

    const users = sel.filter((c) => c.type === 'private');
    const groups = sel.filter((c) => c.type === 'group');
    const communities = sel.filter((c) => c.type === 'community');

    const isSingleUser =
      users.length === 1 && groups.length === 0 && communities.length === 0;
    const isMultiUsers =
      users.length > 1 && groups.length === 0 && communities.length === 0;
    const isSingleGroup =
      groups.length === 1 && users.length === 0 && communities.length === 0;
    const isMultiGroups =
      groups.length > 1 && users.length === 0 && communities.length === 0;
    const isSingleCommunity =
      communities.length === 1 && users.length === 0 && groups.length === 0;
    const isMixedChats =
      users.length > 0 && groups.length > 0 && communities.length === 0;

    const unreadOf = (x: any) => Number(x?.unreadCount || 0) > 0;
    const single = sel.length === 1 ? sel[0] : null;
    const canMarkReadSingle = !!single && unreadOf(single);
    const canMarkUnreadSingle = !!single && !unreadOf(single);
    const anyUnreadSelected = sel.some(unreadOf);
    const allSelectedRead = sel.length > 0 && sel.every((x) => !unreadOf(x));
    const canMarkReadMulti = !single && anyUnreadSelected;
    const canMarkUnreadMulti = !single && allSelectedRead;

    let isCurrentUserMember = false;
    let canDeleteGroup = false;

    if (isSingleGroup && groups[0]) {
      const selectedGroup = groups[0];
      const currentUserId = this.senderUserId;

      if (selectedGroup.members && Array.isArray(selectedGroup.members)) {
        isCurrentUserMember = selectedGroup.members.includes(currentUserId);
        canDeleteGroup = !isCurrentUserMember;
      }
    }

    let isCommunityAdmin = false;
    let isCommunityMember = false;

    if (isSingleCommunity && communities[0]) {
      const selectedCommunity = communities[0];
      const currentUserId = this.senderUserId;

      if (
        selectedCommunity.adminIds &&
        Array.isArray(selectedCommunity.adminIds)
      ) {
        isCommunityAdmin = selectedCommunity.adminIds.includes(currentUserId);
      }

      if (
        selectedCommunity.members &&
        Array.isArray(selectedCommunity.members)
      ) {
        isCommunityMember = selectedCommunity.members.includes(currentUserId);
      }
    }

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
        isSingleCommunity,
        canMarkReadSingle,
        canMarkUnreadSingle,
        canMarkReadMulti,
        canMarkUnreadMulti,
        isCurrentUserMember,
        canDeleteGroup,
        isCommunityAdmin,
        isCommunityMember,
      },
    });
    await pop.present();

    const { data } = await pop.onDidDismiss();
    if (!data?.action) return;

    const actionHandlers: Record<string, () => Promise<void>> = {
      viewContact: () => this.openSelectedContactProfile(),
      groupInfo: () => this.openSelectedGroupInfo(),
      markUnread: () => this.markAsUnread(),
      markRead: () => this.markRoomAsRead(),
      selectAll: async () => this.selectAllVisible(),
      exitGroup: () => this.confirmAndExitSingleSelectedGroup(),
      exitGroups: () => this.confirmAndExitMultipleSelectedGroups(),
      deleteGroup: () => this.confirmAndDeleteGroup(),
      block: async () => {
        console.log('Block user action');
      },
    };

    const handler = actionHandlers[data.action];
    if (handler) {
      await handler();
    }
  }

  /**
   * ✅ Confirm and delete group
   */
  private async confirmAndDeleteGroup(): Promise<void> {
    const groups = this.selectedChats.filter((c) => c.type === 'group');
    const group = groups[0];

    if (!group) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete Group',
      message: `Are you sure you want to delete "${group.title}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          cssClass: 'danger-button',
          handler: async () => {
            try {
              await this.firebaseChatService.deleteGroup(group.roomId);

              this.chatList = this.chatList.filter(
                (c) => !(c.receiver_Id === group.receiver_Id && c.group)
              );

              this.conversations = this.conversations.filter(
                (c) => c.roomId !== group.roomId
              );

              this.stopTypingListenerForChat(group);
              this.clearChatSelection();

              await this.showToast('Group deleted successfully', 'success');
            } catch (error) {
              console.error('Error deleting group:', error);
              await this.showToast('Failed to delete group', 'danger');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * ✅ Open selected contact profile
   */
  private async openSelectedContactProfile(): Promise<void> {
    const chat = this.selectedChats[0];
    await this.firebaseChatService.openChat(chat);

    if (!chat) return;

    const parts = chat.roomId.split('_');
    const receiverId =
      parts.find((p: string | null) => p !== this.senderUserId) ??
      parts[parts.length - 1];

    this.router.navigate(['/profile-screen'], { queryParams: { receiverId } });
    this.clearChatSelection();
  }

  /**
   * ✅ Open selected group info
   */
  private async openSelectedGroupInfo(): Promise<void> {
    const chat = this.selectedChats[0];
    await this.firebaseChatService.openChat(chat);

    if (!chat) return;

    this.router.navigate(['/profile-screen'], {
      queryParams: {
        receiverId: chat.roomId,
        isGroup: chat.type === 'group',
      },
    });
    this.clearChatSelection();
  }

  private get visibleNonCommunityChats(): any[] {
    return this.filteredChats.filter((c) => c.type !== 'community');
  }

  private areAllVisibleSelected(): boolean {
    const visible = this.visibleNonCommunityChats;
    if (visible.length === 0) return false;

    const selectedRoomIds = new Set(this.selectedChats.map((c) => c.roomId));
    return visible.every((c) => selectedRoomIds.has(c.roomId));
  }

  private selectAllVisible(): void {
    if (this.areAllVisibleSelected()) {
      this.clearChatSelection();
      return;
    }

    const nonCommunityChats = this.visibleNonCommunityChats;

    this.selectedChats = [];
    this.selectedConversations.clear();

    nonCommunityChats.forEach((chat) => {
      this.selectedChats.push(chat);
      if (chat.roomId) {
        this.selectedConversations.add(chat.roomId);
      }
    });

    console.log(
      `✅ Selected ${this.selectedChats.length} chats (excluding communities)`
    );
  }

  /**
   * ✅ Exit single group
   */
  private async confirmAndExitSingleSelectedGroup(): Promise<void> {
    const sel = this.selectedChats.filter((c) => c.type == 'group');
    const chat = sel[0];
    if (!chat) return;

    const alert = await this.alertCtrl.create({
      header: 'Exit Group',
      message: `Are you sure you want to exit "${chat.title}"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Exit',
          handler: async () => {
            await this.exitGroup(chat.roomId);

            this.chatList = this.chatList.filter(
              (c) =>
                !(
                  c.receiver_Id === chat.receiver_Id &&
                  c.group &&
                  !c.isCommunity
                )
            );

            this.stopTypingListenerForChat(chat);
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

  /**
   * ✅ Exit multiple groups
   */
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

  /**
   * ✅ Exit group core logic
   */
  private async exitGroup(groupId: string): Promise<void> {
    const userId = this.senderUserId || this.authService.authData?.userId || '';
    if (!groupId || !userId) throw new Error('Missing groupId/userId');

    const memberPath = `groups/${groupId}/members/${userId}`;
    const memberSnap = await get(rtdbRef(this.db, memberPath));

    if (!memberSnap.exists()) return;

    const myMember = memberSnap.val();
    const wasAdmin = String(myMember?.role || '').toLowerCase() === 'admin';

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
        } catch {}
        await remove(rtdbRef(this.db, memberPath));
      })(),
    ]);

    if (wasAdmin) {
      const membersSnap = await get(
        rtdbRef(this.db, `groups/${groupId}/members`)
      );

      if (membersSnap.exists()) {
        const members = membersSnap.val() || {};
        const remainingIds = Object.keys(members).filter(
          (mid) => String(mid) !== String(userId)
        );

        if (remainingIds.length > 0) {
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
          }
        }
      }
    }

    try {
      await this.firebaseChatService.resetUnreadCount(groupId, userId);
    } catch (e) {
      console.warn('resetUnreadCount failed:', e);
    }
  }

  /**
   * ✅ Mark room as read
   */
  async markRoomAsRead() {
    const me = this.senderUserId || this.authService.authData?.userId || '';
    if (!me) return;

    const selected = this.selectedChats || [];
    const roomIds = selected.filter((c) => !c.isCommunity).map((c) => c.roomId);

    selected.forEach((c) => {
      c.unreadCount = 0;
      c.unread = false;
    });

    for (const roomId of roomIds) {
      try {
        const metaPath = `userchats/${me}/${roomId}`;
        const meta = await this.firebaseChatService.fetchOnce(metaPath);

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
          if (m.msgId) {
            await this.firebaseChatService.markAsRead(
              m.msgId,
              roomId as string
            );
          }
        }

        this.firebaseChatService.setUnreadCount(roomId);
      } catch (err) {
        console.error(`Error processing room ${roomId}`, err);
      }
    }

    this.clearChatSelection();
  }

  /**
   * ✅ Mark as unread
   */
  async markAsUnread() {
    const me = this.senderUserId || this.authService.authData?.userId || '';
    if (!me) return;

    const roomIds = (this.selectedChats || [])
      .filter((c) => !c.isCommunity)
      .map((c) => c.roomId);

    if (roomIds.length === 0) return;

    for (const roomId of roomIds) {
      await this.firebaseChatService.markUnreadChat(roomId, 1);
    }

    this.clearChatSelection();
  }

  // ========================================
  // 🎯 CHAT OPERATIONS
  // ========================================

  /**
   * ✅ Get chat avatar URL
   */
  getChatAvatarUrl(chat: any): string | null {
    const id = chat.group ? chat.receiver_Id : chat.receiver_Id;
    if (id && this.avatarErrorIds.has(String(id))) return null;

    const url = chat.avatar;
    return url && String(url).trim() ? url : null;
  }

  /**
   * ✅ Get chat alt text
   */
  getChatAlt(chat: any): string {
    const name = chat.group ? chat.group_name || chat.name : chat.name;
    return name || this.translate.instant('home.alt.profile');
  }

  /**
   * ✅ Get chat initial
   */
  getChatInitial(chat: any): string {
    const name = (chat.group ? chat.group_name || chat.name : chat.name) || '';
    const letter = name.trim().charAt(0);
    return letter ? letter.toUpperCase() : '?';
  }

  /**
   * ✅ Handle avatar error
   */
  onAvatarError(chat: any): void {
    const id = chat.group ? chat.receiver_Id : chat.receiver_Id;
    if (id) this.avatarErrorIds.add(String(id));
  }

  /**
   * ✅ User rooms observable
   */
  userRooms(): Observable<string[]> {
    return new Observable((observer) => {
      const chatsRef = rtdbRef(getDatabase(), 'roomIds');

      const unsub = rtdbOnValue(chatsRef, (snapshot: any) => {
        const data = snapshot.val();
        observer.next(!!data ? Object.keys(data) : []);
      });

      return {
        unsubscribe() {
          try {
            unsub();
          } catch (e) {}
        },
      };
    });
  }

  get isSelectionMode(): boolean {
    return this.selectedChats.length > 0;
  }

  private trackRouteChanges() {
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

  /**
   * ✅ Get preview text
   */
  getPreviewText(chat: any): string {
    try {
      const type = (chat?.lastMessageType || '').toString().toLowerCase();

      if (type && this.mediaPreviewLabels[type]) {
        return this.mediaPreviewLabels[type];
      }

      const lm = chat?.lastMessage;
      if (lm && typeof lm === 'string') {
        if (/^(https?:\/\/)|mediaId|data:image\/|^\/?uploads\//i.test(lm)) {
          return this.mediaPreviewLabels['file'];
        }
      }

      return this.truncatePreview(lm ?? '');
    } catch (err) {
      console.warn('getPreviewText error', err);
      return '';
    }
  }

  /**
   * ✅ Format timestamp
   */
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
      return this.translate.instant('home.time.yesterday');
    } else if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * ✅ Get timestamp
   */
  getTimeStamp(lastMessageAt: string | Date | undefined): string {
    if (!lastMessageAt) return '';

    const date = new Date(lastMessageAt);
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
      return this.translate.instant('home.time.yesterday');
    } else if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * ✅ Get filtered chats
   */
  get filteredChats() {
    let filtered = this.conversations;

    if (this.selectedFilter === 'read') {
      filtered = filtered.filter((chat) => chat.unreadCount === 0);
    } else if (this.selectedFilter === 'unread') {
      filtered = filtered.filter((chat) => (chat.unreadCount as number) > 0);
    } else if (this.selectedFilter === 'groups') {
      filtered = filtered.filter((chat) => chat.type === 'group');
    }

    if (this.searchText.trim() !== '') {
      const q = this.searchText.toLowerCase();
      filtered = filtered.filter((chat) =>
        (chat.title || '').toLowerCase().includes(q)
      );
    }

    return [...filtered].sort((a: any, b: any) => {
      const aPinned = a.isPinned ? 1 : 0;
      const bPinned = b.isPinned ? 1 : 0;

      if (aPinned === bPinned) {
        if (aPinned === 1) {
          const pinnedAtA = Number(a.pinnedAt || 0);
          const pinnedAtB = Number(b.pinnedAt || 0);
          return pinnedAtB - pinnedAtA;
        } else {
          const timeA = a.lastMessageAt
            ? new Date(a.lastMessageAt).getTime()
            : 0;
          const timeB = b.lastMessageAt
            ? new Date(b.lastMessageAt).getTime()
            : 0;
          return timeB - timeA;
        }
      }

      return bPinned - aPinned;
    });
  }

  get pinnedChatsCount(): number {
    return this.conversations.filter((c) => c.isPinned).length;
  }

  get canPinMore(): boolean {
    return this.pinnedChatsCount < 3;
  }

  get remainingPinSlots(): number {
    return Math.max(0, 3 - this.pinnedChatsCount);
  }

  get totalUnreadCount(): number {
    return this.conversations.reduce(
      (sum, chat) => sum + ((chat?.unreadCount || 0) > 0 ? 1 : 0),
      0
    );
  }

  setFilter(filter: string) {
    this.selectedFilter = filter;
  }

  /**
   * ✅ Open chat
   */
  // async openChat(chat: any) {
  //   console.log({ chat });
  //   await this.firebaseChatService.openChat(chat);

  //   try {
  //     const routes: Record<string, string> = {
  //       private: '/chatting-screen',
  //       community: '/community-detail',
  //       group: '/chatting-screen',
  //     };

  //     const route = routes[chat.type];
  //     if (!route) {
  //       console.error('Unknown chat type:', chat.type);
  //       return;
  //     }

  //     let receiverId: string;
  //     if (chat.type === 'private') {
  //       const parts = chat.roomId.split('_');
  //       receiverId =
  //         parts.find((p: string | null) => p !== this.senderUserId) ??
  //         parts[parts.length - 1];
  //     } else {
  //       receiverId = chat.roomId;
  //     }

  //     this.router.navigate([route], {
  //       queryParams: { receiverId: receiverId, from: 'home' },
  //     });
  //   } catch (error) {
  //     console.error('chat not open', error);
  //   }
  // }

   prefetchConversation(chat: any) {
    // Debounce to avoid excessive prefetching
    if (this.prefetchTimeout) {
      clearTimeout(this.prefetchTimeout);
    }

    this.prefetchTimeout = setTimeout(async () => {
      if (this.prefetchedConversations.has(chat.roomId)) return;

      try {
        // Prefetch basic data only
        const prefetchData = {
          roomId: chat.roomId,
          type: chat.type,
          title: chat.title,
          members: chat.members,
          cachedAt: Date.now(),
        };

        this.prefetchedConversations.set(chat.roomId, prefetchData);
        console.log(`✅ Prefetched conversation: ${chat.roomId}`);
      } catch (error) {
        console.warn('Prefetch failed:', error);
      }
    }, 300); // Wait 300ms before prefetching
  }

  /**
   * ✅ Clear prefetch timeout when mouse/touch leaves
   */
  cancelPrefetch() {
    if (this.prefetchTimeout) {
      clearTimeout(this.prefetchTimeout);
      this.prefetchTimeout = null;
    }
  }

  /**
   * ✅ Optimized chat opening with instant navigation
   */
  async openChat(chat: any) {
    // ✅ Step 1: Navigate immediately (0ms delay)
    this.navigateToChat(chat);
    
    // ✅ Step 2: Load data in background (fire-and-forget)
    this.loadChatDataInBackground(chat).catch(err => 
      console.warn('Background load failed:', err)
    );
  }

  /**
   * 🔥 Instant navigation (no await)
   */
  private navigateToChat(chat: any) {
    const routes: Record<string, string> = {
      private: '/chatting-screen',
      community: '/community-detail',
      group: '/chatting-screen',
    };

    const route = routes[chat.type];
    if (!route) {
      console.error('Unknown chat type:', chat.type);
      return;
    }

    let receiverId: string;
    if (chat.type === 'private') {
      const parts = chat.roomId.split('_');
      receiverId =
        parts.find((p: string) => p !== this.senderUserId) ??
        parts[parts.length - 1];
    } else {
      receiverId = chat.roomId;
    }

    // Navigate immediately
    this.router.navigate([route], {
      queryParams: { receiverId: receiverId, from: 'home' },
    });
  }

  /**
   * 🔥 Load chat data in background (non-blocking)
   */
  private async loadChatDataInBackground(chat: any) {
    try {
      // Use prefetched data if available
      const prefetched = this.prefetchedConversations.get(chat.roomId);
      
      // Open chat with prefetched or current data
      await this.firebaseChatService.openChat(
        prefetched || chat,
        false
      );
    } catch (error) {
      console.error('Background chat loading error:', error);
    }
  }

  /**
   * ✅ Load user communities for home
   */
  async loadUserCommunitiesForHome() {
    try {
      const userid = this.senderUserId;
      if (!userid) return;

      const communityIds: string[] =
        (await this.firebaseChatService.getUserCommunities(userid)) || [];

      for (const cid of communityIds) {
        const exists = this.chatList.find(
          (c: any) => c.receiver_Id === cid && c.isCommunity
        );
        if (exists) continue;

        const commSnap = await get(
          rtdbRef(getDatabase(), `communities/${cid}`)
        );
        if (!commSnap.exists()) continue;

        const comm = commSnap.val();
        const groupIds = await this.firebaseChatService.getGroupsInCommunity(
          cid
        );

        let previewGroupId: string | null = null;
        let previewGroupName = '';

        if (groupIds && groupIds.length > 0) {
          for (const gid of groupIds) {
            const g = await this.firebaseChatService.getGroupInfo(gid);
            if (!g) continue;

            if (g.type === 'announcement') {
              previewGroupId = gid;
              previewGroupName = g.name || 'Announcements';
              break;
            }
          }

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

          if (!previewGroupId) {
            previewGroupId = groupIds[0];
            const g = await this.firebaseChatService.getGroupInfo(
              previewGroupId
            );
            previewGroupName = g?.name || 'Group';
          }
        }

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
                if (last.isDeleted) {
                  previewText = 'This message was deleted';
                } else if (
                  last.attachment?.type &&
                  last.attachment.type !== 'text'
                ) {
                  const typeMap: Record<string, string> = {
                    image: '📷 Photo',
                    video: '🎥 Video',
                    audio: '🎵 Audio',
                    file: '📎 Attachment',
                  };
                  previewText = typeMap[last.attachment.type] || '[Media]';
                } else {
                  try {
                    const dec = await this.encryptionService.decrypt(last.text);
                    previewText = dec;
                  } catch {
                    previewText = '[Encrypted]';
                  }
                }

                if (last.timestamp) {
                  previewTime = this.formatTimestamp(last.timestamp);
                }
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

        this.chatList.push(communityChat as any);

        if (previewGroupId) {
          const sub = this.firebaseChatService
            .listenToUnreadCount(previewGroupId, userid)
            .subscribe((count: number) => {
              const target = this.chatList.find(
                (c: any) => c.receiver_Id === cid && c.isCommunity
              ) as CommunityChat | undefined;

              if (target) {
                target.unreadCount = count;
                target.unread = count > 0;
              }
            });

          this.unreadSubs.push(sub);
          this.communityUnreadSubs.set(cid, sub);
        }
      }

      this.chatList.sort((a: any, b: any) => b.unreadCount - a.unreadCount);
    } catch (err) {
      console.error('loadUserCommunitiesForHome error', err);
    }
  }

  /**
   * ✅ Present popover
   */
  async presentPopover(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data?.action === 'readAll') {
      await this.markAllAsReadOnHome();
    }
  }

  /**
   * ✅ Mark all as read on home
   */
  private async markAllAsReadOnHome(): Promise<void> {
    const me = this.senderUserId || this.authService.authData?.userId || '';
    if (!me) return;

    const roomIds: string[] = [];

    for (const chat of this.chatList || []) {
      if (chat.isCommunity) {
        if (chat.previewGroupId) roomIds.push(String(chat.previewGroupId));
        continue;
      }

      if (chat.group) {
        roomIds.push(String(chat.receiver_Id));
      } else {
        roomIds.push(this.getRoomId(String(me), String(chat.receiver_Id)));
      }
    }

    const uniqueRoomIds = Array.from(new Set(roomIds)).filter((r) => !!r);

    if (uniqueRoomIds.length === 0) return;

    try {
      await this.firebaseChatService.markManyRoomsAsRead(
        uniqueRoomIds,
        String(me)
      );

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

  // ========================================
  // 🎯 CAMERA & ATTACHMENTS
  // ========================================

  /**
   * ✅ Open camera
   */
  async openCamera() {
    try {
      const image = await Camera.getPhoto({
        source: CameraSource.Camera,
        quality: 90,
        resultType: CameraResultType.Uri,
      });

      if (!image.webPath) {
        throw new Error('No image path returned');
      }

      const response = await fetch(image.webPath);
      const blob = await response.blob();

      const timestamp = Date.now();
      const fileName = `camera_${timestamp}.${image.format || 'jpg'}`;
      const mimeType = `image/${image.format || 'jpeg'}`;
      const previewUrl = URL.createObjectURL(blob);

      this.selectedAttachment = {
        type: 'image',
        blob: blob,
        fileName: fileName,
        mimeType: mimeType,
        fileSize: blob.size,
        previewUrl: previewUrl,
      };

      this.showPreviewModal = true;
    } catch (error) {
      console.error('Camera error:', error);
      await this.showToast(
        'Failed to capture photo. Please try again.',
        'danger'
      );
    }
  }

  /**
   * ✅ Open cropper modal
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
          aspectRatio: 0,
          cropQuality: 0.9,
        },
        cssClass: 'image-cropper-modal',
        backdropDismiss: false,
      });

      await modal.present();
      const { data } = await modal.onDidDismiss<CropResult>();

      if (data && data.success && data.originalBlob) {
        if (attachment.previewUrl) {
          try {
            URL.revokeObjectURL(attachment.previewUrl);
          } catch (e) {
            console.warn('Failed to revoke old preview URL:', e);
          }
        }

        const newPreviewUrl = URL.createObjectURL(data.originalBlob);
        const timestamp = Date.now();
        const fileExtension = attachment.fileName.split('.').pop() || 'jpg';
        const newFileName = `cropped_${timestamp}.${fileExtension}`;

        this.selectedAttachment = {
          ...attachment,
          blob: data.originalBlob,
          previewUrl: newPreviewUrl,
          fileName: newFileName,
          fileSize: data.originalBlob.size,
          mimeType: data.originalBlob.type || attachment.mimeType,
          caption: '',
        };

        this.firebaseChatService.setSelectedAttachment(this.selectedAttachment);
        this.showPreviewModal = true;

        await this.showToast('Image cropped successfully', 'success');
      } else if (data && data.cancelled) {
        if (attachment.previewUrl) {
          try {
            URL.revokeObjectURL(attachment.previewUrl);
          } catch (e) {}
        }
      } else if (data && data.error) {
        await this.showToast(data.error, 'danger');
      }
    } catch (error) {
      console.error('❌ Error opening cropper modal:', error);
      await this.showToast('Failed to open image editor', 'danger');
    }
  }

  /**
   * ✅ Cancel attachment
   */
  cancelAttachment() {
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
  }

  /**
   * ✅ Go to contact list
   */
  async goToContactList() {
    if (!this.selectedAttachment) {
      await this.showToast('No attachment to send', 'warning');
      return;
    }

    this.selectedAttachment.caption = this.messageText.trim();
    this.firebaseChatService.setSelectedAttachment(this.selectedAttachment);
    this.showPreviewModal = false;

    setTimeout(() => {
      this.router.navigate(['/select-contact-list'], {
        state: {
          attachmentData: this.selectedAttachment,
          caption: this.messageText.trim(),
          fromCamera: true,
        },
      });

      this.messageText = '';
    }, 100);
  }

  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  async scanBarcode() {
    // Implementation commented out
  }

  getRoomId(a: string, b: string): string {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  // ========================================
  // 🎯 TYPING LISTENERS
  // ========================================

  /**
   * ✅ Start typing listener for chat
   */
  private startTypingListenerForChat(chat: any) {
    try {
      const db = getDatabase();
      const roomId = chat.group
        ? chat.receiver_Id
        : this.getRoomId(this.senderUserId || '', chat.receiver_Id);

      if (!roomId || this.typingUnsubs.has(roomId)) return;

      const typingRef = rtdbRef(db, `typing/${roomId}`);

      const unsub = rtdbOnValue(typingRef, (snapshot) => {
        const val = snapshot.val() || {};
        const now = Date.now();

        if (!chat.group) {
          const otherUserKey = chat.receiver_Id;
          const entry = val[otherUserKey] || null;
          const isTyping = entry
            ? !!entry.typing
            : Object.keys(val).length === 0
            ? false
            : !!val;

          chat.isTyping = !!isTyping;
          chat.typingText = isTyping ? chat.name || 'typing...' : null;
        } else {
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
            chat.typingText =
              r.name || this.lookupMemberName(chat, r.userId) || null;
          } else {
            chat.typingText = null;
          }
        }
      });

      this.typingUnsubs.set(roomId, unsub);
    } catch (err) {
      console.warn('startTypingListenerForChat error', err);
    }
  }

  /**
   * ✅ Stop typing listener for chat
   */
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
        } catch (e) {}
        this.typingUnsubs.delete(roomId);
      }
    } catch (err) {}
  }

  /**
   * ✅ Lookup member name
   */
  private lookupMemberName(groupChat: any, userId: string): string | null {
    try {
      if (!groupChat || !groupChat.members) return null;
      const m = groupChat.members[userId];
      return m?.name || null;
    } catch (e) {
      return null;
    }
  }

  // ========================================
  // 🎯 HELPER METHODS
  // ========================================

  /**
   * ✅ Show toast helper
   */
  private async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
    });
    await toast.present();
  }

  /**
   * ✅ Normalize phone number
   */
  private normalizePhone(num?: string): string {
    if (!num) return '';
    return num.replace(/\D/g, '').slice(-10);
  }
}
