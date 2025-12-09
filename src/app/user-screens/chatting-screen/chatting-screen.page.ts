import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  QueryList,
  Renderer2,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import {
  query,
  orderByKey,
  endBefore,
  limitToLast,
  getDatabase,
  ref,
  get,
  update,
  set,
  remove,
  off,
} from 'firebase/database';
import { ref as dbRef, onValue, onDisconnect } from 'firebase/database';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonContent,
  IonicModule,
  ModalController,
  Platform,
  PopoverController,
  ToastController,
  IonDatetime,
  ActionSheetController,
} from '@ionic/angular';
import { firstValueFrom, Subscription, timer } from 'rxjs';
import { Keyboard } from '@capacitor/keyboard';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { EncryptionService } from 'src/app/services/encryption.service';
import { v4 as uuidv4 } from 'uuid';
import { SecureStorageService } from '../../services/secure-storage/secure-storage.service';
import { FileUploadService } from '../../services/file-upload/file-upload.service';
import { ChatOptionsPopoverComponent } from 'src/app/components/chat-options-popover/chat-options-popover.component';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { NavController } from '@ionic/angular';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { FileSystemService } from 'src/app/services/file-system.service';
import imageCompression from 'browser-image-compression';
import { AttachmentPreviewModalComponent } from '../../components/attachment-preview-modal/attachment-preview-modal.component';
import { MessageMorePopoverComponent } from '../../components/message-more-popover/message-more-popover.component';
import { Clipboard } from '@capacitor/clipboard';
import { Message, PinnedMessage } from 'src/types';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import {
  IUser,
  IAttachment,
  IConversation,
  IMessage,
  SqliteService,
} from 'src/app/services/sqlite.service';
import { TypingService } from 'src/app/services/typing.service';
import { Subject, Subscription as RxSub } from 'rxjs';
import { throttleTime } from 'rxjs/operators';
import { PresenceService } from 'src/app/services/presence.service';
import { switchMap } from 'rxjs/operators';
import { resolve } from 'path';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ImageCropperModalComponent } from 'src/app/components/image-cropper-modal/image-cropper-modal.component';
import { EmojiPickerModalComponent } from 'src/app/components/emoji-picker-modal/emoji-picker-modal.component';
import { FcmService } from 'src/app/services/fcm-service';

interface ICurrentChat {
  roomId: string;
  receiverId?: string;
  receiverName?: string;
  type?: 'private' | 'group' | 'community';
  members?: string[];
}

type UIMessageStatus =
  | 'failed'
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | null;

interface IconDescriptor {
  name: string;
  cls: string;
  title?: string;
}

// // structure for translation items
// interface TranslationItem {
//   code: string;   // e.g., 'en', 'hi-IN', 'orig'
//   label: string;  // e.g., 'English', 'Hindi', 'Original'
//   text: string;   // the text
// }

// ========================================
// 📦 INTERFACES
// ========================================

// Translation Item Structure
interface TranslationItem {
  code: string; // e.g., 'en', 'hi-IN', 'ar-SA'
  label: string; // e.g., 'English', 'Hindi', 'Arabic (Saudi Arabia)'
  text: string; // the translated text
}

// Translation Card State
interface TranslationCard {
  visible: boolean;
  mode: 'translateCustom' | 'translateToReceiver' | 'sendOriginal';
  items: TranslationItem[];
  createdAt: Date;
}

// Message Translations Structure
interface MessageTranslations {
  original: {
    code: string;
    label: string;
    text: string;
  };
  otherLanguage?: {
    code: string;
    label: string;
    text: string;
  };
  receiverLanguage?: {
    code: string;
    label: string;
    text: string;
  };
}

@Component({
  selector: 'app-chatting-screen',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './chatting-screen.page.html',
  styleUrls: ['./chatting-screen.page.scss'],
})
export class ChattingScreenPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('scrollContainer', { static: false }) scrollContainer!: ElementRef;
  @ViewChild(IonContent, { static: false }) ionContent!: IonContent;
  @ViewChild('fileInput', { static: false })
  fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('datePicker', { static: false }) datePicker!: IonDatetime;
  @ViewChild('longPressEl') messageElements!: QueryList<ElementRef>;

  messages: Message[] = [];
  groupedMessages: {
    date: string;
    messages: (Message & IMessage & { isMe: boolean })[];
  }[] = [];

  replyTo: { message: IMessage; sender: IUser | null } | null = null;

  messageText = '';
  receiverId = '';
  senderId = '';
  // receiverId = '';
  sender_phone = '';
  receiver_phone = '';
  private messageSub?: Subscription;
  showSendButton = false;
  private keyboardListeners: any[] = [];
  searchActive = false;
  searchQuery = '';
  searchMatches: HTMLElement[] = [];
  currentMatchIndex = 0;
  showSearchBar = false;
  searchTerm = '';
  searchText = '';
  matchedMessages: HTMLElement[] = [];
  currentSearchIndex = -1;
  isDateModalOpen = false;
  selectedDate: string = '';
  isDatePickerOpen = false;
  showDateModal = false;
  selectedMessages: any[] = [];
  imageToSend: any;
  alertController: any;

  private resizeHandler = () => this.setDynamicPadding();
  private intersectionObserver?: IntersectionObserver;

  roomId = '';
  // chatType: 'private' | 'group' = 'private';
  groupName = '';
  isGroup: any;
  receiver_name = '';
  sender_name = '';
  groupMembers: {
    user_id: string;
    name?: string;
    phone?: string;
    avatar?: string;
    role?: string;
    phone_number?: string;
    publicKeyHex?: string | null;
  }[] = [];
  attachments: any[] = [];
  selectedAttachment: any = null;
  showPreviewModal: boolean = false;
  attachmentPath: string = '';
  lastPressedMessage: any = null;
  longPressTimeout: any;
  replyToMessage: IMessage | null = null;
  capturedImage = '';
  pinnedMessage: PinnedMessage | null = null;
  pinnedMessageDetails: any = null;
  private pinnedMessageSubscription: any;
  showMobilePinnedBanner: boolean = false;
  chatName: string = '';
  onlineCount: number = 0;

  showPopover = false;
  popoverEvent: any;
  isSending = false;

  limit = 15; // Load 15 messages at a time
  page = 0;
  isLoadingMore = false;
  hasMoreMessages = true;
  allMessages: (IMessage & { attachment?: IAttachment; fadeOut: boolean })[] =
    []; // Store all messages
  displayedMessages: Message[] = []; // Messages currently shown
  private lastMessageKey: string | null = null;

  receiverProfile: string | null = null;
  chatTitle: string | null = null;

  pfUsers: Array<{
    userId?: string | number;
    username?: string;
    phoneNumber?: string;
    avatar?: string | null;
    isOnPlatform?: boolean;
  }> = [];

  currentConv: IConversation | null = null;

  private pfUsersSub?: Subscription;

  // block state flags
  iBlocked = false;
  theyBlocked = false;

  // UI bubbles
  showBlockBubble = false;
  showUnblockBubble = false;
  private blockBubbleTimeout: any = null;

  // refs for listeners (so we can off them)
  private iBlockedRef: any = null;
  private theyBlockedRef: any = null;
  private _iBlockedLoaded = false;
  private _theyBlockedLoaded = false;

  // Typing indicator related
  private typingInput$ = new Subject<void>();
  private typingRxSubs: RxSub[] = [];
  typingCount = 0;
  typingFrom: string | null = null;
  private localTypingTimer: any = null;
  private typingUnsubscribe: (() => void) | null = null;
  typingUsers: {
    userId: string;
    name: string | null;
    avatar: string | null;
  }[] = [];

  private statusPollSub?: Subscription;
  public receiverOnline = false;
  public receiverLastSeen: string | null = null;

  // store unsubscribes for firebase onValue
  private onValueUnsubs: Array<() => void> = [];
  private emojiTargetMsg: Message | null = null;

  private allMessage: IMessage[] = [];
  chatType: string | null = null;

  receiverStatus: 'online' | 'offline' = 'offline';
  lastSeenTime: string = '';
  isReceiverTyping: boolean = false;
  private presenceSubscription?: Subscription;
  private typingTimeout: any;
  maxDate: string = new Date().toISOString();

   private isUserScrolling = false;
  private isNearBottom = true;
  private scrollThreshold = 150; // Distance from bottom to consider "near bottom"
  private isInitialLoad = true;
  private lastScrollTop = 0;
  private scrollDebounceTimer: any;

  constructor(
    private chatService: FirebaseChatService,
    private toastController: ToastController,
    private route: ActivatedRoute,
    private platform: Platform,
    private encryptionService: EncryptionService,
    private router: Router,
    private secureStorage: SecureStorageService,
    private fileUploadService: FileUploadService,
    private popoverCtrl: PopoverController,
    private toastCtrl: ToastController,
    private navCtrl: NavController,
    private FileService: FileSystemService,
    private modalCtrl: ModalController,
    private popoverController: PopoverController,
    private clipboard: Clipboard,
    private authService: AuthService,
    private service: ApiService,
    private sqliteService: SqliteService,
    private alertCtrl: AlertController,
    private typingService: TypingService,
    private renderer: Renderer2,
    private el: ElementRef,
    private zone: NgZone,
    private presence: PresenceService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private fcmService : FcmService,
    private actionSheetCtrl: ActionSheetController // private toastCtrl: ToastController, // private modalCtrl: ModalController, // private firebaseChatService : FirebaseChatService
  ) {}

  async ngOnInit() {
    Keyboard.setScroll({ isDisabled: false });

    this.senderId = this.authService.authData?.userId || '';
    this.sender_phone = this.authService.authData?.phone_number || '';
    this.sender_name = this.authService.authData?.name || '';
    // console.log("sender name is", this.sender_name)

    const nameFromQuery =
      this.route.snapshot.queryParamMap.get('receiver_name');
    this.receiverId = this.route.snapshot.queryParamMap.get('receiverId') || '';
    this.receiver_name =
      nameFromQuery ||
      (await this.secureStorage.getItem('receiver_name')) || '';
      this.maxDate = new Date().toISOString();
  }

  onInputTyping() {
    this.onInputChange();
    this.typingInput$.next();
    if (this.localTypingTimer) {
      clearTimeout(this.localTypingTimer);
    }
    this.localTypingTimer = setTimeout(() => {
      this.stopTypingSignal();
    }, 2500);
  }

  onInputBlurTyping() {
    this.stopTypingSignal();
  }

  private async sendTypingSignal() {
    try {
      await this.typingService.startTyping(this.roomId, this.senderId);
      if (this.localTypingTimer) clearTimeout(this.localTypingTimer);
      this.localTypingTimer = setTimeout(() => {
        this.stopTypingSignal();
      }, 2500);
    } catch (err) {
      console.warn('startTyping failed', err);
    }
  }

  private async stopTypingSignal() {
    try {
      if (this.localTypingTimer) {
        clearTimeout(this.localTypingTimer);
        this.localTypingTimer = null;
      }
      await this.typingService.stopTyping(this.roomId, this.senderId);
    } catch (err) {
      console.warn('stopTyping failed', err);
    }
  }


  // async ionViewWillEnter() {
  //   await this.chatService.loadMessages(20, true);
  //   this.chatService.syncMessagesWithServer();
  //   this.chatService.getMessages().subscribe(async (msgs: any) => {
  //     console.log({ msgs });
  //     this.groupedMessages = (await this.groupMessagesByDate(
  //       msgs as any[]
  //     )) as any[];
  //     // msgs.forEach((msg: any) => console.log({msg}));
  //     this.allMessage = msgs as IMessage[];
  //     for (const msg of msgs) {
  //       if (!msg.isMe) {
  //         // console.log('Marking read from chat screen');
  //         this.chatService.markAsRead(msg.msgId);
  //       }
  //     }
  //   });

   async ionViewWillEnter() {
    // Load initial messages
    // await this.chatService.loadMessages(20, true);
    // this.chatService.syncMessagesWithServer();
    
    this.chatService.getMessages().subscribe(async (msgs: any) => {
      console.log({ msgs });
      
      if (!msgs || msgs.length === 0) {
        this.groupedMessages = [];
        this.allMessage = [];
        return;
      }
      
      const previousMessageCount = this.groupedMessages.reduce(
        (count, group) => count + group.messages.length,
        0
      );

      this.groupedMessages = (await this.groupMessagesByDate(msgs as any[])) as any[];
      this.allMessage = msgs as IMessage[];
      
      const newMessageCount = this.groupedMessages.reduce(
        (count, group) => count + group.messages.length,
        0
      );

      // Mark messages as read
      for (const msg of msgs) {
        if (!msg.isMe) {
          this.chatService.markAsRead(msg.msgId);
        }
      }

      // Handle scroll behavior based on context
      // await this.handleMessageUpdate(previousMessageCount, newMessageCount);  //this will imrove in future
    });

    // Setup presence subscription
    this.presenceSubscription = this.chatService.presenceChanges$.subscribe(
      (presenceMap) => {
        this.updateReceiverStatus();
      }
    );

    this.updateReceiverStatus();
    this.loadLanguages();

    this.currentConv = this.chatService.currentChat;
    Keyboard.setScroll({ isDisabled: false });
    this.senderId = this.authService.authData?.userId || '';
    this.sender_phone = this.authService.authData?.phone_number || '';
    this.sender_name = this.authService.authData?.name || '';
    this.roomId = this.currentConv?.roomId || '';
    const currentChat = this.chatService.currentChat;
    console.log({ currentChat });
    this.chatType = currentChat?.type || '';

    if (this.chatType === 'private') {
      const parts: string[] = currentChat?.roomId?.split('_') || [];
      this.receiverId =
        parts.find((p: string | null) => p !== this.senderId) ??
        parts[parts.length - 1];
    } else {
      this.receiverId = currentChat?.roomId || '';
    }
    this.receiverProfile =
      (currentChat as any).avatar || (currentChat as any).groupAvatar || null;
    this.chatTitle = currentChat?.title || null;

     if (this.roomId) {
    await this.fcmService.clearNotificationForRoom(this.roomId);
    console.log('✅ Notifications cleared for room:', this.roomId);
  }

    // ✅ Scroll to bottom after first load
    // setTimeout(() => this.scrollToBottomSmooth(), 100);
  }

  async ionViewWillLeave() {
    try {
      // await this.chatService.closeChat();
      console.log('Chat is closed');
    } catch (error) {
      console.error('error in closing chat', error);
    }
  }
  async onBack() {
    await this.chatService.closeChat();
    this.router.navigate(['/home-screen']);
    // this.navCtrl.back();
  }

  private computeMessageStatus(msg: IMessage): UIMessageStatus {
    if (!msg) return null;

    const readStatus = !!msg.receipts?.read?.status;
    if (readStatus) return 'read';

    const deliveredStatus = !!msg.receipts?.delivered?.status;
    if (deliveredStatus) return 'delivered';

    if (
      msg.status === 'failed' ||
      msg.status === 'pending' ||
      msg.status === 'sent'
    ) {
      return msg.status;
    }

    return null;
  }

  /**
   * Find a message by msgId across all rooms in this._messages$.value (Map<roomId, IMessage[]>)
   * and return an IconDescriptor according to the canonical status.
   *
   * Accepts only msgId (string).
   */
  getStatusIconDescriptorByMsgId(msgId: string): IconDescriptor | null {
    if (!msgId || !this.allMessage.length) return null;

    // const messagesMap: Map<string, IMessage[]> = (this._messages$ as any).value;
    // if (!messagesMap || !(messagesMap instanceof Map)) return null;

    // linear search across rooms — fine for small-to-medium stores. See note below.
    // for (const [, list] of messagesMap.entries()) {
    const msg = this.allMessage.find((m) => m.msgId === msgId);
    if (!msg?.isMe) {
      return null;
    }

    const status = this.computeMessageStatus(msg);

    switch (status) {
      case 'read':
        return {
          name: 'checkmark-done-outline',
          cls: 'status-icon read',
          title: 'Read',
        };
      case 'delivered':
        return {
          name: 'checkmark-done-outline',
          cls: 'status-icon delivered',
          title: 'Delivered',
        };
      case 'sent':
        return {
          name: 'checkmark-outline',
          cls: 'status-icon sent',
          title: 'Sent',
        };
      case 'pending':
        return {
          name: 'time-outline',
          cls: 'status-icon pending',
          title: 'Pending',
        };
      case 'failed':
        return {
          name: 'alert-circle-outline',
          cls: 'status-icon failed',
          title: 'Failed',
        };
      default:
        return null;
    }
  }

  updateReceiverStatus() {
    const currentChat = this.chatService.currentChat;
    if (!currentChat) return;

    // Get receiver ID
    let receiverId: string;
    if (currentChat.type === 'private') {
      const parts = currentChat.roomId.split('_');
      receiverId =
        parts.find((p) => p !== this.chatService['senderId']) ?? parts[1];
    } else {
      // For groups, handle multiple typing statuses
      this.updateGroupTypingStatus();
      return;
    }

    // Get presence status
    const presence = this.chatService.getPresenceStatus(receiverId);

    if (presence) {
      this.receiverStatus = presence.isOnline ? 'online' : 'offline';
      this.isReceiverTyping = presence.isTyping || false; // 🆕

      if (!presence.isOnline && presence.lastSeen) {
        this.lastSeenTime = this.formatLastSeen(presence.lastSeen);
      }
    }
  }

  updateGroupTypingStatus() {
    const currentChat = this.chatService.currentChat;
    if (!currentChat || currentChat.type !== 'group') return;

    const members = currentChat.members || [];
    let typingCount = 0;

    members.forEach((memberId) => {
      if (memberId === this.chatService['senderId']) return;
      const presence = this.chatService.getPresenceStatus(memberId);
      if (presence?.isTyping) {
        typingCount++;
      }
    });

    this.typingCount = typingCount;
  }

  // 🆕 Call this when user types in the input
  onMessageInput(event: any) {
    const text = event.target.value || '';

    // Show/hide send button based on input
    this.showSendButton = text.trim().length > 0;

    this.showTranslationOptions = this.messageText.trim().length > 0;

    if (text.trim().length > 0) {
      this.chatService.setTypingStatus(true);

      // Reset timeout
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }

      // Auto-clear after 2 seconds of no typing
      this.typingTimeout = setTimeout(() => {
        this.chatService.setTypingStatus(false);
      }, 2000);
    } else {
      this.chatService.setTypingStatus(false);
    }
  }

  formatLastSeen(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return new Date(timestamp).toLocaleDateString();
  }

  // Alternative: More detailed format
  formatLastSeenDetailed(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Last seen just now';
    if (minutes < 60)
      return `Last seen ${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `Last seen ${hours} hour${hours > 1 ? 's' : ''} ago`;

    // Today
    if (date.toDateString() === now.toDateString()) {
      return `Last seen today at ${date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }

    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Last seen yesterday at ${date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }

    // Older
    return `Last seen ${date.toLocaleDateString()} at ${date.toLocaleTimeString(
      'en-US',
      {
        hour: '2-digit',
        minute: '2-digit',
      }
    )}`;
  }

  loadReceiverProfile() {
    this.receiverId = this.route.snapshot.queryParamMap.get('receiverId') || '';
    if (!this.receiverId) return;

    if (this.chatType === 'group') {
      this.service.getGroupDp(this.receiverId).subscribe({
        next: (res: any) => {
          this.receiverProfile = res?.group_dp_url || null;
        },
        error: (err) => {
          console.error('❌ Error loading group profile:', err);
          this.receiverProfile = null;
        },
      });
    } else {
      this.service.getUserProfilebyId(this.receiverId).subscribe({
        next: (res: any) => {
          this.receiverProfile = res?.profile || null;
        },
        error: (err) => {
          console.error('❌ Error loading user profile:', err);
          this.receiverProfile = null;
        },
      });
    }
  }

  setDefaultAvatar(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/user.jfif';
  }

  async openOptions(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: ChatOptionsPopoverComponent,
      event: ev,
      translucent: true,
      componentProps: {
        chatType: this.chatType,
      },
    });

    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data?.selected) {
      this.handleOption(data.selected);
    }
  }

  async handleOption(option: string) {
    if (option === 'Search (FindTell)') {
      this.showSearchBar = true;
      setTimeout(() => {
        const input = document.querySelector('ion-input');
        (input as HTMLIonInputElement)?.setFocus();
      }, 100);
      return;
    }

    if (option === 'View Contact (View Demmian)') {
      const queryParams: any = {
        receiverId: this.receiverId,
        receiver_phone: this.receiver_phone,
        receiver_name: this.receiver_name,
        isGroup: false,
      };
      this.router.navigate(['/profile-screen'], { queryParams });
      return;
    }

    // ✅ NEW: Clear Chat Option
    if (option === 'Clear Chat (Clear DemmChat)') {
      //console.log("clear chat calls");
      await this.handleClearChat();
      return;
    }

    const groupId = this.receiverId;
    const userId = await this.secureStorage.getItem('userId');

    if (option === 'Group Info (DemmRoom Info)') {
      const queryParams: any = {
        receiverId: this.chatType === 'group' ? this.roomId : this.receiverId,
        receiver_phone: this.receiver_phone,
        receiver_name: this.receiver_name,
        isGroup: this.chatType === 'group',
      };
      this.router.navigate(['/profile-screen'], { queryParams });
    } else if (option === 'Add Members (Add Demmians)') {
      const memberPhones = this.groupMembers.map((member) => member.phone);
      this.router.navigate(['/add-members'], {
        queryParams: {
          groupId: groupId,
          members: JSON.stringify(memberPhones),
        },
      });
    } else if (option === 'Exit Group (Leave DemmRoom)') {
      if (!this.roomId || !this.senderId) {
        console.error('Missing groupId or userId');
        return;
      }

      const db = getDatabase();
      const groupId = this.roomId;
      const userId = this.senderId;

      // 🟢 Confirmation Alert
      const alert = await this.alertCtrl.create({
        header: 'Exit Group',
        message: 'Are you sure you want to exit this group?',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Exit',
            handler: async () => {
              try {
                const memberPath = `groups/${groupId}/members/${userId}`;
                const pastMemberPath = `groups/${groupId}/pastmembers/${userId}`;

                const memberSnap = await get(ref(db, memberPath));
                if (!memberSnap.exists()) {
                  console.error('Member data not found');
                  return;
                }

                const memberData = memberSnap.val();
                const wasAdmin = memberData.role === 'admin';

                // ✅ Step 1: Move user to pastmembers
                const updatedMemberData = {
                  ...memberData,
                  status: 'inactive',
                  removedAt: new Date().toISOString(),
                };

                await set(ref(db, pastMemberPath), updatedMemberData);
                await remove(ref(db, memberPath));

                // ✅ Step 2: If user was admin, assign a new random admin
                if (wasAdmin) {
                  const membersSnap = await get(
                    ref(db, `groups/${groupId}/members`)
                  );
                  if (membersSnap.exists()) {
                    const members = membersSnap.val();
                    const memberIds = Object.keys(members);

                    if (memberIds.length > 0) {
                      const randomId =
                        memberIds[Math.floor(Math.random() * memberIds.length)];
                      await update(
                        ref(db, `groups/${groupId}/members/${randomId}`),
                        {
                          role: 'admin',
                        }
                      );
                      //console.log(`👑 New admin assigned: ${randomId}`);
                    }
                  }
                }

                // ✅ Toast + navigate
                const toast = await this.toastCtrl.create({
                  message: 'You exited the group',
                  duration: 2000,
                  color: 'medium',
                });
                toast.present();

                this.router.navigate(['/home-screen']);
              } catch (error) {
                console.error('Error exiting group:', error);
                const toast = await this.toastCtrl.create({
                  message: 'Failed to exit group',
                  duration: 2000,
                  color: 'danger',
                });
                toast.present();
              }
            },
          },
        ],
      });

      await alert.present();
    }
  }

  private async handleClearChat() {
    try {
      const userId = await this.authService.authData?.userId;
      //console.log("userID sdsdfgsdgsdfgertgryrtytr", userId);
      if (!userId) return;

      // Show confirmation alert
      const alert = await this.alertCtrl.create({
        header: 'Clear Chat',
        message:
          'Are you sure you want to clear all messages? This cannot be undone.',
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
          },
          {
            text: 'Clear',
            handler: async () => {
              await this.clearChatMessages(userId);
            },
          },
        ],
      });

      await alert.present();
    } catch (error) {
      console.error('Error in handleClearChat:', error);
    }
  }

  // ✅ Clear Chat Implementation (Soft Delete)
  private async clearChatMessages(userId: string) {
    try {
      const roomId =
        this.chatType === 'group'
          ? this.receiverId
          : this.getRoomId(userId, this.receiverId);

      if (!roomId) {
        console.error('Room ID not found');
        return;
      }

      await this.chatService.clearChatForUser(roomId);

      this.messages = [];

      // Show success toast
      const toast = await this.toastCtrl.create({
        message: 'Chat cleared successfully',
        duration: 2000,
        color: 'success',
      });
      await toast.present();
    } catch (error) {
      console.error('❌ Error clearing chat:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to clear chat',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async checkIfBlocked() {
    this.senderId = this.authService.authData?.userId || this.senderId;
    if (!this.senderId || !this.receiverId) return;

    const db = getDatabase();

    try {
      if (this.iBlockedRef) off(this.iBlockedRef);
      if (this.theyBlockedRef) off(this.theyBlockedRef);
    } catch (e) {
      /* ignore */
    }

    this.iBlockedRef = ref(
      db,
      `blockedContacts/${this.senderId}/${this.receiverId}`
    );
    this.theyBlockedRef = ref(
      db,
      `blockedContacts/${this.receiverId}/${this.senderId}`
    );

    const unsubA = onValue(this.iBlockedRef, (snap) => {
      const exists = snap.exists();
      this.zone.run(() => {
        if (this._iBlockedLoaded && exists !== this.iBlocked) {
          if (exists) {
            clearTimeout(this.blockBubbleTimeout);
            this.showBlockBubble = true;
            this.showUnblockBubble = false;
            setTimeout(() => this.scrollToBottom(), 120);
          } else {
            this.showBlockBubble = false;
            this.showUnblockBubble = true;
            clearTimeout(this.blockBubbleTimeout);
            this.blockBubbleTimeout = setTimeout(() => {
              this.showUnblockBubble = false;
            }, 3000);
          }
        }
        this.iBlocked = exists;
        this._iBlockedLoaded = true;
      });
    });

    const unsubB = onValue(this.theyBlockedRef, (snap) => {
      const exists = snap.exists();
      this.zone.run(() => {
        this.theyBlocked = exists;
        this._theyBlockedLoaded = true;
      });
    });

    this.onValueUnsubs.push(() => {
      try {
        unsubA();
      } catch (e) {}
    });
    this.onValueUnsubs.push(() => {
      try {
        unsubB();
      } catch (e) {}
    });
  }

  async unblockFromChat() {
    try {
      const db = getDatabase();
      await remove(
        ref(db, `blockedContacts/${this.senderId}/${this.receiverId}`)
      );
      this.showBlockBubble = false;
      this.showUnblockBubble = true;
      clearTimeout(this.blockBubbleTimeout);
      this.blockBubbleTimeout = setTimeout(() => {
        this.showUnblockBubble = false;
      }, 3000);
    } catch (err) {
      console.error('Unblock failed', err);
      const t = await this.toastCtrl.create({
        message: 'Failed to unblock',
        duration: 2000,
        color: 'danger',
      });
      t.present();
    }
  }

  async deleteChat() {
    try {
      const db = getDatabase();
      await remove(ref(db, `chats/${this.roomId}`));
      localStorage.removeItem(this.roomId);
      const t = await this.toastCtrl.create({
        message: 'Chat deleted',
        duration: 1500,
        color: 'danger',
      });
      t.present();
      setTimeout(() => this.router.navigate(['/home-screen']), 800);
    } catch (err) {
      console.error('deleteChat failed', err);
      const t = await this.toastCtrl.create({
        message: 'Failed to delete chat',
        duration: 2000,
        color: 'danger',
      });
      t.present();
    }
  }

  onSearchInput() {
    const elements = Array.from(
      document.querySelectorAll('.message-text')
    ) as HTMLElement[];

    elements.forEach((el) => {
      el.innerHTML = el.textContent || '';
      el.style.backgroundColor = 'transparent';
    });

    if (!this.searchText.trim()) {
      this.matchedMessages = [];
      this.currentSearchIndex = -1;
      return;
    }

    const regex = new RegExp(`(${this.escapeRegExp(this.searchText)})`, 'gi');

    this.matchedMessages = [];

    elements.forEach((el) => {
      const originalText = el.textContent || '';
      if (regex.test(originalText)) {
        const highlightedText = originalText.replace(
          regex,
          `<mark style="background: yellow;">$1</mark>`
        );
        el.innerHTML = highlightedText;
        this.matchedMessages.push(el);
      }
    });

    this.currentSearchIndex = this.matchedMessages.length ? 0 : -1;

    if (this.currentSearchIndex >= 0) {
      this.matchedMessages[this.currentSearchIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }

  navigateSearch(direction: 'up' | 'down') {
    if (!this.matchedMessages.length) return;
    if (direction === 'up') {
      this.currentSearchIndex =
        (this.currentSearchIndex - 1 + this.matchedMessages.length) %
        this.matchedMessages.length;
    } else {
      this.currentSearchIndex =
        (this.currentSearchIndex + 1) % this.matchedMessages.length;
    }
    this.highlightMessage(this.currentSearchIndex);
  }

  highlightMessage(index: number) {
    this.matchedMessages.forEach((el) => {
      const originalText = el.textContent || '';
      el.innerHTML = originalText;
      el.style.backgroundColor = 'transparent';
    });

    if (!this.searchText.trim()) return;

    const regex = new RegExp(`(${this.escapeRegExp(this.searchText)})`, 'gi');

    this.matchedMessages.forEach((el) => {
      const originalText = el.textContent || '';
      const highlightedText = originalText.replace(
        regex,
        `<mark style="background: yellow;">$1</mark>`
      );
      el.innerHTML = highlightedText;
    });

    const target = this.matchedMessages[index];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  cancelSearch() {
    this.searchText = '';
    this.showSearchBar = false;
    this.matchedMessages.forEach((el) => {
      el.innerHTML = el.textContent || '';
      el.style.backgroundColor = 'transparent';
    });
    this.matchedMessages = [];
  }

  openPopover(ev: any) {
    this.popoverEvent = ev;
    this.showPopover = true;
  }

  // onDateSelected(event: any) {
  //   const selectedDateObj = new Date(event.detail.value);

  //   const day = String(selectedDateObj.getDate()).padStart(2, '0');
  //   const month = String(selectedDateObj.getMonth() + 1).padStart(2, '0');
  //   const year = selectedDateObj.getFullYear();

  //   const formattedDate = `${day}/${month}/${year}`;

  //   this.selectedDate = event.detail.value;
  //   this.showPopover = false;
  //   this.showDateModal = false;

  //   setTimeout(() => {
  //     const el = document.getElementById('date-group-' + formattedDate);
  //     if (el) {
  //       el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  //     } else {
  //       console.warn('No messages found for selected date:', formattedDate);
  //     }
  //   }, 300);
  // }

   onDateSelected(event: any) {
    const selectedDateObj = new Date(event.detail.value);
    const today = new Date();
    
    // ✅ Additional validation: Prevent future dates
    if (selectedDateObj > today) {
      console.warn('Future date selected, ignoring');
      this.showToast('Cannot select future dates', 'warning');
      return;
    }

    const day = String(selectedDateObj.getDate()).padStart(2, '0');
    const month = String(selectedDateObj.getMonth() + 1).padStart(2, '0');
    const year = selectedDateObj.getFullYear();

    const formattedDate = `${day}/${month}/${year}`;

    this.selectedDate = event.detail.value;
    this.showPopover = false;
    this.showDateModal = false;

    setTimeout(() => {
      const el = document.getElementById('date-group-' + formattedDate);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        console.warn('No messages found for selected date:', formattedDate);
        this.showToast('No messages found for this date', 'warning');
      }
    }, 300);
  }


  openDatePicker() {
    this.showDateModal = true;
    //console.log('Opening calendar modal...');
  }

  onMessagePress(message: any) {
    const index = this.selectedMessages.findIndex(
      (m) => m.msgId === message.msgId
    );
    if (index > -1) {
      this.selectedMessages.splice(index, 1);
    } else {
      this.selectedMessages.push(message);
    }
  }

  clearSelection() {
    this.selectedMessages = [];
    this.replyTo = null;
  }

  private async markMessagesAsRead() {
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage && lastMessage.sender_id !== this.senderId) {
      await this.chatService.resetUnreadCount(this.roomId, this.senderId);
    }
  }

  startLongPress(msg: any) {
    this.longPressTimeout = setTimeout(() => {
      this.onLongPress(msg);
    }, 1000);
  }

  cancelLongPress() {
    clearTimeout(this.longPressTimeout);
  }

  onLongPress(msg: any) {
    this.selectedMessages = [msg];
    this.lastPressedMessage = msg;
  }

  onMessageClick(msg: any) {
    if (this.selectedMessages.length > 0) {
      this.toggleSelection(msg);
      this.lastPressedMessage = msg;
      // console.log("this.lastPressedMessage",this.lastPressedMessage)
    }
  }

  toggleSelection(msg: any) {
    const index = this.selectedMessages.findIndex((m) => m.msgId === msg.msgId);
    if (index > -1) {
      this.selectedMessages.splice(index, 1);
    } else {
      this.selectedMessages.push(msg);
    }

    this.lastPressedMessage = msg;
  }

  isSelected(msg: any) {
    return this.selectedMessages.some((m) => m.msgId === msg.msgId);
  }

  isQuickReactionOpen(msg: any) {
    return (
      this.selectedMessages.some((m) => m.msgId === msg.msgId) &&
      this.selectedMessages.length === 1
    );
  }

  isOnlyOneTextMessage(): boolean {
    return (
      this.selectedMessages.length === 1 &&
      this.selectedMessages[0].type === 'text'
    );
  }

  isMultipleTextMessages(): boolean {
    return (
      this.selectedMessages.length > 1 &&
      this.selectedMessages.every((msg) => msg.type === 'text')
    );
  }

  isOnlyOneAttachment(): boolean {
    return (
      this.selectedMessages.length === 1 &&
      this.selectedMessages[0].type !== 'text'
    );
  }

  isMultipleAttachments(): boolean {
    return (
      this.selectedMessages.length > 1 &&
      this.selectedMessages.every((msg) => msg.type !== 'text')
    );
  }

  isMixedSelection(): boolean {
    const types = this.selectedMessages.map((msg) => msg.type);
    return types.includes('text') && types.some((t) => t !== 'text');
  }

  async copySelectedMessages() {
    if (this.lastPressedMessage?.text) {
      await Clipboard.write({ string: this.lastPressedMessage.text });
      //console.log('Text copied to clipboard:', this.lastPressedMessage.text);
      this.selectedMessages = [];
      this.lastPressedMessage = null;
    }
  }

  replyToMessages() {
    if (this.selectedMessages.length === 1) {
      const messageToReply = this.selectedMessages[0];
      this.setReplyToMessage(messageToReply);
    }
  }

  setReplyToMessage(message: IMessage) {
    this.replyToMessage = message;
    this.selectedMessages = [];
    this.lastPressedMessage = null;
    this.replyTo = { message, sender: null };
    if (!message.isMe) {
      let user = this.chatService.currentUsers.find(
        (u) => u.userId === message.sender
      ) as IUser;
      if (!user) {
        user = { username: this.chatTitle as string } as IUser;
      }
      this.replyTo = { ...this.replyTo, sender: user };
    }
    setTimeout(() => {
      const inputElement = document.querySelector(
        'ion-textarea'
      ) as HTMLIonTextareaElement;
      if (inputElement) {
        inputElement.setFocus();
      }
    }, 100);
  }

  cancelReply() {
    this.replyToMessage = null;
  }

  getRepliedMessage(
    replyToMessageId: string
  ): (IMessage & { attachment?: IAttachment; fadeOut: boolean }) | null {
    if (!replyToMessageId) return null;

    // console.log("Searching for msgId:", replyToMessageId);
    // console.log("allMessage array:", this.allMessage);

    let msg = this.allMessage.find((m) => m.msgId === replyToMessageId);

    if (!msg && this.allMessages?.length) {
      msg = this.allMessages.find((m) => m.msgId === replyToMessageId);
    }

    if (!msg && this.groupedMessages?.length) {
      for (const group of this.groupedMessages) {
        msg = group.messages.find((m: any) => m.msgId === replyToMessageId);
        if (msg) break;
      }
    }

    // console.log("Found message:", msg);

    if (msg) {
      return {
        ...msg,
        fadeOut: false,
      } as IMessage & { attachment?: IAttachment; fadeOut: boolean };
    }

    return null;
  }

  getReplyPreviewText(message: any): string {
    // console.log({message})
    if (message.text) {
      return message.text.length > 50
        ? message.text.substring(0, 50) + '...'
        : message.text;
    } else if (message.attachment) {
      const type = (message.attachment as any).type;
      switch (type) {
        case 'image':
          return '📷 Photo';
        case 'video':
          return '🎥 Video';
        case 'audio':
          return '🎵 Audio';
        case 'file':
          return '📄 Document';
        default:
          return '📎 Attachment';
      }
    }
    return 'Message';
  }

  scrollToRepliedMessage(replyToMessageId: string) {
    if (!replyToMessageId) {
      // console.warn('No replyToMessageId provided');
      return;
    }

    // console.log('Scrolling to message:', replyToMessageId);

    setTimeout(() => {
      let targetElement = document.querySelector(
        `[data-msg-key="${replyToMessageId}"]`
      ) as HTMLElement;

      if (!targetElement) {
        const messageElements = document.querySelectorAll('[data-msg-key]');
        console.log('Found message elements:', messageElements.length);

        targetElement = Array.from(messageElements).find(
          (el) => el.getAttribute('data-msg-key') === replyToMessageId
        ) as HTMLElement;
      }

      if (targetElement) {
        console.log('Target element found, scrolling...');

        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        targetElement.classList.add('highlight-message');

        setTimeout(() => {
          targetElement?.classList.remove('highlight-message');
        }, 2000);
      } else {
        console.warn(
          'Target message element not found in DOM for msgId:',
          replyToMessageId
        );

        const allKeys = Array.from(
          document.querySelectorAll('[data-msg-key]')
        ).map((el) => el.getAttribute('data-msg-key'));
        console.log('Available message keys:', allKeys);
      }
    }, 100);
  }

  async deleteSelectedMessages() {
    if (!this.selectedMessages || this.selectedMessages.length === 0) {
      return;
    }

    const currentUserId = this.senderId;
    const count = this.selectedMessages.length;

    // Build preview text
    let preview = '';
    if (count === 1) {
      const m = this.selectedMessages[0];
      if (m.text && m.text.trim())
        preview =
          m.text.length > 120 ? m.text.substring(0, 120) + '...' : m.text;
      else preview = this.getAttachmentPreview(m.attachment || {});
    } else {
      preview = `${count} messages`;
    }

    // Always offer both options. Default to 'Delete for me'
    const inputs: any[] = [
      {
        name: 'choice',
        type: 'radio',
        label: 'Delete for me',
        value: 'forMe',
        checked: true,
      },
      {
        name: 'choice',
        type: 'radio',
        label: 'Delete for everyone',
        value: 'forEveryone',
        checked: false,
      },
    ];

    const alert = await this.alertCtrl.create({
      header: 'Delete messages?',
      cssClass: 'delete-confirm-alert',
      inputs,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'OK',
          handler: async (selectedValue: any) => {
            let choice: string = '';
            if (typeof selectedValue === 'string') {
              choice = selectedValue;
            } else if (
              Array.isArray(selectedValue) &&
              selectedValue.length > 0
            ) {
              choice = selectedValue[0];
            } else if (selectedValue && typeof selectedValue === 'object') {
              const keys = Object.keys(selectedValue).filter(
                (k) => selectedValue[k]
              );
              choice = keys[0] || '';
            }

            const doForMe = choice === 'forMe';
            const doForEveryone = choice === 'forEveryone';

            if (!doForMe && !doForEveryone) return;

            try {
              const db = getDatabase();

              // trigger fade-out on UI messages
              this.selectedMessages.forEach((msg) => (msg.fadeOut = true));

              // dismiss the alert first, then wait for fade-out duration before removing from arrays
              try {
                await alert.dismiss();
              } catch (e) {
                // ignore
              }

              await new Promise<void>((resolve) => {
                setTimeout(async () => {
                  try {
                    this.allMessages = this.allMessages.filter(
                      (m) => !m.fadeOut
                    );
                    this.displayedMessages = this.displayedMessages.filter(
                      (m) => !m.fadeOut
                    );
                    this.groupedMessages = await this.groupMessagesByDate(
                      this.displayedMessages
                    );
                    this.saveToLocalStorage();
                  } catch (e) {
                    console.error('fade-out removal failed', e);
                  } finally {
                    resolve();
                  }
                }, 1800); // match CSS transition duration
              });

              // Now apply deletions to server/db for each selected message
              const isLastMessageUpdateNeeded = this.selectedMessages.some(m=> m.isLast)
              for (const msg of [...this.selectedMessages]) {
                const key = msg.msgId;
                if (!key) continue;

                // DELETE FOR ME: mark deleted for this user
                if (doForMe) {
                  try {
                    await this.chatService.deleteMessage(key, false);
                    console.log('calling from chatting screen');
                  } catch (err) {
                    console.warn('deleteForMe failed for key', key, err);
                  }
                }

                // DELETE FOR EVERYONE: attempt for all messages (not restricted to sender)
                if (doForEveryone) {
                  try {
                   await this.chatService.deleteMessage(key, true);
                  } catch (err) {
                    console.warn('deleteForEveryone failed for key', key, err);
                  }
                }
              }

              if(isLastMessageUpdateNeeded){
                const lastMessage = await this.sqliteService.getLastMessage(this.roomId, currentUserId);
                await this.chatService.updateLastMessageInMeta(lastMessage);
              }

              const toast = await this.toastCtrl.create({
                message: doForEveryone
                  ? 'Deleted for everyone'
                  : 'Deleted for you',
                duration: 1600,
                color: 'medium',
              });
              await toast.present();

              this.selectedMessages = [];
              this.lastPressedMessage = null;
            } catch (e) {
              console.error('deleteSelectedMessages handler err', e);
              const t = await this.toastCtrl.create({
                message: 'Failed to delete messages',
                duration: 2000,
                color: 'danger',
              });
              t.present();
            }
          },
        },
      ],
    });

    await alert.present();
  }

  // isMessageHiddenForUser(msg: any): boolean {
  //   if (!msg) return false;

  //   if (msg.deletedFor && msg.deletedFor.everyone === true) {
  //     return true;
  //   }

  //   if (
  //     msg.deletedFor &&
  //     Array.isArray(msg.deletedFor.users) &&
  //     msg.deletedFor.users.includes(String(this.senderId))
  //   ) {
  //     return true;
  //   }

  //   return false;
  // }

  private applyDeletionFilters(dm: Message): boolean {
    try {
      // deletedForEveryone shortcut
      if (dm.deletedForEveryone) return true;

      // per-user deletion
      if (
        dm.deletedFor &&
        this.senderId &&
        dm.deletedFor[String(this.senderId)]
      ) {
        return true;
      }

      // optional: if isDeleted flag you might want to show placeholder instead of hiding
      // if you prefer placeholder, return false here and handle `isDeleted` in template.
      return false;
    } catch (e) {
      console.warn('applyDeletionFilters error', e);
      return false;
    }
  }

  onForward() {
    console.log('this. selected message ', this.selectedMessages);
    this.chatService.setForwardMessage(this.selectedMessages);
    this.selectedMessages = [];
    this.router.navigate(['/forwardmessage']);
  }

  async onMore(ev?: Event) {
    const hasText = !!this.lastPressedMessage?.text;
    console.log({ hasText });
    const hasAttachment = !!(
      this.lastPressedMessage?.attachment ||
      this.lastPressedMessage?.file ||
      this.lastPressedMessage?.image ||
      this.lastPressedMessage?.media
    );
    console.log({ hasAttachment });
    console.log('onMore', this.lastPressedMessage);

    // const isPinned =
    // this.pinnedMessage?.messageId === this.lastPressedMessage?.msgId;
    const isPinned = !!this.lastPressedMessage?.isPinned;
    console.log({ isPinned });

    const popover = await this.popoverController.create({
      component: MessageMorePopoverComponent,
      event: ev,
      translucent: true,
      showBackdrop: true,
      componentProps: {
        hasText: hasText,
        hasAttachment: hasAttachment,
        isPinned: isPinned,
        message: this.lastPressedMessage,
        currentUserId: this.senderId,
      },
    });

    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data) {
      this.handlePopoverAction(data);
    }
  }

  async handlePopoverAction(action: string) {
    switch (action) {
      case 'info':
        this.messageInfo();
        break;
      case 'copy':
        this.copyMessage();
        break;
      case 'share':
        this.shareMessage();
        break;
      case 'pin':
        this.pinMessage(this.lastPressedMessage);
        break;
      case 'unpin':
        this.unpinMessage();
        break;
      case 'edit':
        this.editMessage(this.lastPressedMessage);
        break;
    }
  }

  async messageInfo() {
    // pick the message: prefer lastPressedMessage then fallback to first selectedMessages
    const msg =
      this.lastPressedMessage ||
      (this.selectedMessages && this.selectedMessages[0]);
    if (!msg) {
      const t = await this.toastCtrl.create({
        message: 'No message selected',
        duration: 1500,
        color: 'medium',
      });
      await t.present();
      return;
    }

    try {
      this.chatService.setSelectedMessageInfo(msg);

      // clear UI selection state
      this.selectedMessages = [];
      this.lastPressedMessage = null;

      this.router.navigate(['/message-info'], {
        queryParams: {
          messageKey: msg.msgId || '',
        },
      });
    } catch (err) {
      console.error('messageInfo error', err);
      const t = await this.toastCtrl.create({
        message: 'Failed to open message info',
        duration: 1500,
        color: 'danger',
      });
      await t.present();
    }
  }

  async editMessage(message: IMessage) {
    const alert = await this.alertCtrl.create({
      header: 'Edit Message',
      inputs: [
        {
          name: 'text',
          type: 'text',
          value: message.text,
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Save',
          handler: async (data: any) => {
            const newText = data.text?.trim();
            if (!newText) return;

            try {
              await this.chatService.editMessage(
                this.roomId,
                message.msgId,
                newText
              );

              message.text = newText;
              message.isEdit = true;
              this.lastPressedMessage = { ...message };
              this.lastPressedMessage = [];
            } catch (err) {
              console.error('Failed to edit message:', err);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async copyMessage() {
    if (this.lastPressedMessage?.text) {
      await Clipboard.write({ string: this.lastPressedMessage.text });
      this.selectedMessages = [];
      this.lastPressedMessage = null;
    }
  }

  shareMessage() {
    //console.log('Share clicked for attachment:', this.lastPressedMessage);
  }

  pinMessage(message: IMessage) {
    const pin: PinnedMessage = {
      messageId: message.msgId as string,
      pinnedAt: Date.now(),
      pinnedBy: this.senderId,
      roomId: this.roomId,
      scope: 'global',
    };
    this.chatService.pinMessage(pin);
    this.selectedMessages = [];
    this.lastPressedMessage = null;
  }

  unpinMessage() {
    if (this.lastPressedMessage && this.lastPressedMessage.isPinned) {
      this.chatService.unpinMessage(this.lastPressedMessage);
      this.selectedMessages = [];
      this.lastPressedMessage = null;
    } else {
      console.warn('Message is not pinned or not selected');
    }
  }

  setupPinnedMessageListener() {
    this.pinnedMessageSubscription = this.chatService.listenToPinnedMessage(
      this.roomId,
      (pinnedMessage) => {
        this.pinnedMessage = pinnedMessage;
        if (pinnedMessage) {
          this.findPinnedMessageDetails(pinnedMessage.messageId);
        } else {
          this.pinnedMessageDetails = null;
        }
      }
    );
  }

  findPinnedMessageDetails(messageId: string | undefined) {
    for (const group of this.groupedMessages) {
      const foundMessage = group.messages.find(
        (msg) => msg.msgId === messageId
      );
      if (foundMessage) {
        this.pinnedMessageDetails = foundMessage;
        break;
      }
    }
  }

  scrollToPinnedMessage() {
    if (this.pinnedMessageDetails) {
      const element = document.querySelector(
        `[data-msg-key="${this.pinnedMessageDetails.key}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlighted');
        setTimeout(() => element.classList.remove('highlighted'), 2000);
      }
    }
  }

  checkMobileView() {
    this.showMobilePinnedBanner = window.innerWidth < 480;
  }

  openChatInfo() {
    //console.log('Opening chat info');
  }

  async loadInitialMessages() {
    this.isLoadingMore = true;
    try {
      await this.loadFromLocalStorage();
      // await this.loadMessagesFromFirebase(false);
    } catch (error) {
      console.error('Error loading initial messages:', error);
    } finally {
      this.isLoadingMore = false;
    }
  }

  getAttachmentIcon(type: string): string {
    switch (type) {
      case 'image':
        return 'image-outline';
      case 'video':
        return 'videocam-outline';
      case 'audio':
        return 'musical-note-outline';
      case 'file':
        return 'document-outline';
      default:
        return 'attach-outline';
    }
  }

  private setupTypingListener() {
    try {
      const db = getDatabase();

      try {
        if (this.typingUnsubscribe) this.typingUnsubscribe();
      } catch (e) {}

      const unsubscribe = onValue(
        dbRef(db, `typing/${this.roomId}`),
        (snap) => {
          const val = snap.val() || {};
          const now = Date.now();

          const entries = Object.keys(val).map((k) => ({
            userId: k,
            typing: val[k]?.typing ?? false,
            lastUpdated: val[k]?.lastUpdated ?? 0,
            name: val[k]?.name ?? null,
          }));

          const recent = entries.filter(
            (e) =>
              e.userId !== this.senderId &&
              e.typing &&
              now - (e.lastUpdated || 0) < 10000
          );

          this.typingCount = recent.length;

          if (this.chatType === 'private') {
            if (recent.length === 0) {
              this.typingUsers = [];
              this.typingFrom = null;
              return;
            }
            const other = recent[0];
            this.typingUsers = [
              {
                userId: other.userId,
                name: other.name || `User ${other.userId}`,
                avatar: 'assets/images/default-avatar.png',
              },
            ];
            this.typingFrom = this.typingUsers[0].name || null;
            return;
          }

          const usersForDisplay: {
            userId: string;
            name: string | null;
            avatar: string | null;
          }[] = [];

          recent.forEach((e) => {
            let member = this.groupMembers.find(
              (m) => String(m.user_id) === String(e.userId)
            );
            if (!member) {
              member = this.groupMembers.find(
                (m) =>
                  m.phone_number && String(m.phone_number) === String(e.userId)
              );
            }

            const avatar = member?.avatar || null;
            const displayName = member?.name || e.name || e.userId;

            usersForDisplay.push({
              userId: e.userId,
              name: displayName,
              avatar: avatar || 'assets/images/default-avatar.png',
            });
          });

          const uniq: { [k: string]: boolean } = {};
          this.typingUsers = usersForDisplay.filter((u) => {
            if (uniq[u.userId]) return false;
            uniq[u.userId] = true;
            return true;
          });

          this.typingFrom = this.typingUsers.length
            ? this.typingUsers[0].name
            : null;
        }
      );

      this.typingUnsubscribe = () => {
        try {
          unsubscribe();
        } catch (e) {}
      };
      this.onValueUnsubs.push(this.typingUnsubscribe);
    } catch (err) {
      console.warn('setupTypingListener error', err);
    }
  }

  //for minimal rerendering
  trackByMessageId(index: number, message: any): string {
    return message.msgId;
  }

 

  //new this method used in pagination
    async ngAfterViewInit() {
    // Setup scroll listener for pagination
    if (this.ionContent) {
      this.ionContent.ionScroll.subscribe(async (event: any) => {
        await this.handleScroll(event);
      });

      // Setup scroll event for tracking user scroll
      const scrollElement = await this.ionContent.getScrollElement();
      scrollElement.addEventListener('scroll', () => {
        this.trackUserScroll();
      });
    }

    // Initial scroll to bottom after short delay
    setTimeout(() => {
      this.scrollToBottomInstant();
      this.isInitialLoad = false;
    }, 300);
  }

  /**
   * 🎯 Handle scroll events for pagination
   */
  async handleScroll(event: any) {
    const scrollTop = event.detail.scrollTop;
    
    // Calculate if user is near bottom
    const scrollElement = await this.ionContent.getScrollElement();
    const scrollHeight = scrollElement.scrollHeight;
    const clientHeight = scrollElement.clientHeight;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    
    this.isNearBottom = distanceFromBottom < this.scrollThreshold;

    // Load older messages when scrolling near top
    if (scrollTop < 100 && !this.isLoadingMore && this.chatService.hasMoreMessages) {
      await this.loadOlderMessages();
    }
  }

  /**
   * 🎯 Track if user is actively scrolling
   */
  private trackUserScroll() {
    this.isUserScrolling = true;

    // Reset flag after scroll stops
    if (this.scrollDebounceTimer) {
      clearTimeout(this.scrollDebounceTimer);
    }

    this.scrollDebounceTimer = setTimeout(() => {
      this.isUserScrolling = false;
    }, 150);
  }

  /**
   * 🎯 Load older messages with scroll position preservation
   */
  async loadOlderMessages() {
    if (this.isLoadingMore || !this.chatService.hasMoreMessages) return;

    this.isLoadingMore = true;
    console.log('⬆️ Loading older messages...');

    try {
      // Get current scroll position
      const scrollElement = await this.ionContent.getScrollElement();
      const oldScrollHeight = scrollElement.scrollHeight;
      const oldScrollTop = scrollElement.scrollTop;

      // Load more messages
      await this.chatService.loadMessages();

      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Calculate new scroll position to maintain user's view
      const newScrollHeight = scrollElement.scrollHeight;
      const scrollDiff = newScrollHeight - oldScrollHeight;

      // Restore scroll position
      if (scrollDiff > 0) {
        await this.ionContent.scrollToPoint(0, oldScrollTop + scrollDiff, 0);
      }

      console.log('✅ Older messages loaded, scroll position maintained');
    } catch (error) {
      console.error('❌ Error loading older messages:', error);
    } finally {
      this.isLoadingMore = false;
    }
  }

  /**
   * 🎯 Handle message updates intelligently
   */
  private async handleMessageUpdate(previousCount: number, newCount: number) {
    // Wait for DOM update
    await this.waitForDOM();

    if (this.isInitialLoad) {
      // Initial load - always scroll to bottom
      this.scrollToBottomInstant();
      return;
    }

    if (newCount > previousCount) {
      // New messages received
      if (this.isNearBottom) {
        // User is near bottom - auto scroll to new message
        this.scrollToBottomSmooth();
      } else {
        // User is reading older messages - don't disturb
        console.log('📨 New message received but user is scrolling up - not auto-scrolling');
      }
    }
  }

  /**
   * 🎯 Scroll to bottom instantly (for initial load)
   */
  async scrollToBottomInstant() {
    if (!this.ionContent) return;

    try {
      await this.ionContent.scrollToBottom(0);
      this.isNearBottom = true;
      console.log('📍 Scrolled to bottom (instant)');
    } catch (error) {
      console.warn('Scroll to bottom failed:', error);
    }
  }

  /**
   * 🎯 Scroll to bottom smoothly (for new messages)
   */
  async scrollToBottomSmooth() {
    if (!this.ionContent) return;

    try {
      await this.ionContent.scrollToBottom(300);
      this.isNearBottom = true;
      console.log('📍 Scrolled to bottom (smooth)');
    } catch (error) {
      console.warn('Scroll to bottom failed:', error);
    }
  }

  /**
   * 🎯 Wait for DOM to update
   */
  private waitForDOM(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        setTimeout(() => resolve(), 50);
      });
    });
  }

  //new function used in pagination
  // async loadOlderMessages() {
  //   if (this.isLoadingMore || !this.chatService.hasMoreMessages) return;

  //   this.isLoadingMore = true;

  //   // Remember current scroll height
  //   const scrollElement = await this.ionContent.getScrollElement();
  //   const oldScrollHeight = scrollElement.scrollHeight;

  //   try {
  //     console.log('⬆️ Loading older messages...');
  //     await this.chatService.loadMessages(); // loads next offset from SQLite

  //     // After messages load, adjust scroll position to stay at same spot
  //     setTimeout(async () => {
  //       const newScrollHeight = scrollElement.scrollHeight;
  //       const scrollDiff = newScrollHeight - oldScrollHeight;
  //       await this.ionContent.scrollByPoint(0, scrollDiff, 0);
  //     }, 100);
  //   } catch (error) {
  //     console.error('❌ Error loading older messages:', error);
  //   } finally {
  //     this.isLoadingMore = false;
  //   }
  // }

  //new function used in pagination
  // scrollToBottomSmooth() {
  //   if (this.ionContent) {
  //     setTimeout(() => {
  //       this.ionContent.scrollToBottom(200);
  //     }, 100);
  //   }
  // }

  async loadMoreMessages() {
    if (this.isLoadingMore || !this.hasMoreMessages) {
      return;
    }

    this.isLoadingMore = true;
    const currentScrollHeight =
      this.scrollContainer?.nativeElement?.scrollHeight || 0;

    try {
      // await this.loadMessagesFromFirebase(true);

      setTimeout(() => {
        if (this.scrollContainer?.nativeElement) {
          const newScrollHeight =
            this.scrollContainer.nativeElement.scrollHeight;
          const scrollDiff = newScrollHeight - currentScrollHeight;
          this.scrollContainer.nativeElement.scrollTop = scrollDiff;
        }
      }, 100);
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      this.isLoadingMore = false;
    }
  }

  getRoomId(userA: string, userB: string): string {
    return userA < userB ? `${userA}_${userB}` : `${userB}_${userA}`;
  }

  async listenForMessages() {
    this.observeVisibleMessages();
  }

  private async markDisplayedMessagesAsRead() {
    const unreadMessages = this.displayedMessages.filter(
      (msg) => !msg.read && msg.receiver_id === this.senderId
    );

    for (const msg of unreadMessages) {
      await this.chatService.markRead(this.roomId, msg.key);
    }
  }

  observeVisibleMessages() {
    const allMessageElements = document.querySelectorAll('[data-msg-key]');

    allMessageElements.forEach((el: any) => {
      const msgKey = el.getAttribute('data-msg-key');
      const msgIndex = this.displayedMessages.findIndex(
        (m) => m.key === msgKey
      );
      if (msgIndex === -1) return;

      const msg = this.displayedMessages[msgIndex];
      console.log({ msg });

      if (!msg.read && msg.receiver_id === this.senderId) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                this.chatService.markRead(this.roomId, msgKey);
                observer.unobserve(entry.target);
              }
            });
          },
          {
            threshold: 1.0,
          }
        );

        observer.observe(el);
      }
    });
  }

  // async groupMessagesByDate(messages: Message[]) {
  //   const grouped: { [date: string]: any[] } = {};
  //   const today = new Date();
  //   const yesterday = new Date();
  //   yesterday.setDate(today.getDate() - 1);

  //   for (const msg of messages) {
  //     const timestamp = new Date(msg.timestamp);

  //     const hours = timestamp.getHours();
  //     const minutes = timestamp.getMinutes();
  //     const ampm = hours >= 12 ? 'PM' : 'AM';
  //     const formattedHours = hours % 12 || 12;
  //     const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
  //     (msg as any).time = `${formattedHours}:${formattedMinutes} ${ampm}`;

     

  //     const isToday =
  //       timestamp.getDate() === today.getDate() &&
  //       timestamp.getMonth() === today.getMonth() &&
  //       timestamp.getFullYear() === today.getFullYear();

  //     const isYesterday =
  //       timestamp.getDate() === yesterday.getDate() &&
  //       timestamp.getMonth() === yesterday.getMonth() &&
  //       timestamp.getFullYear() === yesterday.getFullYear();

  //     let label = '';
  //     if (isToday) {
  //       label = 'Today';
  //     } else if (isYesterday) {
  //       label = 'Yesterday';
  //     } else {
  //       const dd = timestamp.getDate().toString().padStart(2, '0');
  //       const mm = (timestamp.getMonth() + 1).toString().padStart(2, '0');
  //       const yyyy = timestamp.getFullYear();
  //       label = `${dd}/${mm}/${yyyy}`;
  //     }

  //     if (!grouped[label]) {
  //       grouped[label] = [];
  //     }
  //     grouped[label].push(msg);
  //   }

  //   return Object.keys(grouped).map((date) => ({
  //     date,
  //     messages: grouped[date],
  //   }));
  // }

// async groupMessagesByDate(messages: Message[]) {
//   const grouped: { [date: string]: any[] } = {};
//   const today = new Date();
//   const yesterday = new Date();
//   yesterday.setDate(today.getDate() - 1);

//   if (!messages || messages.length === 0) {
//     return [];
//   }

//   const visibleMessages = messages.filter(msg => !this.isMessageHiddenForUser(msg));

//   for (const msg of visibleMessages) {
//     const timestamp = new Date(msg.timestamp);

//     const hours = timestamp.getHours();
//     const minutes = timestamp.getMinutes();
//     const ampm = hours >= 12 ? 'PM' : 'AM';
//     const formattedHours = hours % 12 || 12;
//     const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
//     (msg as any).time = `${formattedHours}:${formattedMinutes} ${ampm}`;

//     const isToday =
//       timestamp.getDate() === today.getDate() &&
//       timestamp.getMonth() === today.getMonth() &&
//       timestamp.getFullYear() === today.getFullYear();

//     const isYesterday =
//       timestamp.getDate() === yesterday.getDate() &&
//       timestamp.getMonth() === yesterday.getMonth() &&
//       timestamp.getFullYear() === yesterday.getFullYear();

//     let label = '';
//     if (isToday) {
//       label = 'Today';
//     } else if (isYesterday) {
//       label = 'Yesterday';
//     } else {
//       const dd = timestamp.getDate().toString().padStart(2, '0');
//       const mm = (timestamp.getMonth() + 1).toString().padStart(2, '0');
//       const yyyy = timestamp.getFullYear();
//       label = `${dd}/${mm}/${yyyy}`;
//     }

//     if (!grouped[label]) {
//       grouped[label] = [];
//     }
//     grouped[label].push(msg);
//   }

//   return Object.keys(grouped)
//     .filter(date => grouped[date].length > 0)
//     .map((date) => ({
//       date,
//       messages: grouped[date],
//     }));
// }

  isLoadingIndicatorVisible(): boolean {
    return this.isLoadingMore;
  }

  async refreshMessages(event?: any) {
    try {
      this.page = 0;
      this.hasMoreMessages = true;
      this.lastMessageKey = null;
      this.allMessages = [];
      this.displayedMessages = [];

      await this.loadInitialMessages();

      if (event) {
        event.target.complete();
      }
    } catch (error) {
      console.error('Error refreshing messages:', error);
      if (event) {
        event.target.complete();
      }
    }
  }

  async loadFromLocalStorage() {
    const cached = localStorage.getItem(this.roomId);
    if (!cached) return;

    try {
      const rawMessages = JSON.parse(cached);
      const recentMessages = rawMessages.slice(-this.limit * 3);

      const decryptedMessages = await Promise.all(
        recentMessages.map(async (msg: any) => {
          let decryptedText = '';
          try {
            decryptedText = await this.encryptionService.decrypt(
              msg.text || ''
            );
          } catch (e) {
            console.warn('decrypt cached message.text failed', e);
            decryptedText = '';
          }

          // decrypt cached attachment caption if present
          if (msg.attachment && msg.attachment.caption) {
            try {
              const captionPlain = await this.encryptionService.decrypt(
                msg.attachment.caption
              );
              msg.attachment.caption = captionPlain; // overwrite with plaintext
            } catch (e) {
              console.warn('decrypt cached attachment caption failed', e);
            }
          }

          return { ...msg, text: decryptedText } as Message;
        })
      );

      // Filter out messages that are deleted for this user (or globally)
      const visibleMessages = decryptedMessages.filter(
        (m) => !this.applyDeletionFilters(m)
      );

      this.allMessages = visibleMessages;
      this.displayedMessages = visibleMessages.slice(-this.limit);
      this.groupedMessages = await this.groupMessagesByDate(
        this.displayedMessages
      );

      if (visibleMessages.length > 0) {
        this.lastMessageKey = visibleMessages[0].key;
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
  }

  blobToFile(blob: Blob, fileName: string, mimeType?: string): File {
    return new File([blob], fileName, {
      type: mimeType || blob.type,
      lastModified: Date.now(),
    });
  }

  async pickAttachment() {
    const result = await FilePicker.pickFiles({ readData: true });

    if (result?.files?.length) {
      const file = result.files[0];
      const mimeType = file.mimeType;
      const type = mimeType?.startsWith('image')
        ? 'image'
        : mimeType?.startsWith('video')
        ? 'video'
        : 'file';

      let blob = file.blob as Blob;

      if (!blob && file.data) {
        blob = this.FileService.convertToBlob(
          `data:${mimeType};base64,${file.data}`,
          mimeType
        );
      }

      const previewUrl = URL.createObjectURL(blob);
      // console.log({previewUrl})

      this.selectedAttachment = {
        type,
        blob,
        fileName: `${Date.now()}.${this.getFileExtension(file.name)}`,
        mimeType,
        fileSize: blob.size,
        previewUrl,
      };

      this.showPreviewModal = true;
    }
  }

  getFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }

  private async compressImage(blob: Blob): Promise<Blob> {
    if (!blob.type.startsWith('image/')) {
      return blob;
    }

    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
    };

    try {
      return await imageCompression(blob as any, options);
    } catch (err) {
      console.warn('Image compression failed:', err);
      return blob;
    }
  }

  // cancelAttachment() {
  //   this.selectedAttachment = null;
  //   this.showPreviewModal = false;
  //   this.messageText = '';
  // }

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

  setReplyTo(message: IMessage) {
    this.replyToMessage = message;
  }


  // async sendMessage() {
  //   console.log("this send message function is called")
  //   this.sender_name = this.authService.authData?.name || '';
  //   if (this.isSending) return;
  //   this.isSending = true;

  //   try {
  //     const plainText = (this.messageText || '').trim();

  //     // Defensive: don't send empty message (unless attachment exists)
  //     if (!plainText && !this.selectedAttachment) {
  //       const toast = await this.toastCtrl.create({
  //         message: 'Type something to send',
  //         duration: 1500,
  //         color: 'warning',
  //       });
  //       await toast.present();
  //       this.isSending = false;
  //       return;
  //     }

  //     // Build base local message (conforms to IMessage shape)
  //     const msgId = uuidv4();
  //     const timestamp = Date.now();

  //     const localMessage: Partial<IMessage & { attachment?: IAttachment }> = {
  //       sender: this.senderId,
  //       sender_name: this.sender_name,
  //       receiver_id: this.receiverId,
  //       text: plainText || '', // visible text (original)
  //       timestamp,
  //       msgId,
  //       replyToMsgId: this.replyTo?.message?.msgId || '',
  //       isEdit: false,
  //       isPinned: false,
  //       type: 'text',
  //       reactions: [],
  //       // Add a translations object containing only the original (English).
  //       // This keeps the message contract uniform across translated & non-translated sends.
  //       translations: {
  //         original: {
  //           code: 'en',
  //           label: 'English (Original)',
  //           text: plainText || '',
  //         },
  //       },
  //     };

  //     // Handle attachment if present
  //     console.log("this is called and upload to S3 before", this.selectedAttachment)
  //     if (this.selectedAttachment) {
  //       try {
  //         console.log("this is called and upload to S3 after")
  //         const mediaId = await this.uploadAttachmentToS3(
  //           this.selectedAttachment
  //         );
  //         console.log({ mediaId });
  //         localMessage.attachment = {
  //           type: this.selectedAttachment.type,
  //           msgId,
  //           mediaId,
  //           fileName: this.selectedAttachment.fileName,
  //           mimeType: this.selectedAttachment.mimeType,
  //           fileSize: this.selectedAttachment.fileSize,
  //           caption: plainText || '',
  //         };
  //         console.log(localMessage.attachment);
  //         // Save file locally into "sent" folder (existing behavior)
  //         localMessage.attachment.localUrl =
  //           await this.FileService.saveFileToSent(
  //             this.selectedAttachment.fileName,
  //             this.selectedAttachment.blob
  //           );
  //       } catch (error) {
  //         console.error('Failed to upload attachment:', error);
  //         const toast = await this.toastCtrl.create({
  //           message: 'Failed to upload attachment. Please try again.',
  //           duration: 3000,
  //           color: 'danger',
  //         });
  //         await toast.present();
  //         this.isSending = false;
  //         return;
  //       }
  //     }

  //     // Send using chat service (this will persist to RTDB, SQLite, etc.)
  //     console.log({ localMessage });
  //     await this.chatService.sendMessage(localMessage);

  //     // Clear UI state exactly like before
  //     this.messageText = '';
  //     this.showSendButton = false;
  //     this.selectedAttachment = null;
  //     this.showPreviewModal = false;
  //     this.replyToMessage = null;
  //     await this.stopTypingSignal();
  //     this.scrollToBottom();
  //     this.chatService.setTypingStatus(false);
  //     if (this.typingTimeout) {
  //       clearTimeout(this.typingTimeout);
  //     }
  //   } catch (error) {
  //     console.error('Error sending message:', error);
  //     const toast = await this.toastCtrl.create({
  //       message: 'Failed to send message. Please try again.',
  //       duration: 3000,
  //       color: 'danger',
  //     });
  //     await toast.present();
  //   } finally {
  //     this.isSending = false;
  //   }
  // }

   /**
   * 🎯 Send message with smart scroll
   */
  async sendMessage() {
    if (this.isSending) return;
    this.isSending = true;

    try {
      const plainText = (this.messageText || '').trim();

      if (!plainText && !this.selectedAttachment) {
        const toast = await this.toastCtrl.create({
          message: 'Type something to send',
          duration: 1500,
          color: 'warning',
        });
        await toast.present();
        this.isSending = false;
        return;
      }

      // Build message
      const msgId = uuidv4();
      const timestamp = Date.now();

      const localMessage: Partial<IMessage & { attachment?: IAttachment }> = {
        sender: this.senderId,
        sender_name: this.sender_name,
        receiver_id: this.receiverId,
        text: plainText || '',
        timestamp,
        msgId,
        replyToMsgId: this.replyTo?.message?.msgId || '',
        isEdit: false,
        isPinned: false,
        type: 'text',
        reactions: [],
        translations: {
          original: {
            code: 'en',
            label: 'English (Original)',
            text: plainText || '',
          },
        },
      };

      // Handle attachment if present
      if (this.selectedAttachment) {
        try {
          const mediaId = await this.uploadAttachmentToS3(this.selectedAttachment);
          
          localMessage.attachment = {
            type: this.selectedAttachment.type,
            msgId,
            mediaId,
            fileName: this.selectedAttachment.fileName,
            mimeType: this.selectedAttachment.mimeType,
            fileSize: this.selectedAttachment.fileSize,
            caption: plainText || '',
          };

          localMessage.attachment.localUrl = await this.FileService.saveFileToSent(
            this.selectedAttachment.fileName,
            this.selectedAttachment.blob
          );
        } catch (error) {
          console.error('Failed to upload attachment:', error);
          const toast = await this.toastCtrl.create({
            message: 'Failed to upload attachment. Please try again.',
            duration: 3000,
            color: 'danger',
          });
          await toast.present();
          this.isSending = false;
          return;
        }
      }

      // Send message
      await this.chatService.sendMessage(localMessage);

      // Clear UI
      this.messageText = '';
      this.showSendButton = false;
      this.selectedAttachment = null;
      this.showPreviewModal = false;
      this.replyToMessage = null;
      
      await this.stopTypingSignal();
      
      // Always scroll to bottom after sending
      await this.waitForDOM();
      this.scrollToBottomSmooth();
      
      this.chatService.setTypingStatus(false);
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to send message. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.isSending = false;
    }
  }

  /**
   * 🎯 Group messages by date (filter empty/deleted)
   */
  async groupMessagesByDate(messages: Message[]) {
    const grouped: { [date: string]: any[] } = {};
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (!messages || messages.length === 0) {
      return [];
    }

    // Filter out hidden messages
    const visibleMessages = messages.filter(msg => !this.isMessageHiddenForUser(msg));

    for (const msg of visibleMessages) {
      const timestamp = new Date(msg.timestamp);

      const hours = timestamp.getHours();
      const minutes = timestamp.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
      (msg as any).time = `${formattedHours}:${formattedMinutes} ${ampm}`;

      const isToday =
        timestamp.getDate() === today.getDate() &&
        timestamp.getMonth() === today.getMonth() &&
        timestamp.getFullYear() === today.getFullYear();

      const isYesterday =
        timestamp.getDate() === yesterday.getDate() &&
        timestamp.getMonth() === yesterday.getMonth() &&
        timestamp.getFullYear() === yesterday.getFullYear();

      let label = '';
      if (isToday) {
        label = 'Today';
      } else if (isYesterday) {
        label = 'Yesterday';
      } else {
        const dd = timestamp.getDate().toString().padStart(2, '0');
        const mm = (timestamp.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = timestamp.getFullYear();
        label = `${dd}/${mm}/${yyyy}`;
      }

      if (!grouped[label]) {
        grouped[label] = [];
      }
      grouped[label].push(msg);
    }

    return Object.keys(grouped)
      .filter(date => grouped[date].length > 0)
      .map((date) => ({
        date,
        messages: grouped[date],
      }));
  }

  /**
   * 🎯 Check if message is hidden for current user
   */
  isMessageHiddenForUser(msg: any): boolean {
    if (!msg) return false;

    // Global deletion
    if (msg.deletedFor && msg.deletedFor.everyone === true) {
      return true;
    }

    // User-specific deletion
    if (
      msg.deletedFor &&
      Array.isArray(msg.deletedFor.users) &&
      msg.deletedFor.users.includes(String(this.senderId))
    ) {
      return true;
    }

    return false;
  }

  async getPreviewUrl(msg: any) {
    return await this.chatService.getPreviewUrl(msg);
  }

  startReceiverStatusPoll(pollIntervalMs = 30000) {
    if (!this.receiverId) return;

    this.presence
      .getStatus(Number(this.receiverId))
      .subscribe((res) => this.handleStatusResponse(res));
    // Start polling while view is active:
    this.statusPollSub = timer(pollIntervalMs, pollIntervalMs)
      .pipe(switchMap(() => this.presence.getStatus(Number(this.receiverId))))
      .subscribe((res) => this.handleStatusResponse(res));
  }

  handleStatusResponse(res: any) {
    if (!res || !res.data) {
      this.receiverOnline = false;
      this.receiverLastSeen = null;
      return;
    }
    this.receiverOnline = Number(res.data.is_online) === 1;
    this.receiverLastSeen = res.data.last_seen
      ? this.formatLastSeen(res.data.last_seen)
      : null;
  }

    isEmptyObject(obj: any): boolean {
  return obj && Object.keys(obj).length === 0;
}

 

  private async uploadAttachmentToS3(attachment: any): Promise<string> {
    try {
      const uploadResponse = await firstValueFrom(
        this.service.getUploadUrl(
          parseInt(this.senderId),
          attachment.type,
          attachment.fileSize,
          attachment.mimeType,
          {
            caption: this.messageText.trim(),
            fileName: attachment.fileName,
          }
        )
      );

      if (!uploadResponse?.status || !uploadResponse.upload_url) {
        throw new Error('Failed to get upload URL');
      }

      const uploadResult = await firstValueFrom(
        this.service.uploadToS3(
          uploadResponse.upload_url,
          this.blobToFile(
            attachment.blob,
            attachment.fileName,
            attachment.mimeType
          )
        )
      );

      return uploadResponse.media_id;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw error;
    }
  }

  async openAttachmentModal(msg: any) {
    // console.log("this is from open attachment modal", msg)
    if (!msg.attachment.type) return;

    // let attachmentUrl = '';
    // console.log("this msg is show in preview modal", msg);

    try {
     
      let localUrl = msg.attachment.localUrl;

      if (!localUrl) {
     

          if (!msg.isMe) {
           const relativePath = await this.downloadAndSaveLocally(
              this.escapeUrl(msg.attachment.cdnUrl),
              msg.attachment.fileName
            );
            if(relativePath){
              localUrl = await this.FileService.getFilePreview(relativePath as string)
              // attachmentUrl = localUrl;
              this.sqliteService.updateAttachment(msg.msgId, {localUrl})
           }
          }
        // }
      }
      

      const modal = await this.modalCtrl.create({
        component: AttachmentPreviewModalComponent,
        componentProps: {
          attachment: {
            ...msg.attachment,
            url: localUrl || this.escapeUrl(msg.attachment.cdnUrl),
          },
          message: msg,
        },
        cssClass: 'attachment-modal',
      });

      await modal.present();
      const { data } = await modal.onDidDismiss();
      console.log({data})

      if (data && data.action === 'reply') {
        this.setReplyToMessage(data.message);
      }
    } catch (error) {
      console.error('Failed to load attachment:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to load attachment',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  private async downloadAndSaveLocally(url: string, fileName: string) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await this.FileService.saveFileToReceived(fileName, blob);
    } catch (error) {
      console.warn('Failed to save file locally:', error);
      return null;
    }
  }

  getAttachmentPreview(attachment: any): string {
    if (attachment.caption) {
      return attachment.caption.length > 30
        ? attachment.caption.substring(0, 30) + '...'
        : attachment.caption;
    }

    switch (attachment.type) {
      case 'image':
        return '📷 Photo';
      case 'video':
        return '🎥 Video';
      case 'audio':
        return '🎵 Audio';
      case 'file':
        return attachment.fileName || '📄 File';
      default:
        return '📎 Attachment';
    }
  }

  async showAttachmentPreviewPopup() {
    const alert = await this.alertController.create({
      header: 'Send Attachment',
      message: this.getAttachmentPreviewHtml(),
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            this.selectedAttachment = null;
          },
        },
        {
          text: 'Send',
          handler: () => {
            this.sendMessage();
          },
        },
      ],
    });

    await alert.present();
  }

  getAttachmentPreviewHtml(): string {
    if (!this.selectedAttachment) return '';

    const { type, base64Data, fileName } = this.selectedAttachment;

    if (type === 'image') {
      return `<img src="${base64Data}" style="max-width: 100%; border-radius: 8px;" />`;
    } else if (type === 'video') {
      return `<video controls style="max-width: 100%; border-radius: 8px;">
              <source src="${base64Data}" type="video/mp4" />
            </video>`;
    } else if (type === 'audio') {
      return `<audio controls>
              <source src="${base64Data}" type="audio/mpeg" />
            </audio>`;
    } else {
      return `<p>📎 ${fileName || 'File attached'}</p>`;
    }
  }

  getMimeTypeFromName(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'pdf':
        return 'application/pdf';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default:
        return '';
    }
  }

  async addReaction(msg: IMessage, emoji: string) {
    const userId = this.senderId;
    const current = msg.reactions?.find((r) => r.userId == userId) || null;
    const newVal = current?.emoji === emoji ? null : emoji;

    try {
      await this.chatService.setQuickReaction({
        msgId: msg.msgId,
        userId,
        emoji: newVal,
      });
      this.selectedMessages = [];
    } catch (error) {
      console.error('Reaction not save', error);
    }
  }

  async openEmojiKeyboard(msg: IMessage) {
  try {
    const modal = await this.modalCtrl.create({
      component: EmojiPickerModalComponent,
      cssClass: 'emoji-picker-modal',
      breakpoints: [0, 0.5, 0.75, 1],
      initialBreakpoint: 0.75,
      backdropDismiss: true,
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();

    if (data && data.selected && data.emoji) {
      console.log('✅ Emoji selected:', data.emoji);
      
      // Add reaction to the message
      await this.addReaction(msg, data.emoji);
      
      // Clear selection
      this.selectedMessages = [];
      
      // Show success toast
      const toast = await this.toastCtrl.create({
        message: `Reaction added: ${data.emoji}`,
        duration: 1500,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    }
  } catch (error) {
    console.error('❌ Error opening emoji picker:', error);
    
    const toast = await this.toastCtrl.create({
      message: 'Failed to open emoji picker',
      duration: 2000,
      color: 'danger',
    });
    await toast.present();
  }
}

  onEmojiPicked(ev: CustomEvent) {
    const val = (ev.detail as any)?.value || '';
    const emoji = val?.trim();
    if (!emoji || !this.emojiTargetMsg) return;
    // this.addReaction(this.emojiTargetMsg, emoji);

    // clear input so next pick fires change again
    const native = (ev.target as any)?.querySelector?.(
      'input'
    ) as HTMLInputElement;
    if (native) native.value = '';
    this.emojiTargetMsg = null;
  }

  /** Summary already exists; re-use it to build compact badges */
  getReactionSummary(
    msg: Message
  ): Array<{ emoji: string; count: number; mine: boolean }> {
    const map = msg.reactions || {};
    const byEmoji: Record<string, number> = {};
    Object.values(map).forEach((e: any) => {
      const em = String(e || '');
      if (!em) return;
      byEmoji[em] = (byEmoji[em] || 0) + 1;
    });
    return Object.keys(byEmoji)
      .map((emoji) => ({
        emoji,
        count: byEmoji[emoji],
        mine: map[this.senderId] === emoji,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /** Return max 3 badges; prefer user's reaction first */
  getReactionBadges(
    msg: Message
  ): Array<{ emoji: string; count: number; mine: boolean }> {
    const list = this.getReactionSummary(msg);
    // Put "mine" first if exists
    const mineIdx = list.findIndex((x) => x.mine);
    if (mineIdx > 0) {
      const mine = list.splice(mineIdx, 1)[0];
      list.unshift(mine);
    }
    return list.slice(0, 3);
  }

  getReactionsCount(msg: IMessage) {
    return msg.reactions.filter((r) => !!r.emoji).length || 0;
  }

  async onReactionBadgeClick(
  ev: Event,
  msg: IMessage,
  badge: { emoji: string | null; userId: string }
) {
  ev.stopPropagation();
  
  const currentUserId = this.senderId;
  
  // If user clicks any reaction badge, toggle their reaction with same emoji
  const currentReaction = msg.reactions?.find((r) => r.userId === currentUserId);
  const newEmoji = currentReaction?.emoji === badge.emoji ? null : badge.emoji;
  
  try {
    await this.chatService.setQuickReaction({
      msgId: msg.msgId,
      userId: currentUserId,
      emoji: newEmoji,
    });
  } catch (error) {
    console.error('Failed to update reaction:', error);
  }
}

  goToProfile() {
    // const isGroup = this.chatType === 'group';
    const queryParams: any = {
      receiverId: this.receiverId,
      isGroup: this.chatType === 'group' ? 'true' : 'false',
    };

    this.router.navigate(['/profile-screen'], { queryParams });
  }

  saveToLocalStorage() {
    try {
      const messagesToSave = this.allMessages.slice(-100);
      localStorage.setItem(this.roomId, JSON.stringify(messagesToSave));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }

  scrollToBottom() {
    if (this.ionContent) {
      setTimeout(() => {
        this.ionContent.scrollToBottom(300);
      }, 100);
    }
  }

  onInputChange() {
    this.showSendButton = this.messageText?.trim().length > 0;
  }

  onInputFocus() {
    this.setDynamicPadding();
  }

  onInputBlur() {
    this.onInputBlurTyping();
    this.setDynamicPadding();
  }

  goToCallingScreen() {
    // this.router.navigate(['/calling-screen']);
    console.log("will work in future")
  }

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

      // Create preview URL
      const previewUrl = URL.createObjectURL(blob);

      this.selectedAttachment = {
        type: 'image',
        blob: blob,
        fileName: fileName,
        mimeType: mimeType,
        fileSize: blob.size,
        previewUrl: previewUrl,
      };
      console.log("this selected attachment", this.selectedAttachment);

      // Show preview modal
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

  // ========================================
// 📸 CROPPER MODAL INTEGRATION
// ========================================

async openCropperModal() {
  if (!this.selectedAttachment || this.selectedAttachment.type !== 'image') {
    return;
  }

  try {
    const modal = await this.modalCtrl.create({
      component: ImageCropperModalComponent,
      componentProps: {
        imageUrl: this.selectedAttachment.previewUrl,
        aspectRatio: 0, // Free aspect ratio
        cropQuality: 0.9
      },
      cssClass: 'image-cropper-modal'
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();

    if (data && data.success && data.originalBlob) {
      if (this.selectedAttachment.previewUrl) {
        URL.revokeObjectURL(this.selectedAttachment.previewUrl);
      }

      // ✅ Create new preview URL from cropped blob
      const newPreviewUrl = URL.createObjectURL(data.originalBlob);

      // ✅ Generate new filename with timestamp
      const timestamp = Date.now();
      const fileExtension = this.selectedAttachment.fileName.split('.').pop() || 'jpg';
      const newFileName = `cropped_${timestamp}.${fileExtension}`;

      // ✅ Update selectedAttachment with cropped image data
      this.selectedAttachment = {
        ...this.selectedAttachment,
        blob: data.originalBlob,
        previewUrl: newPreviewUrl,
        fileName: newFileName,
        fileSize: data.originalBlob.size,
        mimeType: data.originalBlob.type || this.selectedAttachment.mimeType
      };

      // ✅ Show success toast
      const toast = await this.toastCtrl.create({
        message: 'Image cropped successfully',
        duration: 1500,
        color: 'success'
      });
      await toast.present();

    } else if (data && data.cancelled) {
      // User cancelled cropping
      console.log('Cropping cancelled by user');
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
    console.error('Error opening cropper modal:', error);
    const toast = await this.toastCtrl.create({
      message: 'Failed to open image editor',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
}

  openKeyboard() {
    setTimeout(() => {
      const textareaElement = document.querySelector(
        'ion-textarea'
      ) as HTMLIonTextareaElement;
      if (textareaElement) {
        textareaElement.setFocus();
      }
    }, 100);
  }

  ngOnDestroy() {
    this.keyboardListeners.forEach((listener) => listener?.remove());
    this.messageSub?.unsubscribe();
    if (this.pinnedMessageSubscription) {
      try {
        this.pinnedMessageSubscription();
      } catch (e) {}
    }
    this.typingRxSubs.forEach((s) => s.unsubscribe());
    try {
      if (this.typingUnsubscribe) this.typingUnsubscribe();
    } catch (e) {}
    this.stopTypingSignal();

    window.removeEventListener('resize', this.resizeHandler);
    if ((this as any)._ro) {
      (this as any)._ro.disconnect();
    }

    try {
      if (this.iBlockedRef) off(this.iBlockedRef);
      if (this.theyBlockedRef) off(this.theyBlockedRef);
      clearTimeout(this.blockBubbleTimeout);
    } catch (e) {}

    this.onValueUnsubs.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
    this.onValueUnsubs = [];
    this.statusPollSub?.unsubscribe();

    this.presenceSubscription?.unsubscribe();
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
  }

  private isGestureNavigation(): boolean {
    const screenHeight = window.screen.height || 0;
    const innerHeight = window.innerHeight || 0;
    const diff = screenHeight - innerHeight;
    return diff < 40;
  }

  private isTransparentButtonNav(): boolean {
    const screenHeight = window.screen.height || 0;
    const innerHeight = window.innerHeight || 0;
    const diff = screenHeight - innerHeight;
    return diff < 5;
  }

  setDynamicPadding() {
    const footerEl = this.el.nativeElement.querySelector(
      '.footer-fixed'
    ) as HTMLElement;
    if (!footerEl) return;

    if (this.platform.is('ios')) {
      const safeAreaBottom =
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--ion-safe-area-bottom'
          )
        ) || 0;

      if (safeAreaBottom > 0) {
        this.renderer.setStyle(footerEl, 'padding-bottom', '16px');
      } else {
        this.renderer.setStyle(footerEl, 'padding-bottom', '6px');
      }
    } else {
      if (this.isGestureNavigation()) {
        this.renderer.setStyle(footerEl, 'padding-bottom', '35px');
      } else if (this.isTransparentButtonNav()) {
        this.renderer.setStyle(footerEl, 'padding-bottom', '35px');
      } else {
        this.renderer.setStyle(footerEl, 'padding-bottom', '6px');
      }
    }
  }

  onKeyboardOrInputChange() {
    this.setDynamicPadding();
  }

  // ---------- small helpers ----------
  private escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  //for removing query params from local or cdn url
  escapeUrl(url : any){
    return url.replace(/[?#].*$/, '')
  }

  // --------------------------translation module added on 1 nov-----

  // // ============================================
  // // UPDATED TRANSLATION MODULE - 3 CASES LOGIC
  // // ============================================

  showTranslationOptions = false;
  myLangCode = 'en';
  receiverLangCode = 'hi';
  myLangLabel = 'English';
  receiverLangLabel = 'English';
  translatedPreview: string | null = null;
  // consent storage key
  readonly TRANSLATION_CONSENT_KEY = 'translationConsent'; // values: 'granted' | 'denied'

  // UI flag (optional) to show a small consent banner in the footer if needed
  showTranslationConsentBanner = false;

  /** Return true if user has already granted translation consent */
  hasTranslationConsent(): boolean {
    try {
      const v = localStorage.getItem(this.TRANSLATION_CONSENT_KEY);
      return v === 'granted';
    } catch {
      return false;
    }
  }
  /**
   * Shows an Alert asking user to allow using the translation API.
   * Returns true if user grants consent, false otherwise.
   */
  async askForTranslationConsent(): Promise<boolean> {
    // If already granted, skip
    if (this.hasTranslationConsent()) return true;

    // If explicitly denied previously, still show prompt? Here we re-prompt — change if you want.
    return new Promise<boolean>(async (resolve) => {
      const alert = await this.alertCtrl.create({
        header: 'Allow translations?',
        subHeader:
          'Translation requires sending message text to an external service',
        message: `
        To provide message translations we send the message text to a third-party translation service.
       
        We do not collect personal account details. Only the message text is sent.
        If you agree, translations will be fetched and cached locally. You can revoke this permission anytime.
      `,
        buttons: [
          {
            text: 'Decline',
            role: 'cancel',
            handler: () => {
              try {
                localStorage.setItem(this.TRANSLATION_CONSENT_KEY, 'denied');
              } catch {}
              this.showToast('Translation declined', 'medium');
              resolve(false);
            },
          },
          {
            text: 'Allow & Proceed',
            handler: () => {
              try {
                localStorage.setItem(this.TRANSLATION_CONSENT_KEY, 'granted');
              } catch {}
              this.showToast('Translation allowed', 'success');
              resolve(true);
            },
          },
        ],
        backdropDismiss: false,
      });

      await alert.present();
    });
  }
  /**
   * Ensure consent exists — if not, prompt the user. Returns true only if consent granted.
   */
  async ensureTranslationConsent(): Promise<boolean> {
    if (this.hasTranslationConsent()) return true;
    const granted = await this.askForTranslationConsent();
    return granted;
  }

  // ✅ NEW: Loading states for translation buttons
  isTranslatingToMy = false;
  isTranslatingToReceiver = false;
  isTranslatingOriginal = false;
  isTranslatingCustom = false; // ✅ NEW: For custom language selection

  translationApiBase =
    // 'https://script.google.com/macros/s/AKfycbyxnbC6LBpbtdMw2rLVqCRvqbHkT97CPQo9Ta9by1QpCMBH25BE6edivkNj5_dYp1qj/exec';
    // 'https://script.google.com/macros/s/AKfycbxpr7MVGsJNzDTZoBWa_IuTd8z5C9ZDfM3iENhuqBN01hgKiU2fF-Hc3DZ1c0u9KzHZ/exec';
    'https://script.google.com/macros/s/AKfycbz069QioIcP8CO2ly7j29cyQPQjzQKywYcrDicxqG35_bQ3Ch_fcuVORsMAdAWu5-uh/exec';
    
  languageMap: Record<string, string> = {
    'ar-EG': 'Arabic (Egypt)',
    'ar-SA': 'Arabic (Saudi Arabia)',
    'bn-BD': 'Bengali (Bangladesh)',
    'de-DE': 'German (Germany)',
    'en-GB': 'English (UK)',
    'en-IN': 'English (India)',
    'en-US': 'English (US)',
    'es-ES': 'Spanish (Spain)',
    'es-MX': 'Spanish (Mexico)',
    'fa-IR': 'Persian (Iran)',
    'fr-FR': 'French (France)',
    'gu-IN': 'Gujarati (India)',
    'hi-IN': 'Hindi (India)',
    'it-IT': 'Italian (Italy)',
    'ja-JP': 'Japanese',
    'ko-KR': 'Korean',
    'mr-IN': 'Marathi (India)',
    'pa-IN': 'Punjabi (India)',
    'pt-BR': 'Portuguese (Brazil)',
    'pt-PT': 'Portuguese (Portugal)',
    'ru-RU': 'Russian',
    'ta-IN': 'Tamil (India)',
    'te-IN': 'Telugu (India)',
    'th-TH': 'Thai',
    'tr-TR': 'Turkish',
    'ur-PK': 'Urdu (Pakistan)',
    'vi-VN': 'Vietnamese',
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
  };

  // ✅ NEW: Get all languages as array for dropdown
  get languagesList() {
    return Object.entries(this.languageMap).map(([code, label]) => ({
      code,
      label,
    }));
  }

  // languageName(code: string): string {
  //   return this.languageMap[code] || code;
  // }

  languageName(code: string): string {
    const full = this.languageMap[code] || code;

    // Remove anything inside parentheses: (India), (Mexico), etc.
    const cleaned = full.replace(/\s*\(.*?\)/g, '');

    return cleaned.trim();
  }

  apiLanguageCode(localeCode: string): string {
    const specialCases: Record<string, string> = {
      'zh-CN': 'zh',
      'zh-TW': 'zh-TW',
      'pt-BR': 'pt',
      'pt-PT': 'pt',
      'en-GB': 'en',
      'en-IN': 'en',
      'es-ES': 'es',
      'es-MX': 'es',
    };

    if (specialCases[localeCode]) {
      return specialCases[localeCode];
    }

    return localeCode.split('-')[0];
  }

  async loadLanguages() {
    try {
      const myLang = localStorage.getItem('app_language');
      this.myLangCode = myLang || this.myLangCode;
      this.myLangLabel = this.languageName(this.myLangCode) || 'My Language';

      const receiverId = this.route.snapshot.queryParamMap.get('receiverId');

      if (receiverId) {
        this.chatService.getUserLanguage(receiverId).subscribe(
          (res) => {
            if (res && res.language) {
              this.receiverLangCode = res.language;
              this.receiverLangLabel =
                this.languageName(res.language) || 'Receiver Language';
              localStorage.setItem('receiverLang', res.language);
            } else {
              console.warn('⚠️ Receiver language not found in API response');
            }
          },
          (err) => {
            console.error('❌ Error fetching receiver language:', err);
          }
        );
      } else {
        const storedReceiverLang = localStorage.getItem('receiverLang');
        this.receiverLangCode = storedReceiverLang || this.receiverLangCode;
        this.receiverLangLabel =
          this.languageName(this.receiverLangCode) || 'Receiver Language';
      }
    } catch (err) {
      console.warn('Failed to load language preferences', err);
    }
  }

  normalizeLocaleCode(code: string): string {
    if (!code) return code;

    const lower = code.trim().toLowerCase();
    const keys = Object.keys(this.languageMap);

    const exactKey = keys.find((k) => k.toLowerCase() === lower);
    if (exactKey) return exactKey;

    const partialKey = keys.find((k) =>
      k.toLowerCase().startsWith(lower + '-')
    );
    if (partialKey) return partialKey;

    const fallbackMap: Record<string, string> = {
      en: 'en-IN',
      hi: 'hi-IN',
      bn: 'bn-BD',
      ta: 'ta-IN',
      te: 'te-IN',
      gu: 'gu-IN',
      mr: 'mr-IN',
      pa: 'pa-IN',
      pt: 'pt-BR',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      ar: 'ar-SA',
      zh: 'zh-CN',
    };
    if (fallbackMap[lower]) return fallbackMap[lower];

    return code;
  }

  // Card state
  translationCard: {
    visible: boolean;
    mode: 'translateCustom' | 'translateToReceiver' | 'sendOriginal' | null;
    items: TranslationItem[];
    createdAt: Date;
  } | null = null;

  parseTranslationResponse(raw: any): string | null {
    let result: string | null = null;

    if (raw == null) {
      return null;
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();

      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.translatedText) {
            result = parsed.translatedText;
          } else if (parsed.data?.translations?.[0]) {
            result = parsed.data.translations[0].translatedText;
          } else if (parsed.text) {
            result = parsed.text;
          } else {
            result = JSON.stringify(parsed);
          }
        } catch {
          result = raw;
        }
      } else {
        result = raw;
      }
    } else if (typeof raw === 'object') {
      if (raw.translatedText) result = raw.translatedText;
      else if (raw.text) result = raw.text;
      else if (raw.data?.translations?.[0])
        result = raw.data.translations[0].translatedText;
      else result = JSON.stringify(raw);
    }

    return result;
  }

  closeTranslationCard() {
    if (this.translationCard) {
      this.translationCard.visible = false;
    }
  }

  messageToggleMap: Map<string, { activeCode: string }> = new Map();

  getAllTranslationsArray(
    msg: any
  ): { code: string; label: string; text: string }[] {
    if (!msg?.translations) return [];
    const arr: { code: string; label: string; text: string }[] = [];

    // Original language (auto-detected, not always English)
    if (msg.translations.original) {
      arr.push({
        code: msg.translations.original.code || 'unknown',
        label: msg.translations.original.label || 'Original',
        text: msg.translations.original.text || '',
      });
    }

    // Other custom language translation
    if (msg.translations.otherLanguage) {
      arr.push({
        code: msg.translations.otherLanguage.code,
        label: msg.translations.otherLanguage.label,
        text: msg.translations.otherLanguage.text || '',
      });
    }

    // Receiver's language translation
    if (msg.translations.receiverLanguage) {
      arr.push({
        code: msg.translations.receiverLanguage.code,
        label: msg.translations.receiverLanguage.label,
        text: msg.translations.receiverLanguage.text || '',
      });
    }

    // Deduplicate by code
    const seen = new Set<string>();
    return arr.filter((item) => {
      if (!item.code) return false;
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    });
  }

  /**
   * Check if message has multiple translations (more than just original)
   */
  hasMultipleTranslations(msg: any): boolean {
    // console.log("this hasMultipleTranslations is called");
    if (!msg?.translations) return false;
    const arr = this.getAllTranslationsArray(msg);
    // console.log("hasMultipleTranslations", arr)
    return arr.length > 1;
  }

  ensureToggleState(msg: any) {
    if (!this.messageToggleMap.has(msg.msgId)) {
      let active = 'original';
      if (msg.translations) {
        const all = this.getAllTranslationsArray(msg);
        const matched = all.find(
          (t) => t.text && (msg.text || '').trim() === t.text.trim()
        );
        if (matched) active = matched.code;
        else if (msg.translations.otherLanguage)
          active = msg.translations.otherLanguage.code;
        else if (msg.translations.receiverLanguage)
          active = msg.translations.receiverLanguage.code;
        else active = msg.translations.original?.code || 'original';
      }
      this.messageToggleMap.set(msg.msgId, { activeCode: active });
    }
  }

  getActiveTranslationLabel(msg: any): string | null {
    if (!msg.translations) return null;
    this.ensureToggleState(msg);
    const st = this.messageToggleMap.get(msg.msgId)!;
    const all = this.getAllTranslationsArray(msg);
    const found = all.find((x) => x.code === st.activeCode);
    return found
      ? found.label
      : st.activeCode === 'original'
      ? 'English (Original)'
      : null;
  }

  getActiveTranslationShortCode(msg: any) {
    this.ensureToggleState(msg);
    const st = this.messageToggleMap.get(msg.msgId)!;
    return st.activeCode;
  }

  isTranslationLabelled(msg: any) {
    this.ensureToggleState(msg);
    const st = this.messageToggleMap.get(msg.msgId)!;
    return st.activeCode !== 'original';
  }

  getDisplayedText(msg: any) {
    this.ensureToggleState(msg);
    const st = this.messageToggleMap.get(msg.msgId)!;
    if (!msg.translations) return msg.text || '';
    const all = this.getAllTranslationsArray(msg);
    const found = all.find((x) => x.code === st.activeCode);
    if (found) return found.text;
    if (st.activeCode === 'original' && msg.translations.original)
      return msg.translations.original.text;
    return msg.text || '';
  }

  cycleTranslation(msg: any) {
    if (!msg.translations) return;
    this.ensureToggleState(msg);
    const st = this.messageToggleMap.get(msg.msgId)!;
    const arr = this.getAllTranslationsArray(msg);
    const codes = arr.map((a) => a.code);
    if (
      msg.translations.original &&
      !codes.includes(msg.translations.original.code || 'original')
    ) {
      codes.push(msg.translations.original.code || 'original');
    }
    const idx = codes.indexOf(st.activeCode);
    const next =
      idx === -1 || idx === codes.length - 1 ? codes[0] : codes[idx + 1];
    st.activeCode = next;
    this.messageToggleMap.set(msg.msgId, st);
  }

  // Removed: setActiveTranslation, toggleShowAllTranslations, isShowingAllTranslations, copyToClipboard
  // These are no longer needed with the simplified bubble

  /**
   * ✅ NEW: Handle language selection from dropdown
   */
  async onSelectTranslateLanguage(event: any) {
    const selectedLang = event.detail.value;
    if (!selectedLang) return;

    const text = this.messageText?.trim();
    if (!text) {
      this.showToast('Type something to translate', 'warning');
      return;
    }

    const allowed = await this.ensureTranslationConsent();
    if (!allowed) return;

    this.isTranslatingCustom = true;

    const targetApiLang = this.apiLanguageCode(selectedLang.code);

    await this.fetchCustomTranslation(
      'translateCustom',
      text,
      selectedLang.code,
      selectedLang.label,
      targetApiLang
    );
  }

  /**
   * ✅ UPDATED: Fetch custom language translation + receiver language (parallel)
   */
  async fetchCustomTranslation(
    mode: 'translateCustom',
    originalText: string,
    targetCode: string,
    targetLabel: string,
    targetApiLang: string
  ) {
    const recvApiLang = this.apiLanguageCode(this.receiverLangCode);

    const promises: Promise<any>[] = [];

    // ✅ Fetch custom language translation
    const customParams = new HttpParams()
      .set('text', originalText)
      .set('to', targetApiLang);

    promises.push(
      this.http
        .get(this.translationApiBase, {
          params: customParams,
          responseType: 'json',
        })
        .toPromise()
    );

    // ✅ Fetch receiver language translation (if different from custom selected)
    if (recvApiLang !== targetApiLang) {
      const recvParams = new HttpParams()
        .set('text', originalText)
        .set('to', recvApiLang);

      promises.push(
        this.http
          .get(this.translationApiBase, {
            params: recvParams,
            responseType: 'json',
          })
          .toPromise()
      );
    }

    try {
      const results = await Promise.all(promises);

      const customResponse = results[0];
      const receiverResponse = results[1]; // undefined if same language

      if (customResponse?.success && customResponse.translatedText) {
        const detectedLang = customResponse.detectedSource || 'unknown';
        const detectedLabel =
          this.languageName(this.normalizeLocaleCode(detectedLang)) ||
          detectedLang;

        let receiverTranslation = null;
        if (receiverResponse?.success && receiverResponse.translatedText) {
          receiverTranslation = receiverResponse.translatedText;
        }

        this.showCustomTranslationCard(
          mode,
          originalText,
          targetCode,
          targetLabel,
          customResponse.translatedText,
          detectedLang,
          detectedLabel,
          receiverTranslation
        );
      } else {
        this.showToast('Translation failed', 'warning');
      }

      this.isTranslatingCustom = false;
    } catch (err) {
      console.error('Translation error', err);
      this.showToast('Translation failed', 'danger');
      this.isTranslatingCustom = false;
    }
  }


  // ========================================
  // 🎨 SHOW CUSTOM TRANSLATION CARD
  // ========================================

  showCustomTranslationCard(
    mode: 'translateCustom',
    originalText: string,
    targetCode: string,
    targetLabel: string,
    translation: string,
    detectedSourceCode?: string,
    detectedSourceLabel?: string,
    receiverTranslation?: string | null
  ) {
    const items: TranslationItem[] = [];

    // [0] Add detected source language (original)
    if (detectedSourceCode) {
      items.push({
        code: detectedSourceCode,
        label: detectedSourceLabel || 'Original',
        text: originalText,
      });
    }

    // [1] Add custom selected language translation
    items.push({
      code: targetCode,
      label: targetLabel,
      text: translation,
    });

    // [2] Add receiver language translation (if available and different from custom)
    if (receiverTranslation && targetCode !== this.receiverLangCode) {
      items.push({
        code: this.receiverLangCode,
        label: this.languageName(this.receiverLangCode) + ' (Receiver)',
        text: receiverTranslation,
      });
    }

    this.translationCard = {
      visible: true,
      mode,
      items,
      createdAt: new Date(),
    };

    this.showToast('Translation ready', 'success');
    try {
      this.cdr.detectChanges();
    } catch {}
  }

  /**
   * UPDATED: Translate to Receiver
   */
  async translateTo(target: 'receiver') {
    const text = this.messageText?.trim();
    if (!text) {
      this.showToast('Type something to translate', 'warning');
      return;
    }

    const allowed = await this.ensureTranslationConsent();
    if (!allowed) return;

    this.isTranslatingToReceiver = true;

    const recvApiLang = this.apiLanguageCode(this.receiverLangCode);

    await this.fetchReceiverTranslationOnly(
      'translateToReceiver',
      text,
      recvApiLang
    );
  }

  /**
   * Fetch ONLY receiver translation (with auto-detect)
   */
  async fetchReceiverTranslationOnly(
    mode: 'translateToReceiver',
    originalText: string,
    recvApiLang: string
  ) {
    // ✅ Auto-detect source language
    const params = new HttpParams()
      .set('text', originalText)
      .set('to', recvApiLang);

    this.http
      .get(this.translationApiBase, { params, responseType: 'json' })
      .subscribe({
        next: (response: any) => {
          if (response.success && response.translatedText) {
            const detectedLang = response.detectedSource || 'unknown';
            const detectedLabel =
              this.languageName(this.normalizeLocaleCode(detectedLang)) ||
              detectedLang;

            this.showReceiverOnlyCard(
              mode,
              originalText,
              response.translatedText,
              detectedLang,
              detectedLabel
            );
          } else {
            this.showToast('Translation failed', 'warning');
          }

          this.isTranslatingToReceiver = false;
        },
        error: (err) => {
          console.error('Translation error', err);
          this.showToast('Translation failed', 'danger');
          this.isTranslatingToReceiver = false;
        },
      });
  }

  // ========================================
  // 🎨 SHOW RECEIVER ONLY CARD
  // ========================================

  showReceiverOnlyCard(
    mode: 'translateToReceiver',
    originalText: string,
    receiverTranslation: string,
    detectedSourceCode?: string,
    detectedSourceLabel?: string
  ) {
    const items: TranslationItem[] = [];

    // [0] Add detected source language (original)
    if (detectedSourceCode) {
      items.push({
        code: detectedSourceCode,
        label: detectedSourceLabel || 'Original',
        text: originalText,
      });
    }

    // [1] Add Receiver Language
    items.push({
      code: this.receiverLangCode,
      label: this.languageName(this.receiverLangCode) + ' (Receiver)',
      text: receiverTranslation,
    });

    this.translationCard = {
      visible: true,
      mode,
      items,
      createdAt: new Date(),
    };

    this.showToast('Translation ready', 'success');
    try {
      this.cdr.detectChanges();
    } catch {}
  }

  // ========================================
  // 🎨 SHOW SEND ORIGINAL CARD
  // ========================================

  showSendOriginalCard(
    originalText: string,
    receiverTranslation: string,
    detectedSourceCode: string,
    detectedSourceLabel: string
  ) {
    const items: TranslationItem[] = [
      // [0] Original
      {
        code: detectedSourceCode,
        label: detectedSourceLabel + ' (Original)',
        text: originalText,
      },
      // [1] Receiver will see
      {
        code: this.receiverLangCode,
        label:
          this.languageName(this.receiverLangCode) + ' (Receiver will see)',
        text: receiverTranslation,
      },
    ];

    this.translationCard = {
      visible: true,
      mode: 'sendOriginal',
      items,
      createdAt: new Date(),
    };

    this.showToast('Preview ready', 'success');
    try {
      this.cdr.detectChanges();
    } catch {}
  }

  // ========================================
  // 🔧 HELPER: CLOSE TRANSLATION CARD
  // ========================================

  // closeTranslationCard() {
  //   if (this.translationCard) {
  //     this.translationCard.visible = false;
  //     this.translationCard = null;
  //   }
  // }

  /**
   * Send Original with auto-translation (with auto-detect)
   */
  async sendOriginalWithTranslation() {
    const text = this.messageText?.trim();
    if (!text) {
      this.showToast('Type something to send', 'warning');
      return;
    }

    const allowed = await this.ensureTranslationConsent();
    if (!allowed) return;

    this.isTranslatingOriginal = true;

    const recvApiLang = this.apiLanguageCode(this.receiverLangCode);

    // ✅ Auto-detect source language
    const params = new HttpParams().set('text', text).set('to', recvApiLang);

    this.http
      .get(this.translationApiBase, { params, responseType: 'json' })
      .subscribe({
        next: (response: any) => {
          if (response.success && response.translatedText) {
            const detectedLang = response.detectedSource || 'unknown';
            const detectedLabel =
              this.languageName(this.normalizeLocaleCode(detectedLang)) ||
              detectedLang;

            const items: TranslationItem[] = [
              {
                code: detectedLang,
                label: detectedLabel + ' (Original)',
                text: text,
              },
              {
                code: this.receiverLangCode,
                label:
                  this.languageName(this.receiverLangCode) +
                  ' (Receiver will see)',
                text: response.translatedText,
              },
            ];

            this.translationCard = {
              visible: true,
              mode: 'sendOriginal',
              items,
              createdAt: new Date(),
            };

            this.showToast('Preview ready', 'success');
          } else {
            this.showToast('Translation failed', 'warning');
          }

          this.isTranslatingOriginal = false;
        },
        error: (err) => {
          console.error('Translation error', err);
          this.showToast('Translation failed', 'danger');
          this.isTranslatingOriginal = false;
        },
      });
  }


  async sendFromTranslationCard() {
    if (!this.translationCard) return;

    console.log('📋 Translation Card:', this.translationCard);

    const mode = this.translationCard.mode;
    const items = this.translationCard.items || [];
    const originalText = this.messageText?.trim() || '';
    const now = Date.now();

    // ✅ FIXED: Identify items by array position (reliable & predictable)
    // Array structure based on mode:
    // - translateCustom:    [0]=Original, [1]=Custom, [2]=Receiver (if different)
    // - translateToReceiver: [0]=Original, [1]=Receiver
    // - sendOriginal:        [0]=Original, [1]=Receiver

    const originalItem = items[0]; // First item is always the detected source

    let customItem: TranslationItem | null = null;
    let receiverItem: TranslationItem | null = null;

    // Determine which items are custom vs receiver based on mode
    if (mode === 'translateCustom') {
      // Custom translation mode
      if (items.length === 3) {
        // We have: Original, Custom, Receiver
        customItem = items[1];
        receiverItem = items[2];
      } else if (items.length === 2) {
        // We have: Original, and one translation
        // Check if it's the receiver language or custom
        if (items[1]?.code === this.receiverLangCode) {
          // User selected receiver language as custom = treat as receiver only
          receiverItem = items[1];
          customItem = null;
        } else {
          // User selected different language = custom without receiver
          customItem = items[1];
          receiverItem = null;
        }
      }
    } else if (mode === 'translateToReceiver') {
      // Direct to receiver mode: only receiver translation
      receiverItem = items[1];
    } else if (mode === 'sendOriginal') {
      // Send original with receiver preview
      receiverItem = items[1];
    }

    // ✅ Build translations payload
    const translationsPayload: MessageTranslations = {
      original: {
        code: originalItem?.code || 'unknown',
        label: originalItem?.label || 'Original',
        text: originalItem?.text || originalText,
      },
    };

    let visibleTextForSender: string = originalText;

    // Set payload based on mode
    if (mode === 'translateCustom') {
      // Custom language translation - sender sees custom translation
      if (customItem) {
        translationsPayload.otherLanguage = {
          code: customItem.code,
          label: customItem.label,
          text: customItem.text,
        };
        visibleTextForSender = customItem.text;
      }

      // Also include receiver translation if available
      if (receiverItem) {
        translationsPayload.receiverLanguage = {
          code: receiverItem.code,
          label: receiverItem.label,
          text: receiverItem.text,
        };
      }
    } else if (mode === 'translateToReceiver') {
      // Receiver translation - sender sees receiver translation
      if (receiverItem) {
        translationsPayload.receiverLanguage = {
          code: receiverItem.code,
          label: receiverItem.label,
          text: receiverItem.text,
        };
        visibleTextForSender = receiverItem.text;
      }
    } else if (mode === 'sendOriginal') {
      // Original with receiver translation - sender sees original
      visibleTextForSender = originalText;

      if (receiverItem) {
        translationsPayload.receiverLanguage = {
          code: receiverItem.code,
          label: receiverItem.label,
          text: receiverItem.text,
        };
      }
    }
    const msgId = uuidv4();
    const timestamp = Date.now();

    // ✅ Build final message
    const localMessage: Partial<IMessage & { attachment?: any }> = {
      sender: this.senderId,
      sender_name : this.sender_name,
      text: visibleTextForSender,
      receiver_id : this.receiverId,
      translations: translationsPayload,
      timestamp,
      msgId,
      replyToMsgId: this.replyTo?.message.msgId || '',
      isEdit: false,
      isPinned: false,
      type: 'text',
      reactions: [],
    };

    console.log('✅ Local Message:djkfsllllllllllllllllllllllll', localMessage);

    // Send message
    await this.chatService.sendMessage(localMessage);

    // Reset state
    this.messageText = '';
    this.translationCard.visible = false;
    this.translationCard = null;
    this.showSendButton = false;
    this.replyToMessage = null;

    this.showToast('Message sent', 'success');

    try {
      this.stopTypingSignal();
      this.scrollToBottom();
    } catch {}
  }

  async sendDirectMessage(senderText: string, receiverText: string) {
    const now = Date.now();

    const translationsPayload: IMessage['translations'] = {
      original: {
        code: 'en',
        label: 'English (Original)',
        text: this.messageText?.trim() || '',
      },
    };

    if (receiverText !== this.messageText) {
      translationsPayload.receiverLanguage = {
        code: this.receiverLangCode,
        label: this.languageName(this.receiverLangCode),
        text: receiverText,
      };
    }

    const localMessage: Partial<IMessage & { attachment?: any }> = {
      sender: this.senderId,
      text: senderText,
      translations: translationsPayload,
      timestamp: now,
      msgId: uuidv4(),
      replyToMsgId: this.replyTo?.message.msgId || '',
      isEdit: false,
      isPinned: false,
      type: 'text',
      reactions: [],
    };

    await this.chatService.sendMessage(localMessage);

    this.messageText = '';
    this.showSendButton = false;
    this.showToast('Message sent', 'success');
  }

  async showToast(
    message: string,
    color: string = 'medium',
    duration: number = 2000,
    position: 'top' | 'middle' | 'bottom' = 'bottom'
  ) {
    const toast = await this.toastController.create({
      message: message,
      duration: duration,
      color: color,
      position: position,
      buttons: [
        {
          text: 'Dismiss',
          role: 'cancel',
        },
      ],
    });

    await toast.present();
  }

  async showToastSimple(
    message: string,
    color: string = 'medium',
    duration: number = 1500
  ) {
    const toast = await this.toastController.create({
      message: message,
      duration: duration,
      color: color,
      position: 'bottom',
    });

    await toast.present();
  }

  async showToastWithIcon(
    message: string,
    color: string = 'success',
    icon: string = 'checkmark-circle'
  ) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      color: color,
      position: 'bottom',
      icon: icon,
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
    });

    await toast.present();
  }
}
