import { Injectable } from '@angular/core';
import {
  Database,
  ref,
  push,
  onValue,
  set,
  get,
  child,
  runTransaction,
} from '@angular/fire/database';
import {
  ref as rtdbRef,
  update as rtdbUpdate,
  set as rtdbSet,
  get as rtdbGet,
  DataSnapshot,
  onValue as rtdbOnValue,
  query,
  orderByKey,
  startAt,
  limitToLast,
  onChildAdded,
  onChildRemoved,
  onChildChanged,
  off,
  orderByChild,
  onDisconnect,
} from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { runTransaction as rtdbRunTransaction } from 'firebase/database';
import {
  BehaviorSubject,
  catchError,
  debounceTime,
  firstValueFrom,
  map,
  Observable,
  of,
  retry,
  take,
} from 'rxjs';
import { getDatabase, remove, update } from 'firebase/database';
import { IChat, IChatMeta, Message, PinnedMessage } from 'src/types';
import { ApiService } from './api/api.service';
import {
  IAttachment,
  ICommunity,
  ICommunityChatMeta,
  ICommunityMember,
  IConversation,
  IGroup,
  IGroupMember,
  IMessage,
  IUser,
  SqliteService,
} from './sqlite.service';
import { ContactSyncService } from './contact-sync.service';
import { IonCard, Platform } from '@ionic/angular';
import { NetworkService } from './network-connection/network.service';
import { EncryptionService } from './encryption.service';
import { AuthService } from '../auth/auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CacheService } from './cache.service';
import { FileSystemService } from './file-system.service';
// import isEqual from 'lodash.isequal';

const CACHE_PREFIX = 'firebase_chat_';
const K_CONVERSATIONS = CACHE_PREFIX + 'conversations_v1';
const K_PLATFORM_USERS = CACHE_PREFIX + 'platformUsers_v1';
const K_DEVICE_CONTACTS = CACHE_PREFIX + 'deviceContacts_v1';
const K_OFFSETS = CACHE_PREFIX + 'offsets_v1';
const K_PRESENCE = CACHE_PREFIX + 'presence_v1';
const K_TYPING = CACHE_PREFIX + 'typing_v1';

// messages: we will store per-room under messages_room_{roomId}_v1 and keep track of rooms in messages_rooms_v1
const K_MESSAGES_ROOMS = CACHE_PREFIX + 'message_rooms_v1';
const K_MESSAGES_ROOM_PREFIX = CACHE_PREFIX + 'messages_room_'; // + ${roomId}_v1

interface MemberPresence {
  isOnline: boolean;
  lastSeen: number | null;
  isTyping?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FirebaseChatService {
  // =====================
  // ======= DATA ========
  // =====================
  isAppInitialized: boolean = false;
  private senderId: string | null = null;
  private forwardMessages: any[] = [];
  private _selectedMessageInfo: any = null;
  private _selectedAttachment: any = null;
  private _conversations$ = new BehaviorSubject<IConversation[]>([]);
  private _platformUsers$ = new BehaviorSubject<Partial<IUser>[]>([]);
  platformUsers$ = this._platformUsers$.asObservable();
  private _deviceContacts$ = new BehaviorSubject<
    { username: string; phoneNumber: string }[]
  >([]);
  deviceContacts$ = this._deviceContacts$.asObservable();
  private _isSyncing$ = new BehaviorSubject<boolean>(false);
  isSyncing$ = this._isSyncing$.asObservable();
  private _offsets$ = new BehaviorSubject<Map<string, number>>(new Map());
  private _messages$ = new BehaviorSubject<Map<string, IMessage[]>>(new Map());
  private _totalMessages: number = 0;

  private _userChatsListener: (() => void) | null = null;
  // 🟢 Map of userId → { isOnline, lastSeen }
  private membersPresence: Map<string, MemberPresence> = new Map();

  // 🟢 Map of userId → unsubscribe function for presence listener
  private _memberUnsubs: Map<string, () => void> = new Map();
  private _roomMessageListner: any = null;

  currentChat: IConversation | null = null;

  private _presenceSubject$ = new BehaviorSubject<Map<string, MemberPresence>>(
    new Map()
  );
  presenceChanges$ = this._presenceSubject$.asObservable();

  private _typingStatus$ = new BehaviorSubject<Map<string, boolean>>(new Map());
  typingStatus$ = this._typingStatus$.asObservable();

  private lastSavedSnapshots = {
    conversations: null as any | null,
    platformUsers: null as any | null,
    deviceContacts: null as any | null,
    offsets: null as any | null,
    presence: null as any | null,
    typing: null as any | null,
  };

  constructor(
    private cache: CacheService,
    private db: Database,
    private service: ApiService,
    private sqliteService: SqliteService,
    private contactsyncService: ContactSyncService,
    private platform: Platform,
    private apiService: ApiService,
    private networkService: NetworkService,
    private encryptionService: EncryptionService,
    private authService: AuthService,
    private http: HttpClient,
    private fileSystemService: FileSystemService
  ) {
    // this.init();
  }

  // 🔹 Lightweight deep equality check (replacement for lodash.isEqual)
  // private isEqual(a: any, b: any): boolean {
  //   // Quick identical check
  //   if (a === b) return true;

  //   // Handle null / undefined
  //   if (a == null || b == null) return false;

  //   // Handle primitive types
  //   if (typeof a !== 'object' || typeof b !== 'object') return false;

  //   // Arrays
  //   if (Array.isArray(a) && Array.isArray(b)) {
  //     if (a.length !== b.length) return false;
  //     for (let i = 0; i < a.length; i++) {
  //       if (!this.isEqual(a[i], b[i])) return false;
  //     }
  //     return true;
  //   }

  //   // Objects
  //   const aKeys = Object.keys(a);
  //   const bKeys = Object.keys(b);
  //   if (aKeys.length !== bKeys.length) return false;

  //   for (const key of aKeys) {
  //     if (!b.hasOwnProperty(key)) return false;
  //     if (!this.isEqual(a[key], b[key])) return false;
  //   }

  //   return true;
  // }

  // /**
  //  * Public init - await this in APP_INITIALIZER to ensure hydration completes before app bootstrap
  //  */
  // public async init(): Promise<void> {
  //   // wait for cache ready
  //   await this.cache.ready;
  //   await this.hydrateFromCache();
  //   this.setupAutoPersist();
  // }

  // // ---------- Serialization helpers ----------
  // private mapToObject<T>(m: Map<string, T>): Record<string, T> {
  //   const obj: Record<string, T> = {};
  //   m.forEach((v, k) => (obj[k] = v));
  //   return obj;
  // }

  // private objectToMap<T>(obj: Record<string, T> | null): Map<string, T> {
  //   const m = new Map<string, T>();
  //   if (!obj) return m;
  //   Object.keys(obj).forEach((k) => m.set(k, obj[k]));
  //   return m;
  // }

  // // ---------- Hydration ----------
  // private async hydrateFromCache(): Promise<void> {
  //   try {
  //     // conversations
  //     const convs = await this.cache.get<any[]>(K_CONVERSATIONS);
  //     if (convs) {
  //       this._conversations$.next(convs);
  //       this.lastSavedSnapshots.conversations = convs;
  //     }

  //     // platform users
  //     const pUsers = await this.cache.get<Partial<any>[]>(K_PLATFORM_USERS);
  //     if (pUsers) {
  //       this._platformUsers$.next(pUsers);
  //       this.lastSavedSnapshots.platformUsers = pUsers;
  //     }

  //     // device contacts
  //     const dContacts = await this.cache.get<
  //       { username: string; phoneNumber: string }[]
  //     >(K_DEVICE_CONTACTS);
  //     if (dContacts) {
  //       this._deviceContacts$.next(dContacts);
  //       this.lastSavedSnapshots.deviceContacts = dContacts;
  //     }

  //     // offsets (stored as plain object)
  //     const offsetsObj = await this.cache.get<Record<string, number>>(
  //       K_OFFSETS
  //     );
  //     if (offsetsObj) {
  //       this._offsets$.next(this.objectToMap<number>(offsetsObj));
  //       this.lastSavedSnapshots.offsets = offsetsObj;
  //     }

  //     // presence
  //     const presenceObj = await this.cache.get<Record<string, any>>(K_PRESENCE);
  //     if (presenceObj) {
  //       this._presenceSubject$.next(this.objectToMap<any>(presenceObj));
  //       this.lastSavedSnapshots.presence = presenceObj;
  //     }

  //     // typing
  //     const typingObj = await this.cache.get<Record<string, boolean>>(K_TYPING);
  //     if (typingObj) {
  //       this._typingStatus$.next(this.objectToMap<boolean>(typingObj));
  //       this.lastSavedSnapshots.typing = typingObj;
  //     }

  //     // scalar values
  //     const sender = await this.cache.get<string>(CACHE_PREFIX + 'senderId_v1');
  //     if (sender) this.senderId = sender;

  //     const forwardMsgs = await this.cache.get<any[]>(
  //       CACHE_PREFIX + 'forwardMsgs_v1'
  //     );
  //     if (forwardMsgs) this.forwardMessages = forwardMsgs;

  //     const initialized = await this.cache.get<boolean>(
  //       CACHE_PREFIX + 'isAppInitialized_v1'
  //     );
  //     if (typeof initialized === 'boolean') this.isAppInitialized = initialized;

  //     // messages (per-room). load list of rooms and hydrate each room's messages
  //     const rooms = await this.cache.get<string[]>(K_MESSAGES_ROOMS);
  //     if (rooms && rooms.length) {
  //       const map = new Map<string, any[]>();
  //       for (const roomId of rooms) {
  //         const roomKey = `${K_MESSAGES_ROOM_PREFIX}${roomId}_v1`;
  //         const msgs = await this.cache.get<any[]>(roomKey);
  //         if (msgs) map.set(roomId, msgs);
  //       }
  //       this._messages$.next(map);
  //     }
  //   } catch (e) {
  //     console.warn('hydrateFromCache error', e);
  //   }
  // }

  // // ---------- Auto-persist setup (MobX-like autorun) ----------
  // private setupAutoPersist(): void {
  //   // Conversations
  //   this._conversations$.pipe(debounceTime(300)).subscribe(async (val) => {
  //     if (
  //       this.lastSavedSnapshots.conversations &&
  //       this.isEqual(this.lastSavedSnapshots.conversations, val)
  //     )
  //       return;
  //     try {
  //       await this.cache.set(K_CONVERSATIONS, val);
  //       this.lastSavedSnapshots.conversations = JSON.parse(JSON.stringify(val));
  //     } catch (e) {
  //       console.error(e);
  //     }
  //   });

  //   // Platform Users
  //   this._platformUsers$.pipe(debounceTime(300)).subscribe(async (val) => {
  //     if (
  //       this.lastSavedSnapshots.platformUsers &&
  //       this.isEqual(this.lastSavedSnapshots.platformUsers, val)
  //     )
  //       return;
  //     try {
  //       await this.cache.set(K_PLATFORM_USERS, val);
  //       this.lastSavedSnapshots.platformUsers = JSON.parse(JSON.stringify(val));
  //     } catch (e) {
  //       console.error(e);
  //     }
  //   });

  //   // Device Contacts
  //   this._deviceContacts$.pipe(debounceTime(300)).subscribe(async (val) => {
  //     if (
  //       this.lastSavedSnapshots.deviceContacts &&
  //       this.isEqual(this.lastSavedSnapshots.deviceContacts, val)
  //     )
  //       return;
  //     try {
  //       await this.cache.set(K_DEVICE_CONTACTS, val);
  //       this.lastSavedSnapshots.deviceContacts = JSON.parse(
  //         JSON.stringify(val)
  //       );
  //     } catch (e) {
  //       console.error(e);
  //     }
  //   });

  //   // Offsets (Map -> object)
  //   this._offsets$.pipe(debounceTime(300)).subscribe(async (m) => {
  //     const obj = this.mapToObject<number>(m);
  //     if (
  //       this.lastSavedSnapshots.offsets &&
  //       this.isEqual(this.lastSavedSnapshots.offsets, obj)
  //     )
  //       return;
  //     try {
  //       await this.cache.set(K_OFFSETS, obj);
  //       this.lastSavedSnapshots.offsets = { ...obj };
  //     } catch (e) {
  //       console.error(e);
  //     }
  //   });

  //   // Presence
  //   this._presenceSubject$.pipe(debounceTime(300)).subscribe(async (m) => {
  //     const obj = this.mapToObject<any>(m);
  //     if (
  //       this.lastSavedSnapshots.presence &&
  //       this.isEqual(this.lastSavedSnapshots.presence, obj)
  //     )
  //       return;
  //     try {
  //       await this.cache.set(K_PRESENCE, obj);
  //       this.lastSavedSnapshots.presence = { ...obj };
  //     } catch (e) {
  //       console.error(e);
  //     }
  //   });

  //   // Typing status
  //   this._typingStatus$.pipe(debounceTime(200)).subscribe(async (m) => {
  //     const obj = this.mapToObject<boolean>(m);
  //     if (
  //       this.lastSavedSnapshots.typing &&
  //       this.isEqual(this.lastSavedSnapshots.typing, obj)
  //     )
  //       return;
  //     try {
  //       await this.cache.set(K_TYPING, obj);
  //       this.lastSavedSnapshots.typing = { ...obj };
  //     } catch (e) {
  //       console.error(e);
  //     }
  //   });

  //   this._messages$
  //     .pipe(debounceTime(500)) // slightly longer debounce for messages
  //     .subscribe(async (messagesMap) => {
  //       try {
  //         const currentRooms = Array.from(messagesMap.keys());

  //         // Persist each room's messages
  //         for (const roomId of currentRooms) {
  //           const msgs = messagesMap.get(roomId) || [];
  //           const key = `${K_MESSAGES_ROOM_PREFIX}${roomId}_v1`;

  //           // Check if this room's messages changed
  //           const cachedMsgs = await this.cache.get<IMessage[]>(key);
  //           if (!this.isEqual(cachedMsgs, msgs)) {
  //             await this.cache.set(key, msgs);
  //           }
  //         }

  //         // Update the rooms list
  //         await this.cache.set(K_MESSAGES_ROOMS, currentRooms);
  //       } catch (e) {
  //         console.error('Error auto-persisting messages:', e);
  //       }
  //     });

  //   // _messages$ is persisted per-room using helper functions, not entire map here.
  //   // But we keep the BehaviorSubject in memory and persist changes via persistRoomMessages when a room changes.
  // }

  // // ---------- Per-room message persistence helpers ----------
  // // store only the room passed (reduces write size)
  // public async persistRoomMessages(roomId: string): Promise<void> {
  //   try {
  //     const messagesMap = this._messages$.value;
  //     const msgs = messagesMap.get(roomId) || [];
  //     const key = `${K_MESSAGES_ROOM_PREFIX}${roomId}_v1`;
  //     await this.cache.set(key, msgs);

  //     // maintain list of roomIds
  //     let rooms = (await this.cache.get<string[]>(K_MESSAGES_ROOMS)) || [];
  //     if (!rooms.includes(roomId)) {
  //       rooms = [...rooms, roomId];
  //       await this.cache.set(K_MESSAGES_ROOMS, rooms);
  //     }
  //   } catch (e) {
  //     console.error('persistRoomMessages error', e);
  //   }
  // }

  // // delete cached messages for a room
  // public async clearRoomMessages(roomId: string): Promise<void> {
  //   try {
  //     const key = `${K_MESSAGES_ROOM_PREFIX}${roomId}_v1`;
  //     await this.cache.clear(key);
  //     // remove from rooms list
  //     const rooms = (await this.cache.get<string[]>(K_MESSAGES_ROOMS)) || [];
  //     const newRooms = rooms.filter((r) => r !== roomId);
  //     await this.cache.set(K_MESSAGES_ROOMS, newRooms);
  //     // also remove from in-memory map
  //     const map = new Map(this._messages$.value);
  //     map.delete(roomId);
  //     this._messages$.next(map);
  //   } catch (e) {
  //     console.error(e);
  //   }
  // }

  // // call this to update messages in memory and persist only that room
  // public async updateRoomMessages(
  //   roomId: string,
  //   messages: any[]
  // ): Promise<void> {
  //   const map = new Map(this._messages$.value);
  //   map.set(roomId, messages);
  //   this._messages$.next(map);
  //   // persist
  //   await this.persistRoomMessages(roomId);
  // }

  // // ---------- Other scalar helpers ----------
  // public async setSenderId(id: string) {
  //   this.senderId = id;
  //   await this.cache.set(CACHE_PREFIX + 'senderId_v1', id);
  // }

  // public async setForwardMessages(list: any[]) {
  //   this.forwardMessages = list;
  //   await this.cache.set(CACHE_PREFIX + 'forwardMsgs_v1', list);
  // }

  // public async setAppInitialized(flag: boolean) {
  //   this.isAppInitialized = flag;
  //   await this.cache.set(CACHE_PREFIX + 'isAppInitialized_v1', flag);
  // }

  // // ---------- Clear / migrate ----------
  // public async clearAllCache(): Promise<void> {
  //   const keysToClear = [
  //     K_CONVERSATIONS,
  //     K_PLATFORM_USERS,
  //     K_DEVICE_CONTACTS,
  //     K_OFFSETS,
  //     K_PRESENCE,
  //     K_TYPING,
  //     K_MESSAGES_ROOMS,
  //     // plus per-room keys: get rooms and clear them
  //   ];
  //   // clear per-room
  //   const rooms = (await this.cache.get<string[]>(K_MESSAGES_ROOMS)) || [];
  //   for (const r of rooms) {
  //     await this.cache.clear(`${K_MESSAGES_ROOM_PREFIX}${r}_v1`);
  //   }
  //   // clear listed keys
  //   for (const k of keysToClear) {
  //     await this.cache.clear(k);
  //   }
  // }

  // public async logCacheContents() {
  //   console.log('=== 🔍 Firebase Chat Cache Contents ===');

  //   // Simple keys
  //   const conversations = await this.cache.get<any>(
  //     'firebase_chat_conversations_v1'
  //   );
  //   const platformUsers = await this.cache.get<any>(
  //     'firebase_chat_platformUsers_v1'
  //   );
  //   const deviceContacts = await this.cache.get<any>(
  //     'firebase_chat_deviceContacts_v1'
  //   );
  //   const offsets = await this.cache.get<any>('firebase_chat_offsets_v1');
  //   const presence = await this.cache.get<any>('firebase_chat_presence_v1');
  //   const typing = await this.cache.get<any>('firebase_chat_typing_v1');
  //   const senderId = await this.cache.get<any>('firebase_chat_senderId_v1');
  //   const forwardMsgs = await this.cache.get<any>(
  //     'firebase_chat_forwardMsgs_v1'
  //   );
  //   const isAppInit = await this.cache.get<any>(
  //     'firebase_chat_isAppInitialized_v1'
  //   );
  //   const rooms = await this.cache.get<string[]>(
  //     'firebase_chat_message_rooms_v1'
  //   );

  //   // console.log('🗂️ Conversations:', conversations);
  //   // console.log('👥 Platform Users:', platformUsers);
  //   // console.log('📱 Device Contacts:', deviceContacts);
  //   // console.log('📜 Offsets:', offsets);
  //   // console.log('🟢 Presence:', presence);
  //   // console.log('⌨️ Typing:', typing);
  //   // console.log('📤 SenderId:', senderId);
  //   // console.log('📦 Forward Messages:', forwardMsgs);
  //   // console.log('🚀 Is App Initialized:', isAppInit);
  //   // console.log('💬 Cached Rooms:', rooms);

  //   // Per-room messages
  //   if (rooms && rooms.length) {
  //     for (const roomId of rooms) {
  //       const roomKey = `firebase_chat_messages_room_${roomId}_v1`;
  //       const msgs = await this.cache.get<any[]>(roomKey);
  //       console.log(
  //         `💬 Messages for Room [${roomId}] →`,
  //         msgs?.length || 0,
  //         'messages'
  //       );
  //     }
  //   }

  //   console.log('=== ✅ End of Cache Dump ===');
  // }

  private isWeb(): boolean {
    return !(
      this.platform.is('android') ||
      this.platform.is('ios') ||
      this.platform.is('ipad') ||
      this.platform.is('iphone')
    );
  }

  private baseUrl = 'https://apps.ekarigar.com/backend/api/users';

  get conversations() {
    return this._conversations$
      .asObservable()
      .pipe(
        map((convs) =>
          convs.sort(
            (b, a) =>
              Number(a.lastMessageAt || 0) - Number(b.lastMessageAt || 0)
          )
        )
      );
  }

  get currentConversations(): IConversation[] {
    return this._conversations$.value;
  }

  get currentUsers(): Partial<IUser>[] {
    return this._platformUsers$.value;
  }

  get currentDeviceContacts(): any[] {
    return this._deviceContacts$.value;
  }

  pushMsgToChat(msg: any) {
    try {
      console.log('message attachment this is from pushmsgtochat', msg);
      const existing = new Map(this._messages$?.value || []);
      const currentMessages =
        existing.get(this.currentChat?.roomId as string) || [];
      const messageIdSet = new Set(currentMessages.map((m) => m.msgId));
      if (messageIdSet.has(msg.msgId)) return;
      currentMessages?.push({
        ...msg,
        attachment: msg.attachment
          ? {
              ...msg.attachment,
              cdnUrl: msg.attachment.cdnUrl.replace(/[?#].*$/, ''),
            }
          : null,
        isMe: msg.sender === this.senderId,
      });
      existing.set(
        this.currentChat?.roomId as string,
        currentMessages as IMessage[]
      );

      console.log({ currentMessages });
      // return
      this._messages$.next(existing);
    } catch (error) {
      console.error('not loads pushmsgTochat', error);
    }
  }

  getRoomIdFor1To1(senderId: string, receiverId: string): string {
    return senderId < receiverId
      ? `${senderId}_${receiverId}`
      : `${receiverId}_${senderId}`;
  }

  private presenceCleanUp: any = null;

  listenToTypingStatus(roomId: string, userId: string): () => void {
    const typingRef = ref(this.db, `typing/${roomId}/${userId}`);

    const unsubscribe = onValue(typingRef, (snap) => {
      const isTyping = snap.val() || false;

      // Update the membersPresence map with typing status
      const currentPresence = this.membersPresence.get(userId);
      if (currentPresence) {
        this.membersPresence.set(userId, {
          ...currentPresence,
          isTyping,
        });
      } else {
        this.membersPresence.set(userId, {
          isOnline: false,
          lastSeen: null,
          isTyping,
        });
      }

      // Also update the typing status map
      const current = new Map(this._typingStatus$.value);
      current.set(userId, isTyping);
      this._typingStatus$.next(current);

      // Emit presence update
      this._presenceSubject$.next(new Map(this.membersPresence));
    });

    return unsubscribe;
  }

  // 🆕 Method to set your own typing status
  setTypingStatus(isTyping: boolean, roomId?: string) {
    const targetRoomId = roomId || this.currentChat?.roomId;
    if (!targetRoomId || !this.senderId) return;

    const typingRef = ref(this.db, `typing/${targetRoomId}/${this.senderId}`);
    set(typingRef, isTyping);

    // Auto-clear typing after 3 seconds of inactivity
    if (isTyping) {
      setTimeout(() => {
        set(typingRef, false);
      }, 3000);
    }
  }

  async openChat(chat: any, isNew: boolean = false) {
    try {
      let conv: any = null;

      if (isNew) {
        const { receiver }: { receiver: IUser } = chat;
        const roomId = this.getRoomIdFor1To1(
          this.senderId as string,
          receiver.userId
        );
        conv = this.currentConversations.find((c) => c.roomId === roomId);

        if (!conv) {
          conv = {
            title: receiver.username,
            type: 'private',
            roomId: roomId,
            members: [this.senderId, receiver.userId],
          } as unknown as IConversation;
        }
      } else {
        const roomIdToFind = chat.roomId || chat;
        conv = this.currentConversations.find((c) => c.roomId === roomIdToFind);

        if (!conv) {
          console.log('⚠️ Conversation not in memory, loading from SQLite...');
          try {
            const sqliteConv = await this.sqliteService.getConversation?.(
              roomIdToFind,
              this.senderId as string
            );
            if (sqliteConv) {
              conv = sqliteConv;
              // Add to conversations array
              const existing = this._conversations$.value;
              this._conversations$.next([...existing, conv]);
            }
          } catch (err) {
            console.warn('Failed to load conversation from SQLite:', err);
          }
        }

        // ✅ If still not found, create a minimal conversation object
        if (!conv) {
          console.log('⚠️ Creating minimal conversation object');
          const parts = roomIdToFind.split('_');
          const receiverId =
            parts.find((p: string) => p !== this.senderId) ??
            parts[parts.length - 1];

          // ✅ Try to get title from platformUsers
          let title = receiverId; // fallback to userId
          let phoneNumber = '';

          const receiverUser = this._platformUsers$.value.find(
            (u) => u.userId === receiverId
          );

          if (receiverUser) {
            title =
              receiverUser.username || receiverUser.phoneNumber || receiverId;
            phoneNumber = receiverUser.phoneNumber || '';
          } else {
            // ✅ Try to fetch from API if not in platformUsers
            try {
              const profileResp: any = await firstValueFrom(
                this.apiService.getUserProfilebyId(receiverId)
              );
              title =
                profileResp?.name || profileResp?.phone_number || receiverId;
              phoneNumber = profileResp?.phone_number || '';
            } catch (err) {
              console.warn('Failed to fetch user profile for title:', err);
            }
          }

          // ✅ If still no proper title, use phone number or userId
          if (title === receiverId && phoneNumber) {
            title = phoneNumber;
          }

          conv = {
            roomId: roomIdToFind,
            type: 'private',
            title: title,
            phoneNumber: phoneNumber,
            members: [this.senderId, receiverId],
            unreadCount: 0,
          } as IConversation;

          console.log('✅ Created conversation with title:', title);
        }
      }

      // ✅ Determine member IDs
      let memberIds: string[] = [];
      if (conv.type === 'private') {
        const parts = conv.roomId.split('_');
        const receiverId =
          parts.find((p: string) => p !== this.senderId) ??
          parts[parts.length - 1];
        memberIds.push(receiverId);
      } else {
        memberIds = (conv as IConversation).members || [];
      }

      // ✅ Set current chat FIRST (critical for other methods)
      this.currentChat = { ...(conv as IConversation) };
      console.log('✅ Current chat set:', this.currentChat.roomId);

      await this.setActiveChat(this.senderId!, this.currentChat.roomId);

      // ✅ Setup presence listener
      this.presenceCleanUp = this.isReceiverOnline(memberIds);

      // ✅ Setup typing listeners
      const typingUnsubscribers: (() => void)[] = [];
      for (const memberId of memberIds) {
        if (memberId !== this.senderId) {
          const unsub = this.listenToTypingStatus(conv.roomId, memberId);
          typingUnsubscribers.push(unsub);
        }
      }

      // ✅ Combine cleanup functions
      const originalCleanup = this.presenceCleanUp;
      this.presenceCleanUp = () => {
        originalCleanup?.();
        typingUnsubscribers.forEach((unsub) => {
          try {
            unsub();
          } catch (e) {}
        });
      };

      // ✅ Setup real-time message listener
      // this._roomMessageListner = this.listenRoomStream(conv?.roomId as string, {
      //   onAdd: async (msgKey, data, isNew) => {
      //     if (!this.currentChat || this.currentChat.roomId !== conv.roomId) {
      //       console.log('⚠️ Message received but chat is closed, ignoring');
      //       return;
      //     }
      //     if (isNew && data.sender !== this.senderId) {
      //       try {
      //         const decryptedText = await this.encryptionService.decrypt(
      //           data.text as string
      //         );

      //         const { attachment, ...msg } = data;

      //         console.log('📨 New message received from:', data.sender);

      //         // ✅ Push to UI
      //         this.pushMsgToChat({
      //           msgId: msgKey,
      //           ...msg,
      //           text: decryptedText,
      //           attachment: attachment ? { ...attachment } : undefined,
      //         });

      //         // ✅ Save to SQLite
      //         await this.sqliteService.saveMessage({
      //           ...msg,
      //           msgId: msgKey,
      //           text: decryptedText,
      //         });

      //         if (attachment) {
      //           await this.sqliteService.saveAttachment({
      //             ...attachment,
      //             localUrl: '',
      //             msgId: msgKey,
      //           });
      //         }

      //         // ✅ Mark as delivered
      //         await this.markAsDelivered(msgKey, null, conv.roomId);
      //       } catch (err) {
      //         console.error('❌ Error processing new message:', err);
      //       }
      //     }
      //   },
      //   onChange: async (msgKey, data) => {
      //     await this.updateMessageLocally({ ...data, msgId: msgKey });
      //   },
      //   onRemove(msgKey) {
      //     console.log(`Message removed: ${msgKey}`);
      //   },
      // });
      await this.loadMessages(20, true);
      await this.syncMessagesWithServer();
      if (!this.networkService.isOnline.value) return;
      this._roomMessageListner = this.listenRoomStream(conv?.roomId as string, {
        onAdd: async (msgKey, data, isNew) => {
          if (!this.currentChat || this.currentChat.roomId !== conv.roomId) {
            console.log('⚠️ Message received but chat is closed, ignoring');
            return;
          }

          if (isNew && data.sender !== this.senderId) {
            try {
              const decryptedText = await this.encryptionService.decrypt(
                data.text as string
              );

              const { attachment, ...msg } = data;

              console.log('📨 New message received from:', data.sender);

              // ✅ Push to UI
              this.pushMsgToChat({
                msgId: msgKey,
                ...msg,
                text: decryptedText,
                attachment: attachment ? { ...attachment } : undefined,
              });

              // ✅ Save to SQLite
              await this.sqliteService.saveMessage({
                ...msg,
                msgId: msgKey,
                ownerId: this.senderId,
                text: decryptedText,
              });

              if (attachment) {
                await this.sqliteService.saveAttachment({
                  ...attachment,
                  ownerId: this.senderId,
                  localUrl: '',
                  msgId: msgKey,
                });
              }

              // ✅ Mark as delivered ONLY if chat is open
              if (this.currentChat?.roomId === conv.roomId) {
                await this.markAsDelivered(msgKey, null, conv.roomId);
                console.log('✅ Message marked as delivered (chat open)');
              }
            } catch (err) {
              console.error('❌ Error processing new message:', err);
            }
          }
        },

        onChange: async (msgKey, data) => {
          // 🔒 GUARD: Check if chat is still open
          if (!this.currentChat || this.currentChat.roomId !== conv.roomId) {
            console.log(
              '⚠️ Message update received but chat is closed, ignoring'
            );
            return;
          }

          await this.updateMessageLocally({ ...data, msgId: msgKey });
        },

        onRemove(msgKey) {
          console.log(`Message removed: ${msgKey}`);
        },
      });

      // ✅ Reset unread count
      await this.setUnreadCount();

      console.log('✅ openChat completed successfully');
    } catch (error) {
      console.error('❌ Error in openChat:', error);
      throw error; // Re-throw so caller can handle
    }
  }

  async setUnreadCount(roomId: string | null = null, count: number = 0) {
    const targetRoomId = roomId || this.currentChat?.roomId;
    if (!targetRoomId || !this.senderId) return;

    const isActiveChat = await this.hasUserOpenedChat(
      this.senderId,
      targetRoomId
    );
    if (!isActiveChat && count !== 0) {
      console.log('⚠️ Skipping unread count update - chat not active');
      return;
    }

    const metaRef = rtdbRef(
      this.db,
      `userchats/${this.senderId}/${targetRoomId}`
    );

    // 1. Check if node exists
    const snap = await get(metaRef);

    if (snap.exists()) {
      // 2. Update only if exists
      await rtdbUpdate(metaRef, { unreadCount: count });
    }
    console.log(`✅ Unread count set to ${count} for ${targetRoomId}`);
  }
  
  async markUnreadChat(roomId: string | null = null, count: number = 0) {
    const targetRoomId = roomId || this.currentChat?.roomId;
    if (!targetRoomId || !this.senderId) return;

    // const isActiveChat = await this.hasUserOpenedChat(
    //   this.senderId,
    //   targetRoomId
    // );
    // if (!isActiveChat && count !== 0) {
    //   console.log('⚠️ Skipping unread count update - chat not active');
    //   return;
    // }

    const metaRef = rtdbRef(
      this.db,
      `userchats/${this.senderId}/${targetRoomId}`
    );

    // 1. Check if node exists
    const snap = await get(metaRef);

    if (snap.exists()) {
      // 2. Update only if exists
      await rtdbUpdate(metaRef, { unreadCount: count });
    }
    console.log(`✅ Unread count set to ${count} for ${targetRoomId}`);
  }

  async closeChat() {
    try {
      console.log('🔴 Closing chat:', this.currentChat?.roomId);

      if (this.senderId && this.currentChat?.roomId) {
        await this.clearActiveChat(this.senderId);
      }
      if (this.currentChat?.roomId && this.senderId) {
        try {
          const typingRef = ref(
            this.db,
            `typing/${this.currentChat.roomId}/${this.senderId}`
          );
          await set(typingRef, false);
          console.log('✅ Typing status cleared');
        } catch (error) {
          console.warn('⚠️ Failed to clear typing status:', error);
        }
      }

      if (this._roomMessageListner) {
        try {
          this._roomMessageListner();
          console.log('✅ Message listener removed');
        } catch (error) {
          console.warn('⚠️ Failed to remove message listener:', error);
        }
        this._roomMessageListner = null;
      }

      if (this.presenceCleanUp) {
        try {
          this.presenceCleanUp();
          console.log('✅ Presence listeners removed');
        } catch (error) {
          console.warn('⚠️ Failed to remove presence listeners:', error);
        }
        this.presenceCleanUp = null;
      }

      if (this.currentChat?.roomId) {
        const typingMap = new Map(this._typingStatus$.value);
        const memberIds = this.currentChat.members || [];

        memberIds.forEach((memberId) => {
          if (memberId !== this.senderId) {
            typingMap.delete(memberId);
          }
        });

        this._typingStatus$.next(typingMap);
        console.log('✅ Local typing status cleared');
      }

      if (this.currentChat?.members) {
        this.currentChat.members.forEach((memberId) => {
          if (memberId !== this.senderId) {
            this.membersPresence.delete(memberId);
          }
        });
        this._presenceSubject$.next(new Map(this.membersPresence));
        console.log('✅ Local presence data cleared');
      }

      const closedChatId = this.currentChat?.roomId;
      this.currentChat = null;

      console.log(`✅ Chat closed successfully: ${closedChatId}`);
    } catch (error) {
      console.error('❌ Error closing chat:', error);
      // Even if error occurs, ensure chat is marked as closed
      this.currentChat = null;
      this._roomMessageListner = null;
      this.presenceCleanUp = null;
    }
  }

  async initApp(rootUserId?: string) {
    try {
      this.senderId = rootUserId || '';
      if (rootUserId) {
        // await this.setSenderId(rootUserId);  //this uses in cache code
      }

      if (this.isAppInitialized) {
        console.warn('App already initialized!');
        return;
      }
      this.networkService.isOnline$.subscribe((isOnline) => {
        if (!isOnline) {
          console.log('User is offline');
          throw new Error('user is offline');
        }
      });
      // this.loadConversations();
      let normalizedContacts: any[] = [];
      console.log('init app platform is', this.isWeb);
      if (this.isWeb()) {
        try {
          normalizedContacts =
            (await this.contactsyncService.getDevicePhoneNumbers?.()) || [];
        } catch (e) {
          console.warn('Failed to get device contacts', e);
        }
      } else {
        normalizedContacts = [];
      }

      const pfUsers = await this.contactsyncService.getMatchedUsers();
      console.log({ pfUsers });
      await this.sqliteService.upsertContacts(
        pfUsers.map((u) => ({ ...u, ownerId: this.senderId as string }))
      );
      this._deviceContacts$.next([...normalizedContacts]);
      this._platformUsers$.next([...pfUsers]);
      await this.loadConversations();
      this.setupPresence();
      //  this.syncReceipt();
      this.isAppInitialized = true;
      // await this.setAppInitialized(true);  //this use in cache code
    } catch (err) {
      console.error('initApp failed', err);
      try {
        const fallbackContacts =
          await this.contactsyncService.getDevicePhoneNumbers?.();
        if (fallbackContacts) {
          this._deviceContacts$.next([...fallbackContacts]);
        }
        await this.loadConversations();
        const cachedPfUsers = await this.sqliteService.getContacts();
        this._platformUsers$.next([...cachedPfUsers]);
      } catch (fallbackErr) {
        console.error('initApp fallback failed', fallbackErr);
        this._deviceContacts$.next([]);
        this._platformUsers$.next([]);
      }
    } finally {
      // this.syncReceipt();
      // console.log("this finally block called")
    }
  }

  setupPresence() {
    if (!this.senderId) return;

    const connectedRef = ref(this.db, '.info/connected');
    const userStatusRef = ref(this.db, `/presence/${this.senderId}`);

    onValue(connectedRef, (snap) => {
      const isConnected = snap.val();
      if (isConnected === false) {
        return;
      }

      onDisconnect(userStatusRef)
        .set({
          isOnline: false,
          last_changed: Date.now(),
        })
        .then(() => {
          // 👇 Then mark the user online
          set(userStatusRef, {
            isOnline: true,
            last_changed: Date.now(),
          });
        });
    });
  }

  /**
   * Subscribes to one or multiple users' online presence.
   * Returns a cleanup function to stop all listeners.
   */
  isReceiverOnline(memberIds: string | string[]): () => void {
    const ids = Array.isArray(memberIds)
      ? memberIds.filter(Boolean)
      : [memberIds].filter(Boolean);

    if (!ids.length) return () => {};

    // Ensure tracking maps exist
    this._memberUnsubs ??= new Map<string, () => void>();
    this.membersPresence ??= new Map<
      string,
      { isOnline: boolean; lastSeen: number | null }
    >();

    // 🧹 Remove listeners for users no longer in the list
    for (const [existingId, unsub] of this._memberUnsubs.entries()) {
      if (!ids.includes(existingId)) {
        try {
          unsub?.();
        } catch {}
        this._memberUnsubs.delete(existingId);
        this.membersPresence.delete(existingId);
      }
    }

    // 🧠 Add listeners for new users
    for (const id of ids) {
      if (this._memberUnsubs.has(id)) continue; // already listening

      this.membersPresence.set(id, { isOnline: false, lastSeen: null });
      const userStatusRef = ref(this.db, `presence/${id}`);

      // const unsubscribe = onValue(userStatusRef, (snap) => {
      //   const val = snap.val() ?? {};
      //   const isOnline = !!val.isOnline;

      //   // Support different timestamp keys
      //   const ts =
      //     val.lastSeen ??
      //     val.last_changed ??
      //     val.last_changed_at ??
      //     val.timestamp;
      //   const lastSeen =
      //     typeof ts === 'number' ? ts : ts ? Number(ts) || null : null;

      //   this.membersPresence.set(id, { isOnline, lastSeen });
      //   console.log(this.membersPresence);
      //   // Optionally trigger an observable update:
      //   // this.membersPresenceSubject?.next(this.membersPresence);
      // });

      const unsubscribe = onValue(userStatusRef, (snap) => {
        const val = snap.val() ?? {};
        const isOnline = !!val.isOnline;

        const ts =
          val.lastSeen ??
          val.last_changed ??
          val.last_changed_at ??
          val.timestamp;
        const lastSeen =
          typeof ts === 'number' ? ts : ts ? Number(ts) || null : null;

        this.membersPresence.set(id, { isOnline, lastSeen });

        // 🆕 Emit the updated presence map
        this._presenceSubject$.next(new Map(this.membersPresence));

        console.log(this.membersPresence);
      });

      this._memberUnsubs.set(id, unsubscribe);
    }

    // 🧩 Return cleanup function
    return () => {
      for (const [id, unsub] of this._memberUnsubs.entries()) {
        try {
          unsub?.();
        } catch {}
      }
      this._memberUnsubs.clear();
      this.membersPresence.clear();
    };
  }

  async getPreviewUrl(msg: IMessage & { attachment: IAttachment }) {
    let previewUrl: string | null = null;
    let attachment;
    if (!msg.attachment.localUrl) {
      attachment = await this.sqliteService.getAttachment(msg.msgId);
      previewUrl = await this.fileSystemService.getFilePreview(
        attachment?.localUrl as string
      );
      if (!previewUrl) {
        const res = await firstValueFrom(
          this.apiService.getDownloadUrl(attachment?.mediaId as string)
        );
        previewUrl = res.status ? res.downloadUrl : '';
      }
    } else {
      previewUrl = await this.fileSystemService.getFilePreview(
        msg.attachment.localUrl as string
      );
      if (!previewUrl) {
        previewUrl = msg.attachment.cdnUrl as string;
      }
    }
    return previewUrl;
  }

  getPresenceStatus(userId: string): MemberPresence | null {
    return this.membersPresence.get(userId) || null;
  }

  getPresenceObservable(): Observable<Map<string, MemberPresence>> {
    const presenceSubject = new BehaviorSubject<Map<string, MemberPresence>>(
      new Map(this.membersPresence)
    );

    // You'll need to add this property to your class
    // private _presenceSubject$ = new BehaviorSubject<Map<string, MemberPresence>>(new Map());

    return presenceSubject.asObservable();
  }

  /**
   * Set the currently active chat for a user
   * This helps determine if unread count should be incremented
   */
  private async setActiveChat(userId: string, roomId: string): Promise<void> {
    try {
      const activeChatRef = rtdbRef(this.db, `activeChats/${userId}`);
      await rtdbSet(activeChatRef, roomId);

      // Setup disconnect handler to clear on disconnect
      const disconnectRef = onDisconnect(activeChatRef);
      await disconnectRef.remove();

      console.log(`✅ Active chat set: ${roomId} for user ${userId}`);
    } catch (error) {
      console.error('Error setting active chat:', error);
    }
  }

  /**
   * Clear the active chat status for a user
   */
  private async clearActiveChat(userId: string): Promise<void> {
    try {
      const activeChatRef = rtdbRef(this.db, `activeChats/${userId}`);
      await rtdbSet(activeChatRef, null);
      console.log(`✅ Active chat cleared for user ${userId}`);
    } catch (error) {
      console.error('Error clearing active chat:', error);
    }
  }

  async updateMessageStatusFromReceipts(msg: IMessage) {
    if (!msg.receipts || !this.currentChat?.members) return;

    const members = this.currentChat.members;
    const sender = this.senderId!;
    const others = members.filter((m) => m !== sender);

    const deliveredTo =
      msg.receipts.delivered?.deliveredTo?.map((d) => d.userId) || [];
    const readBy = msg.receipts.read?.readBy?.map((r) => r.userId) || [];

    let newStatus: IMessage['status'] | null = null;

    if (others.every((id) => readBy.includes(id))) {
      newStatus = 'read';
    } else if (others.every((id) => deliveredTo.includes(id))) {
      newStatus = 'delivered';
    }

    if (newStatus && msg.status !== newStatus) {
      const msgRef = ref(this.db, `chats/${msg.roomId}/${msg.msgId}`);
      await rtdbUpdate(msgRef, { status: newStatus });
    }
  }

  async updateMessageLocally(msg: IMessage) {
    const messagesMap = new Map(this._messages$.value);
    const list = messagesMap.get(msg.roomId) || [];
    const index = list.findIndex((m) => m.msgId === msg.msgId);
    const decryptedText = await this.encryptionService.decrypt(
      msg.text as string
    );
    if (index >= 0) {
      list[index] = {
        ...msg,
        text: decryptedText,
        isMe: msg.sender === this.senderId,
      };
    } else {
      list.push({
        ...msg,
        text: decryptedText,
        isMe: msg.sender === this.senderId,
      });
    }
    messagesMap.set(msg.roomId, list);
    this._messages$.next(messagesMap);
    console.warn('UI updated');
  }

  async markAsRead(msgId: string, roomId: string | null = null) {
    try {
      if (!this.senderId || !msgId) return;

      const messagePath = ref(
        this.db,
        `chats/${roomId || this.currentChat?.roomId}/${msgId}/receipts/read`
      );
      const now = Date.now();
      const snapshot = await get(messagePath);
      if (!snapshot.exists()) return;
      const readReceipt = snapshot.val();
      const alreadyRead = readReceipt.readBy?.some(
        (r: any) => r.userId === this.senderId
      );
      if (alreadyRead) return;
      const updatedReceipts = {
        status: true,
        readBy: [
          ...(readReceipt.readBy || []),
          {
            userId: this.senderId,
            timestamp: now,
          },
        ],
      };

      await rtdbUpdate(messagePath, { ...updatedReceipts });
    } catch (error) {
      console.error('markAsRead error:', error);
    }
  }
  async markAsDelivered(
    msgId: string,
    userID: string | null = null,
    roomId: string | null = null
  ) {
    try {
      if (!msgId) {
        console.log({ roomId: this.currentChat?.roomId });
        return;
      }
      const userId = userID || this.senderId;
      const messagePath = ref(
        this.db,
        `chats/${
          roomId || this.currentChat?.roomId
        }/${msgId}/receipts/delivered`
      );
      const now = Date.now();
      const snapshot = await get(messagePath);
      if (!snapshot.exists()) return;

      const deliveredReceipt = snapshot.val();
      const alreadyDelivered = deliveredReceipt?.deliveredTo?.some(
        (d: any) => d.userId === userId
      );

      if (alreadyDelivered) return;
      const updatedReceipts = {
        status: true,
        deliveredTo: [
          ...(deliveredReceipt.deliveredTo || []),
          {
            userId,
            timestamp: now,
          },
        ],
      };
      await rtdbUpdate(messagePath, { ...updatedReceipts });
      console.log('mark delivered!');
    } catch (error) {
      console.error('markAsDelivered error:', error);
    }
  }

  async setQuickReaction({
    msgId,
    userId,
    emoji,
  }: {
    msgId: string;
    userId: string;
    emoji: string | null;
  }) {
    const messageRef = rtdbRef(
      this.db,
      `chats/${this.currentChat?.roomId}/${msgId}/reactions`
    );
    const snap = await rtdbGet(messageRef);
    const reactions = (snap.val() || []) as IMessage['reactions'];
    const idx = reactions.findIndex((r) => r.userId == userId);
    if (idx > -1) {
      reactions[idx] = { ...reactions[idx], emoji };
    } else {
      reactions.push({ userId, emoji });
    }
    rtdbSet(messageRef, reactions);
    // rtdbUpdate(messageRef,reactions)
  }

  async loadConversations() {
    try {
      const convs =
        (await this.sqliteService.getConversations?.(
          this.senderId as string
        )) || [];
      this._conversations$.next([...convs]);
      this.syncConversationWithServer();
      return convs;
    } catch (err) {
      console.error('loadConversations', err);
      return [];
    }
  }

  //   async loadConversations() {
  //   try {
  //     // const convs = (await this.sqliteService.getConversations?.()) || [];
  //     // this._conversations$.next([...convs]);

  //     // ✅ ADD: Directly sync from Firebase
  //     console.log('📂 Loading conversations from Firebase userchats node...');

  //     // Immediately trigger sync without SQLite fallback
  //     await this.syncConversationWithServer();

  //     return this._conversations$.value;
  //   } catch (err) {
  //     console.error('loadConversations error:', err);
  //     return [];
  //   }
  // }

  private async fetchPrivateConvDetails(
    roomId: string,
    meta: any
  ): Promise<IConversation> {
    const isWeb = this.isWeb();
    // console.log({isWeb})
    const parts = roomId.split('_');
    const receiverId =
      parts.find((p) => p !== this.senderId) ?? parts[parts.length - 1];
    console.log('this platform users', this._platformUsers$.value);
    console.log('receiver ids', receiverId);

    const localUser: Partial<IUser> | undefined =
      this._platformUsers$.value.find((u) => u.userId == receiverId);

    console.log({ localUser });

    let profileResp: {
      phone_number: string;
      profile: string | null;
      name: string;
      publicKeyHex?: string;
    } | null = null;

    console.log('is web ', !!isWeb);

    if (isWeb) {
      try {
        profileResp = await firstValueFrom(
          this.apiService.getUserProfilebyId(receiverId)
        );
      } catch (err) {
        console.warn('Failed to fetch profile (web)', receiverId, err);
      }
    } else if (!localUser) {
      try {
        profileResp = await firstValueFrom(
          this.apiService.getUserProfilebyId(receiverId)
        );
      } catch (err) {
        console.warn(
          'Failed to fetch profile (native fallback)',
          receiverId,
          err
        );
      }
    }

    let titleToShow = 'Unknown';
    console.error('isWeb', isWeb);
    if (isWeb) {
      titleToShow =
        profileResp?.phone_number ??
        localUser?.phoneNumber ??
        profileResp?.name ??
        localUser?.username ??
        'Unknown';
    } else {
      titleToShow =
        localUser?.username ??
        profileResp?.phone_number ??
        profileResp?.name ??
        localUser?.phoneNumber ??
        'Unknown';
    }

    const decryptedText = await this.encryptionService.decrypt(
      meta?.lastmessage
    );

    const conv: IConversation = {
      roomId,
      type: 'private',
      title: titleToShow,
      phoneNumber: profileResp?.phone_number ?? localUser?.phoneNumber,
      avatar: localUser?.avatar ?? profileResp?.profile ?? undefined,
      members: [this.senderId, receiverId],
      isMyself: false,
      isArchived: meta?.isArchived,
      isPinned: meta?.isPinned,
      isLocked: meta?.isLocked,
      lastMessage: decryptedText ?? undefined,
      lastMessageType: meta?.lastmessageType ?? undefined,
      lastMessageAt: meta?.lastmessageAt
        ? new Date(Number(meta.lastmessageAt))
        : undefined,
      unreadCount: meta.unreadCount,
      updatedAt: meta?.lastmessageAt
        ? new Date(Number(meta.lastmessageAt))
        : undefined,
    } as IConversation;

    return conv;
  }

  private parseDate(value: any): Date | undefined {
    if (!value && value !== 0) return undefined;
    if (value instanceof Date) return value;
    const n =
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    if (typeof n === 'number' && !Number.isNaN(n)) return new Date(n);
    const parsed = Date.parse(String(value));
    return isNaN(parsed) ? undefined : new Date(parsed);
  }

  private async fetchGroupConDetails(
    roomId: string,
    meta: IChatMeta
  ): Promise<IConversation> {
    const groupRef = rtdbRef(this.db, `groups/${roomId}`);
    const groupSnap = await rtdbGet(groupRef);
    const group: Partial<IGroup> = groupSnap.val() || {};
    const membersObj: Record<string, Partial<IGroupMember>> = group.members ||
    {};
    const members = Object.keys(membersObj);

    let decryptedText: string | undefined;
    try {
      decryptedText = await this.encryptionService.decrypt(meta?.lastmessage);
    } catch (e) {
      console.warn('fetchGroupConDetails: decrypt failed for', roomId, e);
      decryptedText =
        typeof meta?.lastmessage === 'string' ? meta.lastmessage : undefined;
    }

    const conv: IConversation = {
      roomId,
      type: meta.type,
      communityId: group.communityId || null,
      title: group.title || 'GROUP',
      avatar: group.avatar || '',
      members,
      adminIds: group.adminIds || [],
      isArchived: !!meta.isArchived,
      isPinned: !!meta.isPinned,
      isLocked: !!meta.isLocked,
      createdAt: group.createdAt ? this.parseDate(group.createdAt) : undefined,
      lastMessage: decryptedText ?? undefined,
      lastMessageType: meta.lastmessageType ?? undefined,
      lastMessageAt: meta.lastmessageAt
        ? this.parseDate(meta.lastmessageAt)
        : undefined,
      unreadCount: meta.unreadCount || 0,
      updatedAt: meta.lastmessageAt
        ? this.parseDate(meta.lastmessageAt)
        : group.updatedAt
        ? this.parseDate(group.updatedAt)
        : undefined,
    } as IConversation;

    return conv;
  }

  async syncConversationWithServer(): Promise<void> {
    try {
      if (!this.senderId) {
        console.warn('syncConversationWithServer: senderId is not set');
        return;
      }

      this._isSyncing$.next(true);

      const userChatsPath = `userchats/${this.senderId}`;
      const userChatsRef = rtdbRef(this.db, userChatsPath);
      const snapshot: DataSnapshot = await rtdbGet(userChatsRef);
      const userChats = snapshot.val() || {};
      const conversations: IConversation[] = [];
      const roomIds = Object.keys(userChats);

      for (const roomId of roomIds) {
        const meta: IChatMeta = userChats[roomId] || {};
        try {
          const type: IConversation['type'] = meta.type;

          if (type === 'private') {
            const conv = await this.fetchPrivateConvDetails(roomId, meta);
            conversations.push(conv);
          } else if (type === 'group') {
            // Check if this group belongs to a community
            // const groupRef = rtdbRef(this.db, `groups/${roomId}`);
            // const groupSnap = await rtdbGet(groupRef);
            // const groupData = groupSnap.val() || {};

            // Skip announcement and general groups that belong to communities
            // const belongsToCommunity = !!groupData.communityId;
            // const isSystemGroup = groupData.title === 'Announcements' || groupData.title === 'General';

            // if (belongsToCommunity && isSystemGroup) {
            //   console.log(`Skipping system group ${roomId} from community ${groupData.communityId}`);
            //   continue; // Skip this group
            // }

            const conv = await this.fetchGroupConDetails(roomId, meta);
            conversations.push(conv);
          } else if (type === 'community') {
            const conv = await this.fetchCommunityConvDetails(roomId, meta);
            conversations.push(conv);
          } else {
            conversations.push({
              roomId,
              type: 'private',
              title: roomId,
              lastMessage: meta?.lastmessage,
              lastMessageAt: meta?.lastmessageAt
                ? new Date(Number(meta.lastmessageAt))
                : undefined,
              unreadCount: Number(meta?.unreadCount) || 0,
            } as IConversation);
          }
        } catch (innerErr) {
          console.error('Error building conversation for', roomId, innerErr);
        }
      }

      const existing = this._conversations$.value;
      const newConversations = conversations.filter(
        ({ roomId }) => !existing.some((c) => c.roomId === roomId)
      );

      if (newConversations.length) {
        for (const conv of newConversations) {
          try {
            this.sqliteService.createConversation({
              ...conv,
              ownerId: this.senderId,
            });
          } catch (error) {}
        }
        this._conversations$.next([...existing, ...newConversations]);
      }
      console.log('all conversations', [...existing, ...newConversations]);
      if (this._userChatsListener) {
        try {
          this._userChatsListener();
        } catch {}
        this._userChatsListener = null;
      }

      const onUserChatsChange = async (snap: DataSnapshot) => {
        const updatedData: IChatMeta = snap.val() || {};
        const current = [...this._conversations$.value];

        for (const [roomId, meta] of Object.entries(updatedData)) {
          const idx = current.findIndex((c) => c.roomId === roomId);
          const chatMeta: IChatMeta = { ...meta, roomId };
          console.log('chat changed', chatMeta);

          try {
            if (idx > -1) {
              const decryptedText = await this.encryptionService.decrypt(
                chatMeta.lastmessage
              );
              const conv = current[idx];
              current[idx] = {
                ...conv,
                lastMessage: decryptedText ?? conv.lastMessage,
                lastMessageType:
                  chatMeta.lastmessageType ?? conv.lastMessageType,
                lastMessageAt: chatMeta.lastmessageAt
                  ? new Date(Number((meta as any).lastmessageAt))
                  : conv.lastMessageAt,
                unreadCount: Number(chatMeta.unreadCount || 0),
                isArchived: chatMeta.isArchived,
                updatedAt: chatMeta.lastmessageAt
                  ? new Date(Number(chatMeta.lastmessageAt))
                  : conv.updatedAt,
              };
            } else {
              console.warn(
                'New room detected in userchats but not present locally:',
                roomId
              );
              const type: IConversation['type'] = chatMeta.type || 'private';

              try {
                let newConv: IConversation | null = null;

                if (type === 'private') {
                  newConv = await this.fetchPrivateConvDetails(
                    roomId,
                    chatMeta
                  );
                } else if (type === 'group') {
                  // Check if this group belongs to a community
                  // const groupRef = rtdbRef(this.db, `groups/${roomId}`);
                  // const groupSnap = await rtdbGet(groupRef);
                  // const groupData = groupSnap.val() || {};

                  // Skip announcement and general groups
                  // const belongsToCommunity = !!groupData.communityId;
                  // const isSystemGroup = groupData.title === 'Announcements' || groupData.title === 'General';

                  // if (belongsToCommunity && isSystemGroup) {
                  //   console.log(`Skipping new system group ${roomId}`);
                  //   continue;
                  // }

                  newConv = await this.fetchGroupConDetails(roomId, chatMeta);
                } else if (type === 'community') {
                  newConv = await this.fetchCommunityConvDetails(
                    roomId,
                    chatMeta
                  );
                } else {
                  newConv = {
                    roomId,
                    type: 'private',
                    title: roomId,
                    lastMessage: chatMeta.lastmessage,
                    lastMessageAt: chatMeta.lastmessageAt
                      ? new Date(Number(chatMeta.lastmessageAt))
                      : undefined,
                    unreadCount: Number(chatMeta.unreadCount) || 0,
                  } as IConversation;
                }

                if (newConv) {
                  current.push(newConv);
                  try {
                    await this.sqliteService.createConversation({
                      ...newConv,
                      ownerId: this.senderId as string,
                    });
                  } catch (e) {
                    console.warn(
                      'sqlite createConversation failed for new room',
                      roomId,
                      e
                    );
                  }
                }
              } catch (e) {
                console.error(
                  'Failed to fetch details for new room',
                  roomId,
                  e
                );
              }
            }
          } catch (e) {
            console.error('onUserChatsChange inner error for', roomId, e);
          }
        }

        this.syncReceipt(
          current
            .filter((c) => (c.unreadCount || 0) > 0)
            .map((c) => ({
              roomId: c.roomId,
              unreadCount: c.unreadCount as number,
            }))
        );

        this._conversations$.next(current);
      };

      const unsubscribe = rtdbOnValue(userChatsRef, onUserChatsChange);
      this._userChatsListener = () => {
        try {
          unsubscribe();
        } catch {}
      };
    } catch (error) {
      console.error('syncConversationWithServer error:', error);
    } finally {
      this._isSyncing$.next(false);
    }
  }

  //   async syncConversationWithServer(): Promise<void> {      //without sqlite
  //   try {
  //     if (!this.senderId) {
  //       console.warn('syncConversationWithServer: senderId is not set');
  //       return;
  //     }

  //     this._isSyncing$.next(true);

  //     const userChatsPath = `userchats/${this.senderId}`;
  //     const userChatsRef = rtdbRef(this.db, userChatsPath);
  //     const snapshot: DataSnapshot = await rtdbGet(userChatsRef);
  //     const userChats = snapshot.val() || {};
  //     const conversations: IConversation[] = [];
  //     const roomIds = Object.keys(userChats);

  //     console.log(`📥 Found ${roomIds.length} conversations in Firebase`);

  //     for (const roomId of roomIds) {
  //       const meta: IChatMeta = userChats[roomId] || {};
  //       try {
  //         const type: IConversation['type'] = meta.type;

  //         if (type === 'private') {
  //           const conv = await this.fetchPrivateConvDetails(roomId, meta);
  //           conversations.push(conv);
  //         } else if (type === 'group') {
  //           const conv = await this.fetchGroupConDetails(roomId, meta);
  //           conversations.push(conv);
  //         } else if (type === 'community') {
  //           const conv = await this.fetchCommunityConvDetails(roomId, meta);
  //           conversations.push(conv);
  //         } else {
  //           conversations.push({
  //             roomId,
  //             type: 'private',
  //             title: roomId,
  //             lastMessage: meta?.lastmessage,
  //             lastMessageAt: meta?.lastmessageAt
  //               ? new Date(Number(meta.lastmessageAt))
  //               : undefined,
  //             unreadCount: Number(meta?.unreadCount) || 0,
  //           } as IConversation);
  //         }
  //       } catch (innerErr) {
  //         console.error('Error building conversation for', roomId, innerErr);
  //       }
  //     }

  //     // ✅ Update in-memory conversations first
  //     const existing = this._conversations$.value;
  //     const newConversations = conversations.filter(
  //       ({ roomId }) => !existing.some((c) => c.roomId === roomId)
  //     );

  //     if (newConversations.length) {
  //       // ✅ OPTIONAL: Save to SQLite for offline (but don't load from it)
  //       for (const conv of newConversations) {
  //         try {
  //           await this.sqliteService.createConversation({ ...conv });
  //           console.log('💾 Saved to SQLite (offline backup):', conv.roomId);
  //         } catch (error) {
  //           console.warn('SQLite save failed (non-critical):', error);
  //         }
  //       }

  //       this._conversations$.next([...existing, ...newConversations]);
  //     }

  //     console.log('✅ Total conversations loaded:', [...existing, ...newConversations].length);

  //     // ✅ Setup real-time listener for updates
  //     if (this._userChatsListener) {
  //       try {
  //         this._userChatsListener();
  //       } catch {}
  //       this._userChatsListener = null;
  //     }

  //     const onUserChatsChange = async (snap: DataSnapshot) => {
  //       const updatedData: IChatMeta = snap.val() || {};
  //       const current = [...this._conversations$.value];

  //       for (const [roomId, meta] of Object.entries(updatedData)) {
  //         const idx = current.findIndex((c) => c.roomId === roomId);
  //         const chatMeta: IChatMeta = { ...meta, roomId };
  //         console.log('🔄 Chat changed:', chatMeta);

  //         try {
  //           if (idx > -1) {
  //             const decryptedText = await this.encryptionService.decrypt(
  //               chatMeta.lastmessage
  //             );
  //             const conv = current[idx];
  //             current[idx] = {
  //               ...conv,
  //               lastMessage: decryptedText ?? conv.lastMessage,
  //               lastMessageType:
  //                 chatMeta.lastmessageType ?? conv.lastMessageType,
  //               lastMessageAt: chatMeta.lastmessageAt
  //                 ? new Date(Number(meta.lastmessageAt))
  //                 : conv.lastMessageAt,
  //               unreadCount: Number(chatMeta.unreadCount || 0),
  //               isArchived: chatMeta.isArchived,
  //               updatedAt: chatMeta.lastmessageAt
  //                 ? new Date(Number(chatMeta.lastmessageAt))
  //                 : conv.updatedAt,
  //             };

  //             // ✅ OPTIONAL: Update SQLite
  //             try {
  //               // await this.sqliteService.updateConversation(current[idx]);
  //             } catch (e) {
  //               console.warn('SQLite update failed (non-critical):', e);
  //             }
  //           } else {
  //             console.warn(
  //               'New room detected in userchats but not present locally:',
  //               roomId
  //             );
  //             const type: IConversation['type'] = chatMeta.type || 'private';

  //             try {
  //               let newConv: IConversation | null = null;

  //               if (type === 'private') {
  //                 newConv = await this.fetchPrivateConvDetails(
  //                   roomId,
  //                   chatMeta
  //                 );
  //               } else if (type === 'group') {
  //                 newConv = await this.fetchGroupConDetails(roomId, chatMeta);
  //               } else if (type === 'community') {
  //                 newConv = await this.fetchCommunityConvDetails(
  //                   roomId,
  //                   chatMeta
  //                 );
  //               } else {
  //                 newConv = {
  //                   roomId,
  //                   type: 'private',
  //                   title: roomId,
  //                   lastMessage: chatMeta.lastmessage,
  //                   lastMessageAt: chatMeta.lastmessageAt
  //                     ? new Date(Number(chatMeta.lastmessageAt))
  //                     : undefined,
  //                   unreadCount: Number(chatMeta.unreadCount) || 0,
  //                 } as IConversation;
  //               }

  //               if (newConv) {
  //                 current.push(newConv);

  //                 // ✅ OPTIONAL: Save to SQLite
  //                 try {
  //                   await this.sqliteService.createConversation({ ...newConv });
  //                 } catch (e) {
  //                   console.warn('SQLite create failed (non-critical):', e);
  //                 }
  //               }
  //             } catch (e) {
  //               console.error(
  //                 'Failed to fetch details for new room',
  //                 roomId,
  //                 e
  //               );
  //             }
  //           }
  //         } catch (e) {
  //           console.error('onUserChatsChange inner error for', roomId, e);
  //         }
  //       }

  //       // Update receipts
  //       this.syncReceipt(
  //         current
  //           .filter((c) => (c.unreadCount || 0) > 0)
  //           .map((c) => ({
  //             roomId: c.roomId,
  //             unreadCount: c.unreadCount as number,
  //           }))
  //       );

  //       this._conversations$.next(current);
  //     };

  //     const unsubscribe = rtdbOnValue(userChatsRef, onUserChatsChange);
  //     this._userChatsListener = () => {
  //       try {
  //         unsubscribe();
  //       } catch {}
  //     };
  //   } catch (error) {
  //     console.error('syncConversationWithServer error:', error);
  //   } finally {
  //     this._isSyncing$.next(false);
  //   }
  // }

  private async fetchCommunityConvDetails(
    roomId: string,
    meta: IChatMeta
  ): Promise<IConversation> {
    try {
      const communityRef = rtdbRef(this.db, `communities/${roomId}`);
      const communitySnap = await rtdbGet(communityRef);
      const community: Partial<ICommunity> = communitySnap.val() || {};

      const membersObj: Record<
        string,
        Partial<ICommunityMember>
      > = community.members || {};
      const members = Object.keys(membersObj);

      let decryptedText: string | undefined;
      try {
        decryptedText = await this.encryptionService.decrypt(meta?.lastmessage);
      } catch (e) {
        console.warn(
          'fetchCommunityConvDetails: decrypt failed for',
          roomId,
          e
        );
        decryptedText =
          typeof meta?.lastmessage === 'string' ? meta.lastmessage : undefined;
      }

      const conv: IConversation = {
        roomId,
        type: 'community',
        title: community.title || 'COMMUNITY',
        avatar: community.avatar || '',
        members,
        adminIds: community.adminIds || [],
        isArchived: !!meta.isArchived,
        isPinned: !!meta.isPinned,
        isLocked: !!meta.isLocked,
        createdAt: community.createdAt
          ? this.parseDate(community.createdAt)
          : undefined,
        lastMessage: decryptedText ?? undefined,
        lastMessageType: meta.lastmessageType ?? undefined,
        lastMessageAt: meta.lastmessageAt
          ? this.parseDate(meta.lastmessageAt)
          : undefined,
        unreadCount: meta.unreadCount || 0,
        updatedAt: meta.lastmessageAt
          ? this.parseDate(meta.lastmessageAt)
          : undefined,
      } as IConversation;

      return conv;
    } catch (error) {
      console.error('Error fetching community details:', error);
      throw error;
    }
  }

  async syncReceipt(convs: { roomId: string; unreadCount: number }[]) {
    try {
      console.log('before', this._conversations$.value);
      if (!convs.length) return;
      console.log('after');
      for (const conv of convs) {
        const messagesSnap = await this.getMessagesSnap(
          conv.roomId,
          conv.unreadCount as number
        );
        console.log({ messagesSnap });

        const messagesObj = messagesSnap.exists() ? messagesSnap.val() : {};
        const messages = Object.keys(messagesObj)
          .map((k) => ({
            ...messagesObj[k],
            msgId: k,
            timestamp: messagesObj[k].timestamp ?? 0,
          }))
          .sort((a, b) => a.timestamp - b.timestamp);

        for (const m of messages) {
          if (m.msgId) console.log('message object is called');
          await this.markAsDelivered(m.msgId, null, conv.roomId as string);
        }
      }
    } catch (error) {
      console.error('something went wrong', error);
    }
  }

  async syncMessagesWithServer(): Promise<void> {
    try {
      const isWeb = !this.isWeb();
      const roomId = this.currentChat?.roomId;
      if (!roomId) {
        console.error('syncMessagesWithServer: No roomId present');
        return;
      }
      const baseRef = rtdbRef(this.db, `chats/${roomId}`);
      const currentMap = new Map(this._messages$.value); // clone map
      const currentArr = currentMap.get(roomId) ?? [];

      const snapToMsg = async (s: DataSnapshot): Promise<any> => {
        const payload = s.val() ?? {};
        const decryptedText = await this.encryptionService.decrypt(
          payload.text as string
        );
        // let cdnUrl = '';
        // if (payload.attachment) {
        //   const res = await firstValueFrom(
        //     this.apiService.getDownloadUrl(payload.attachment.mediaId)
        //   );
        //   cdnUrl = res.status ? res.downloadUrl : '';
        // }
        return {
          msgId: s.key!,
          isMe: payload.sender === this.senderId,
          ...payload,
          text: decryptedText,
          ...(payload.attachment && {
            attachment: { ...payload.attachment },
          }),
        };
      };

      console.log('inside the sync mesaage with server');
      console.log('current array length', currentArr);
      if (!currentArr.length) {
        console.log('################ load all messages');
        const q = query(baseRef, orderByKey());
        const snap = await rtdbGet(q);
        const fetched: IMessage[] = [];
        const children: any[] = [];
        snap.forEach((child: any) => {
          children.push(child);
        });
        for (const s of children) {
          try {
            const m = await snapToMsg(s);
            fetched.push(m);
            await this.sqliteService.saveMessage({
              ...m,
              roomId: this.currentChat?.roomId,
              ownerId: this.senderId,
            });
            if(m.attachment){
              await this.sqliteService.saveAttachment({
                ...m.attachment,
                ownerId : this.senderId,
                msgId : m.msgId
              });
            }
          } catch (err) {
            console.warn(
              'sqlite saveMessage failed for item',
              s?.key ?? s?.id ?? s,
              err
            );
          }
        }
        fetched.sort((a, b) =>
          a.msgId! < b.msgId! ? -1 : a.msgId! > b.msgId! ? 1 : 0
        );
        fetched.forEach((m) => this.pushMsgToChat(m));
        // currentMap.set(roomId, fetched);
        // this._messages$.next(currentMap);
        // console.log('Messages when no prev ->', fetched);
        return;
      }

      const last =
        currentArr?.sort((a, b) =>
          a.msgId! < b.msgId! ? -1 : a.msgId! > b.msgId! ? 1 : 0
        )?.[currentArr.length - 1] || null;
      const lastKey = last.msgId ?? null;
      if (!lastKey) {
        console.log(
          '#################################syncMessagesWithServer: last message missing key; falling back to latest page'
        );
        const pageSize = 50;
        const q = query(baseRef, orderByKey(), limitToLast(pageSize));
        const snap = await rtdbGet(q);
        const fetched: IMessage[] = [];
        const children: any[] = [];
        snap.forEach((child: any) => {
          children.push(child);
        });

        for (const s of children) {
          try {
            const m = await snapToMsg(s);
            fetched.push(m);
            await this.sqliteService.saveMessage({
              ...m,
              roomId: this.currentChat?.roomId,
              ownerId: this.senderId,
            });
            if(m.attachment){
              await this.sqliteService.saveAttachment({
                ...m.attachment,
                ownerId : this.senderId,
                msgId : m.msgId
              })
            }
          } catch (err) {
            console.warn(
              'sqlite saveMessage failed for item',
              s?.key ?? s?.id ?? s,
              err
            );
          }
        }
        fetched.sort((a, b) =>
          a.msgId! < b.msgId! ? -1 : a.msgId! > b.msgId! ? 1 : 0
        );
        fetched.forEach((m) => this.pushMsgToChat(m));
        // currentMap.set(roomId, fetched);
        // this._messages$.next(currentMap);
        return;
      }

      const qNew = query(baseRef, orderByKey(), startAt(lastKey as string));
      console.log('loading message after last messages', lastKey);
      const snapNew = await rtdbGet(qNew);

      const newMessages: IMessage[] = [];
      const children: any[] = [];
      snapNew.forEach((child: any) => {
        children.push(child);
        return false;
      });

      for (const s of children) {
        try {
          const m = await snapToMsg(s);
          newMessages.push(m);
          await this.sqliteService.saveMessage({
            ...m,
            roomId: this.currentChat?.roomId,
            ownerId: this.senderId,
          });
          if(m.attachment){
            await this.sqliteService.saveAttachment({
              ...m.attachment,
              ownerId : this.senderId,
              msgId: m.msgId
            })
          }
        } catch (err) {
          console.warn(
            'sqlite saveMessage failed for item',
            s?.key ?? s?.id ?? s,
            err
          );
        }
      }

      if (newMessages.length && newMessages[0].msgId === lastKey) {
        newMessages.shift();
      }

      if (newMessages.length === 0) {
        return;
      }

      for (const m of newMessages) {
        try {
          this.sqliteService.saveMessage({
            ...m,
            roomId: this.currentChat?.roomId as string,
            ownerId: this.senderId as string,
          });
        } catch (e) {
          console.warn('sqlite saveMessage failed for', m.msgId, e);
        }
        currentArr.push(m);
      }

      currentArr.forEach((m) => this.pushMsgToChat(m));
      // currentMap.set(roomId, [...currentArr]);
      // this._messages$.next(currentMap);
      console.log('Current messages when some already exists->', currentArr);
    } catch (error) {
      console.error('syncMessagesWithServer error:', error);
    }
  }

  fetchOnce = async (path: string) => {
    // or use your existing db instance if stored in this.db
    const snapshot = await get(ref(this.db, path));
    return snapshot.exists() ? snapshot.val() : null;
  };

  async getMessagesSnap(roomId: string, limit: number) {
    return await get(
      query(
        ref(this.db, `chats/${roomId}`),
        orderByChild('timestamp'),
        limitToLast(limit)
      )
    );
  }

  getMessages(): Observable<IMessage[] | undefined> {
    return this._messages$.asObservable().pipe(
      map(
        (messagesMap: Map<string, IMessage[]>) =>
          messagesMap
            .get(this.currentChat?.roomId as string)
            ?.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
            ?.map((msg, idx, arr) => ({
              ...msg,
              timestamp: new Date(msg.timestamp), // convert timestamp to Date object
              isLast: arr.length - 1 == idx,
            })) || []
      )
    );
  }

  async getTotalMessages() {
    try {
      this._totalMessages = await this.sqliteService.getMessageCount(
        this.currentChat?.roomId as string
      );
    } catch (error) {
      console.error('Error #getTotalMessages -> ', error);
    }
  }

  async loadMessages(limit = 20, intial = false) {
    const roomId = this.currentChat?.roomId as string;
    try {
      if (intial) {
        const currentMessagesMap = new Map(this._messages$?.value || []);
        const existingMessages = currentMessagesMap.get(roomId) || [];
        if (existingMessages.length > 0) return;
      }
      const currentOffset = this._offsets$.value.get(roomId) || 0;
      const newMessages = await this.sqliteService.getMessages(
        roomId,
        this.senderId as string,
        limit,
        currentOffset
      );

      if (!newMessages || newMessages.length === 0) {
        console.log('Not more messages');
        return;
      }

      newMessages.forEach(this.pushMsgToChat);
      // const currentMessagesMap = new Map(this._messages$.value);
      // const existingMessages = currentMessagesMap.get(roomId) || [];
      // const mergedMessages = Array.from(
      //   new Set([...existingMessages, ...newMessages])
      // );
      // currentMessagesMap.set(roomId, mergedMessages);
      // this._messages$.next(currentMessagesMap);
      const newOffsetMap = new Map(this._offsets$.value);
      newOffsetMap.set(roomId, currentOffset + newMessages.length);
      this._offsets$.next(newOffsetMap);
      console.count('#loadMessages called');
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }

  get hasMoreMessages() {
    return (
      (this._messages$.value.get(this.currentChat?.roomId as string)?.length ||
        0) < this._totalMessages
    );
  }

  async setArchiveConversation(
    roomIds: string[],
    isArchive: boolean = true
  ): Promise<void> {
    if (!this.senderId) {
      throw new Error('senderId not set');
    }
    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      console.error('RoomIds is not an array');
      return;
    }

    const existing = this.currentConversations;

    const db = getDatabase();

    const findLocalConv = (roomId: string) => {
      return (
        existing.find(
          (c) => c.roomId === roomId && c.isArchived != isArchive
        ) ?? null
      );
    };

    await Promise.all(
      roomIds.map(async (roomId) => {
        try {
          const chatRef = rtdbRef(db, `userchats/${this.senderId}/${roomId}`);
          const snap: DataSnapshot = await rtdbGet(chatRef);
          if (snap.exists()) {
            await rtdbUpdate(chatRef, { isArchived: isArchive });
          } else {
            const localConv: any = findLocalConv(roomId);
            const meta: Partial<IChatMeta> = {
              type: (localConv?.type as IChatMeta['type']) ?? 'private',
              lastmessageAt:
                localConv?.lastMessageAt instanceof Date
                  ? localConv.lastMessageAt.getTime()
                  : typeof localConv?.lastMessageAt === 'number'
                  ? Number(localConv.lastMessageAt)
                  : Date.now(),
              lastmessageType:
                (localConv?.lastMessageType as IChatMeta['lastmessageType']) ??
                'text',
              lastmessage: localConv?.lastMessage ?? '',
              unreadCount:
                typeof localConv?.unreadCount === 'number'
                  ? localConv.unreadCount
                  : Number(localConv?.unreadCount) || 0,
              isArchived: isArchive,
              isPinned: !!localConv?.isPinned,
              isLocked: !!localConv?.isLocked,
            };

            await rtdbSet(chatRef, meta);
          }
          const localConv = findLocalConv(roomId);
          if (localConv) {
            localConv.isArchived = isArchive;
            const idx = existing.findIndex((c) => c.roomId === roomId);
            if (idx > -1) {
              existing[idx] = {
                ...existing[idx],
                ...localConv,
              };
            } else {
              existing.push(localConv);
            }
          }
          this._conversations$.next(existing);
        } catch (err) {
          console.error('Failed to archive room:', roomId, err);
        }
      })
    );
  }

  // async setPinConversation(
  //   roomIds: string[],
  //   pin: boolean = true
  // ): Promise<void> {
  //   if (!this.senderId) {
  //     throw new Error('senderId not set');
  //   }

  //   if (!Array.isArray(roomIds) || roomIds.length === 0) {
  //     console.error('RoomIds is not an array');
  //     return;
  //   }

  //   const existing = this.currentConversations;
  //   const db = getDatabase();

  //   const findLocalConv = (roomId: string) => {
  //     return (
  //       existing.find((c) => c.roomId === roomId && c.isPinned != pin) ?? null
  //     );
  //   };

  //   await Promise.all(
  //     roomIds.map(async (roomId) => {
  //       try {
  //         const chatRef = rtdbRef(db, `userchats/${this.senderId}/${roomId}`);
  //         const snap: DataSnapshot = await rtdbGet(chatRef);

  //         if (snap.exists()) {
  //           await rtdbUpdate(chatRef, { isPinned: pin });
  //         } else {
  //           const localConv: any = findLocalConv(roomId);
  //           const meta: Partial<IChatMeta> = {
  //             type: (localConv?.type as IChatMeta['type']) ?? 'private',
  //             lastmessageAt:
  //               localConv?.lastMessageAt instanceof Date
  //                 ? localConv.lastMessageAt.getTime()
  //                 : typeof localConv?.lastMessageAt === 'number'
  //                 ? Number(localConv.lastMessageAt)
  //                 : Date.now(),
  //             lastmessageType:
  //               (localConv?.lastMessageType as IChatMeta['lastmessageType']) ??
  //               'text',
  //             lastmessage: localConv?.lastMessage ?? '',
  //             unreadCount:
  //               typeof localConv?.unreadCount === 'number'
  //                 ? localConv.unreadCount
  //                 : Number(localConv?.unreadCount) || 0,
  //             isPinned: pin,
  //             isArchived: !!localConv?.isArchived,
  //             isLocked: !!localConv?.isLocked,
  //           };

  //           await rtdbSet(chatRef, meta);
  //         }
  //         const localConv = findLocalConv(roomId);
  //         if (localConv) {
  //           localConv.isPinned = true;
  //           const idx = existing.findIndex((c) => c.roomId === roomId);
  //           if (idx > -1) {
  //             existing[idx] = { ...existing[idx], ...localConv };
  //           } else {
  //             existing.push(localConv);
  //           }
  //         }

  //         this._conversations$.next(existing);
  //       } catch (err) {
  //         console.error('Failed to pin room:', roomId, err);
  //       }
  //     })
  //   );
  // }

  async setPinConversation(
    roomIds: string[],
    pin: boolean = true
  ): Promise<void> {
    if (!this.senderId) {
      throw new Error('senderId not set');
    }

    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      console.error('RoomIds is not an array');
      return;
    }

    const existing = this.currentConversations; // assumed array reference
    const db = getDatabase();

    const findLocalConv = (roomId: string) => {
      // find conversation that actually needs a change (isPinned != pin)
      return (
        existing.find((c) => c.roomId === roomId && c.isPinned !== pin) ?? null
      );
    };

    // do all updates in parallel, but only emit once after all done
    await Promise.all(
      roomIds.map(async (roomId) => {
        try {
          const chatRef = rtdbRef(db, `userchats/${this.senderId}/${roomId}`);
          const snap: DataSnapshot = await rtdbGet(chatRef);

          if (snap.exists()) {
            // update existing node with desired pinned value
            await rtdbUpdate(chatRef, { isPinned: pin });
          } else {
            // if there is no server node, create a meta using local conversation if available
            const localConv: any = findLocalConv(roomId);
            const meta: Partial<IChatMeta> = {
              type: (localConv?.type as IChatMeta['type']) ?? 'private',
              lastmessageAt:
                localConv?.lastMessageAt instanceof Date
                  ? localConv.lastMessageAt.getTime()
                  : typeof localConv?.lastMessageAt === 'number'
                  ? Number(localConv?.lastMessageAt)
                  : Date.now(),
              lastmessageType:
                (localConv?.lastMessageType as IChatMeta['lastmessageType']) ??
                'text',
              lastmessage: localConv?.lastMessage ?? '',
              unreadCount:
                typeof localConv?.unreadCount === 'number'
                  ? localConv.unreadCount
                  : Number(localConv?.unreadCount) || 0,
              isPinned: pin,
              isArchived: !!localConv?.isArchived,
              isLocked: !!localConv?.isLocked,
            };

            await rtdbSet(chatRef, meta);
          }

          // Update local conversation object (if present) — use `pin` not hard-coded true
          const localConv = findLocalConv(roomId);
          if (localConv) {
            localConv.isPinned = pin;
            // reflect in existing array (replace if found)
            const idx = existing.findIndex((c) => c.roomId === roomId);
            if (idx > -1) {
              existing[idx] = { ...existing[idx], ...localConv };
            } else {
              existing.push(localConv);
            }
          }
        } catch (err) {
          console.error('Failed to pin/unpin room:', roomId, err);
        }
      })
    );

    // Emit updated conversations once
    try {
      this._conversations$.next(existing);
    } catch (e) {
      // safe-guard if _conversations$ isn't available
      console.warn('Could not emit conversations update', e);
    }
  }

  async setLockConversation(
    roomIds: string[],
    lock: boolean = true
  ): Promise<void> {
    if (!this.senderId) {
      throw new Error('senderId not set');
    }

    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      console.error('RoomIds is not an array');
      return;
    }

    const existing = this.currentConversations;

    // helper to find local conversation that isn't already locked
    const findLocalConv = (roomId: string) =>
      existing.find((c) => c.roomId === roomId && c.isLocked != lock) ?? null;

    await Promise.all(
      roomIds.map(async (roomId) => {
        try {
          const chatRef = rtdbRef(
            this.db,
            `userchats/${this.senderId}/${roomId}`
          );
          const snap: DataSnapshot = await rtdbGet(chatRef);

          if (snap.exists()) {
            // ✅ Update existing chat node
            await rtdbUpdate(chatRef, { isLocked: lock });
          } else {
            // ✅ Create a new chat metadata entry
            const localConv: any = findLocalConv(roomId);
            const meta: Partial<IChatMeta> = {
              type: (localConv?.type as IChatMeta['type']) ?? 'private',
              lastmessageAt:
                localConv?.lastMessageAt instanceof Date
                  ? localConv.lastMessageAt.getTime()
                  : typeof localConv?.lastMessageAt === 'number'
                  ? Number(localConv.lastMessageAt)
                  : Date.now(),
              lastmessageType:
                (localConv?.lastMessageType as IChatMeta['lastmessageType']) ??
                'text',
              lastmessage: localConv?.lastMessage ?? '',
              unreadCount:
                typeof localConv?.unreadCount === 'number'
                  ? localConv.unreadCount
                  : Number(localConv?.unreadCount) || 0,
              isLocked: lock,
              isPinned: !!localConv?.isPinned,
              isArchived: !!localConv?.isArchived,
            };

            await rtdbSet(chatRef, meta);
          }

          const localConv = findLocalConv(roomId);
          if (localConv) {
            localConv.isLocked = true;
            const idx = existing.findIndex((c) => c.roomId === roomId);
            if (idx > -1) {
              existing[idx] = { ...existing[idx], ...localConv };
            } else {
              existing.push(localConv);
            }
          }
          this._conversations$.next(existing);
        } catch (err) {
          console.error('Failed to lock room:', roomId, err);
        }
      })
    );
  }

  async bulkUpdate(updates: any) {
    const db = getDatabase();
    await rtdbUpdate(rtdbRef(db, '/'), updates);
  }

  async setPath(path: string, value: any) {
    const db = getDatabase();
    await rtdbSet(rtdbRef(db, path), value);
  }

  // =====================
  // ===== LISTENERS =====
  // Methods that attach realtime listeners (return unsubscribe handles or Observables)
  // =====================

  async listenRoomStream(
    roomId: string,
    handlers: {
      onAdd?: (msgKey: string, data: any, isNew: boolean) => void;
      onChange?: (msgKey: string, data: any) => void;
      onRemove?: (msgKey: string) => void;
    }
  ) {
    const roomRef = ref(this.db, `chats/${roomId}`);

    const snapshot = await get(roomRef);
    const existing = snapshot.val() || {};

    if (handlers.onAdd) {
      const items = Object.entries(existing).map(([k, v]: any) => ({
        key: k,
        val: v,
      }));
      // console.log("handlers in onAdd", items)
      items.sort((a, b) => (a.val.timestamp || 0) - (b.val.timestamp || 0));
      items.forEach((i) => handlers.onAdd!(i.key, i.val, false));
    }

    const addedHandler = onChildAdded(roomRef, (snap) => {
      const key = snap.key!;
      const val = snap.val();
      const currentMessagesMap = new Map(this._messages$.value);
      const existingMessages = currentMessagesMap.get(roomId) || [];
      const existingKeys = new Set(existingMessages.map((m) => m.msgId));
      if (existingKeys.has(key)) {
        return;
      }
      console.log('new message added');
      handlers.onAdd?.(key, val, true); // isNew = true
    });

    const changedHandler = onChildChanged(roomRef, (snap) => {
      handlers.onChange?.(snap.key!, snap.val());
    });

    const removedHandler = onChildRemoved(roomRef, (snap) => {
      handlers.onRemove?.(snap.key!);
    });

    return () => {
      off(roomRef, 'child_added', addedHandler);
      off(roomRef, 'child_changed', changedHandler);
      off(roomRef, 'child_removed', removedHandler);
    };
  }

  /** Listen to messages in a room as an Observable of message arrays */
  listenForMessages(roomId: string): Observable<any[]> {
    return new Observable((observer) => {
      const messagesRef = ref(this.db, `chats/${roomId}`);
      const off = onValue(messagesRef, (snapshot) => {
        const data = snapshot.val();
        const messages = data
          ? Object.entries(data).map(([key, val]) => ({ key, ...(val as any) }))
          : [];
        observer.next(messages);
      });

      // return teardown
      return () => {
        try {
          off();
        } catch (e) {}
      };
    });
  }

  /** Listen to single pinned message for room (callback style) */
  listenToPinnedMessage(
    roomId: string,
    callback: (pinnedMessage: PinnedMessage | null) => void
  ) {
    const pinRef = ref(this.db, `pinnedMessages/${roomId}`);
    return onValue(pinRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as PinnedMessage);
      } else {
        callback(null);
      }
    });
  }

  listenToUnreadCount(roomId: string, userId: string): Observable<number> {
    return new Observable((observer) => {
      const unreadRef = ref(this.db, `unreadCounts/${roomId}/${userId}`);
      const off = onValue(unreadRef, (snapshot) => {
        const val = snapshot.val();
        observer.next(val || 0);
      });
      return () => {
        try {
          off();
        } catch (e) {}
      };
    });
  }

  getUnreadCountOnce(roomId: string, userId: string): Promise<number> {
    return firstValueFrom(
      this.listenToUnreadCount(roomId, userId).pipe(take(1))
    );
  }

  async sendMessage(msg: Partial<IMessage & { attachment?: any }>) {
    try {
      const { attachment, translations, ...message } = msg || {};
      const { localUrl, ...restAttachment } = attachment || {
        localUrl: undefined,
      };

      const roomId = this.currentChat?.roomId as string;
      const members =
        this.currentChat?.members || (roomId ? roomId.split('_') : []);

      const encryptedText = await this.encryptionService.encrypt(
        msg.text as string
      );

      const messageToSave: Partial<IMessage> = {
        ...message,
        status: 'sent',
        roomId,
        text: msg.text,
        translations: translations || undefined,
        receipts: {
          read: { status: false, readBy: [] },
          delivered: { status: false, deliveredTo: [] },
        },
      };

      console.log({ messageToSave });

      const meta: Partial<IChatMeta> = {
        type: this.currentChat?.type || 'private',
        lastmessageAt: message.timestamp as string,
        lastmessageType: attachment ? restAttachment.type : 'text',
        lastmessage: encryptedText || '',
      };

      // ✅ FIX: Check if receiver has chat open before incrementing unread
      for (const member of members) {
        const ref = rtdbRef(this.db, `userchats/${member}/${roomId}`);
        const idxSnap = await rtdbGet(ref);

        // Check if receiver is online AND has this chat open
        const isReceiverOnline = !!this.membersPresence.get(member)?.isOnline;
        const hasReceiverOpenedChat = await this.hasUserOpenedChat(
          member,
          roomId
        );

        // Only increment unread if:
        // 1. Not the sender
        // 2. Receiver doesn't have chat open OR is offline
        const shouldIncrementUnread =
          member !== this.senderId &&
          (!hasReceiverOpenedChat || !isReceiverOnline);

        if (!idxSnap.exists()) {
          await rtdbSet(ref, {
            ...meta,
            isArhived: false,
            isPinned: false,
            isLocked: false,
            unreadCount: shouldIncrementUnread ? 1 : 0,
          });
        } else {
          await rtdbUpdate(ref, {
            ...meta,
            ...(shouldIncrementUnread && {
              unreadCount: (idxSnap.val().unreadCount || 0) + 1,
            }),
          });
        }
      }

      let cdnUrl = '';
      let previewUrl: string | null = null;

      const hasAttachment =
        !!attachment && Object.keys(restAttachment || {}).length > 0;

      if (hasAttachment) {
        if (restAttachment.mediaId) {
          const res: any = await firstValueFrom(
            this.apiService.getDownloadUrl(restAttachment.mediaId)
          );
          cdnUrl = res?.status ? res.downloadUrl : '';
        }

        if (localUrl) {
          previewUrl = await this.fileSystemService.getFilePreview(localUrl);
        }
      }

      const messagesRef = ref(this.db, `chats/${roomId}/${message.msgId}`);
      await rtdbSet(messagesRef, {
        ...messageToSave,
        ...(hasAttachment ? { attachment: { ...restAttachment, cdnUrl } } : {}),
        text: encryptedText,
        ...(translations ? { translations } : {}),
      });

      for (const member of members) {
        if (member === this.senderId) continue;
        const isReceiverOnline = !!this.membersPresence.get(member)?.isOnline;
        if (isReceiverOnline) {
          this.markAsDelivered(message.msgId as string, member);
          console.log('Mark delivered triggered (receiver online)');
        }
      }

      const uiMsg: Partial<IMessage> = {
        ...messageToSave,
        ...(hasAttachment && (localUrl || cdnUrl)
          ? {
              attachment: {
                ...restAttachment,
                localUrl: previewUrl || localUrl,
                cdnUrl,
              },
            }
          : {}),
        isMe: true,
      };
      this.pushMsgToChat(uiMsg);

      if (hasAttachment) {
        this.sqliteService.saveAttachment({
          ...restAttachment,
          localUrl: previewUrl || localUrl,
          cdnUrl,
        });
      }

      this.sqliteService.saveMessage({
        ...messageToSave,
        ownerId: this.senderId,
        isMe: true,
      } as IMessage & { ownerId: string });
    } catch (error) {
      console.error('Error in sending message', error);
    }
  }

  /**
   * Check if a user currently has a specific chat open
   * Uses Firebase presence to track active chats
   */
  private async hasUserOpenedChat(
    userId: string,
    roomId: string
  ): Promise<boolean> {
    try {
      const activeChatRef = rtdbRef(this.db, `activeChats/${userId}`);
      const snapshot = await rtdbGet(activeChatRef);

      if (!snapshot.exists()) {
        return false;
      }

      const activeRoomId = snapshot.val();
      return activeRoomId === roomId;
    } catch (error) {
      console.warn('Error checking active chat:', error);
      return false;
    }
  }

  async sendForwardMessage(
    forwardedMsg: any,
    receiverId: string
  ): Promise<void> {
    try {
      console.log('📤 Forwarding message to:', receiverId);
      console.log('📤 Forwarding message to:', forwardedMsg);

      const { attachment, translations, ...message } = forwardedMsg || {};
      const { localUrl, ...restAttachment } = attachment || {
        localUrl: undefined,
      };

      // Generate room ID for sender and receiver
      const roomId = this.getRoomIdFor1To1(this.senderId as string, receiverId);
      const members = [this.senderId, receiverId];

      // Encrypt the text
      let encryptedText = '';
      if (forwardedMsg.text) {
        encryptedText = forwardedMsg.text.startsWith('ENC:')
          ? forwardedMsg.text
          : await this.encryptionService.encrypt(forwardedMsg.text);
      }

      // Generate new message ID and timestamp for forwarded message
      // const newMsgId = push(ref(this.db, `chats/${roomId}`)).key as string;
      const newMsgId = uuidv4();
      // const timestamp = new Date().toISOString();
      const timestamp = Date.now();

      const messageToSave: Partial<IMessage> = {
        msgId: newMsgId,
        roomId,
        // sender: this.senderId,
        sender_name: this.authService.authData?.name || '',
        receiver_id: receiverId,
        sender: this.senderId || '',
        timestamp,
        status: 'sent',
        isForwarded: true,
        text: forwardedMsg.text || '',
        translations: translations || null,
        receipts: {
          read: { status: false, readBy: [] },
          delivered: { status: false, deliveredTo: [] },
        },
      };

      console.log({ messageToSave });

      // Update chat meta for both members
      const meta: Partial<IChatMeta> = {
        type: 'private',
        lastmessageAt: timestamp,
        lastmessageType: attachment ? restAttachment.type : 'text',
        lastmessage: encryptedText || '',
      };

      for (const member of members) {
        const userChatRef = rtdbRef(this.db, `userchats/${member}/${roomId}`);
        const idxSnap = await rtdbGet(userChatRef);

        if (!idxSnap.exists()) {
          await rtdbSet(userChatRef, {
            ...meta,
            isArchived: false,
            isPinned: false,
            isLocked: false,
            unreadCount: member === this.senderId ? 0 : 1,
          });
        } else {
          await rtdbUpdate(userChatRef, {
            ...meta,
            ...(member !== this.senderId && {
              unreadCount: (idxSnap.val().unreadCount || 0) + 1,
            }),
          });
        }
      }

      let cdnUrl = '';
      let previewUrl: string | null = null;

      const hasAttachment =
        !!attachment && Object.keys(restAttachment || {}).length > 0;

      // Handle attachment if present
      if (hasAttachment) {
        if (restAttachment.mediaId) {
          const res: any = await firstValueFrom(
            this.apiService.getDownloadUrl(restAttachment.mediaId)
          );
          cdnUrl = res?.status ? res.downloadUrl : '';
        }

        if (localUrl) {
          previewUrl = await this.fileSystemService.getFilePreview(localUrl);
        }
      }

      // Save message to Firebase
      const messagesRef = rtdbRef(this.db, `chats/${roomId}/${newMsgId}`);
      await rtdbSet(messagesRef, {
        ...messageToSave,
        ...(hasAttachment ? { attachment: { ...restAttachment, cdnUrl } } : {}),
        text: encryptedText,
        ...(translations ? { translations } : {}),
      });

      // Mark as delivered if receiver is online
      const isReceiverOnline = !!this.membersPresence.get(receiverId)?.isOnline;
      if (isReceiverOnline) {
        this.markAsDelivered(newMsgId, receiverId, roomId);
        console.log('✅ Mark delivered triggered (receiver online)');
      }

      await this.pushMessageToRoomChat({...messageToSave, ...(hasAttachment ? { attachment: { ...restAttachment, cdnUrl } } : {}),}, roomId)

      await this.sqliteService.saveMessage({
        ...messageToSave,
        ownerId: this.senderId,
        isMe: true,
      } as IMessage & { ownerId: string });

      // Save to SQLite
      if (hasAttachment) {
        await this.sqliteService.saveAttachment({
          ...restAttachment,
          localUrl: previewUrl || localUrl,
          cdnUrl,
        });
      }

      console.log('✅ Forward message sent successfully to', receiverId);
    } catch (error) {
      console.error('❌ Error in sending forward message:', error);
      throw error;
    }
  }

  pushMessageToRoomChat(msg:any, roomId : string){
    try {
      // console.log(msg.attachment)
      const existing = new Map(this._messages$?.value || []);
      const currentMessages =
        existing.get(roomId as string) ;
        if(!currentMessages) return;
      const messageIdSet = new Set(currentMessages.map((m) => m.msgId));
      if (messageIdSet.has(msg.msgId)) return;
      currentMessages?.push({
        ...msg,
        attachment: msg?.attachment
          ? {
              ...msg.attachment,
              cdnUrl: msg.attachment.cdnUrl.replace(/[?#].*$/, ''),
            }
          : null,
        isMe: msg.sender === this.senderId,
      });
      existing.set(
        this.currentChat?.roomId as string,
        currentMessages as IMessage[]
      );

      console.log({ currentMessages });
      // return
      this._messages$.next(existing);
    } catch (error) {
      
    }
  }

  getUserLanguage(userId: string | number) {
    const url = `${this.baseUrl}/get-language/${userId}`;
    const headers = new HttpHeaders({
      Accept: 'application/json',
    });

    return this.http.get<any>(url, { headers }).pipe(
      map((res: any) => {
        // Expected format: { user_id: "52", language: "hi" }
        if (res && res.language) {
          return { language: res.language.trim() };
        }

        // Some APIs wrap data in a 'data' field
        if (res?.data?.language) {
          return { language: res.data.language.trim() };
        }

        // Fallback if nothing found
        console.warn('Unexpected response structure:', res);
        return null;
      }),
      catchError((err) => {
        console.error('❌ getUserLanguage API error:', err);
        return of(null);
      })
    );
  }

  // Pinned message operations
  async pinMessage(message: PinnedMessage) {
    const key = message.roomId;
    const pinRef = ref(this.db, `pinnedMessages/${key}`);
    const snapshot = await get(pinRef);

    const pinData = {
      roomId: message.roomId,
      messageId: message.messageId,
      pinnedBy: message.pinnedBy,
      pinnedAt: Date.now(),
      scope: 'global',
    };

    try {
      if (snapshot.exists()) {
        await update(pinRef, pinData);
      } else {
        await set(pinRef, pinData);
      }
      const messageRef = ref(
        this.db,
        `chats/${message.roomId}/${message.messageId}`
      );
      await update(messageRef, {
        isPinned: true,
        // pinnedAt: Date.now(),
        // pinnedBy: message.pinnedBy
      });
    } catch (error) {
      console.error('❌ Error pinning message:', error);
      throw error;
    }
  }
  async unpinMessage(message: IMessage) {
    try {
      const roomId = message.roomId;
      const messageId = message.msgId;

      const pinRef = ref(this.db, `pinnedMessages/${roomId}`);
      await remove(pinRef);

      const messageRef = ref(this.db, `chats/${roomId}/${messageId}`);
      await update(messageRef, {
        isPinned: false,
        // pinnedAt: null,
        // pinnedBy: null
      });

      // this is for local state
      // const localMsg = this.allMessage?.find(m => m.msgId === messageId);
      // if (localMsg) {
      //   localMsg.isPinned = false;
      // }
    } catch (error) {
      console.error('❌ Error unpinning message:', error);
      throw error;
    }
  }

  async getPinnedMessage(roomId: string): Promise<PinnedMessage | null> {
    try {
      const pinRef = ref(this.db, `pinnedMessages/${roomId}`);
      const snapshot = await get(pinRef);

      if (snapshot.exists()) {
        return snapshot.val() as PinnedMessage;
      }
      return null;
    } catch (error) {
      console.error('Error getting pinned message:', error);
      return null;
    }
  }

  async editMessage(
    roomId: string,
    msgId: string,
    newText: string
  ): Promise<void> {
    try {
      if (!roomId || !msgId || !newText.trim()) {
        throw new Error('editMessageInDb: Missing required parameters');
      }

      const encryptedText = await this.encryptionService.encrypt(
        newText.trim()
      );
      const msgRef = rtdbRef(this.db, `chats/${roomId}/${msgId}`);

      await rtdbUpdate(msgRef, {
        text: encryptedText,
        isEdit: true,
        editedAt: Date.now(),
      });

      console.log(`✅ Message ${msgId} updated successfully in ${roomId}`);
    } catch (err) {
      console.error('❌ editMessageInDb error:', err);
      throw err;
    }
  }

  // Group and community operations
  // async createGroup(
  //   groupId: string,
  //   groupName: string,
  //   members: any[],
  //   currentUserId: string
  // ) {
  //   const groupRef = ref(this.db, `groups/${groupId}`);

  //   const currentUser = members.find((m) => m.user_id === currentUserId);
  //   const currentUserName = currentUser?.name || 'Unknown';

  //   const groupData = {
  //     name: groupName,
  //     groupId,
  //     description: 'Hey I am using Telldemm',
  //     createdBy: currentUserId,
  //     createdByName: currentUserName,
  //     createdAt: Date.now(),
  //     members: members.reduce((acc, member) => {
  //       acc[member.user_id] = {
  //         name: member.name,
  //         phone_number: member.phone_number,
  //         status: 'active',
  //         role: member.user_id === currentUserId ? 'admin' : 'member',
  //       };
  //       return acc;
  //     }, {}),
  //     membersCount: members.length,
  //   };

  //   await set(groupRef, groupData);
  // }

  async createGroup({
    groupId,
    groupName,
    members,
  }: {
    groupId: string;
    groupName: string;
    members: Array<{ userId: string; username: string; phoneNumber?: string }>;
  }) {
    try {
      if (!this.senderId) throw new Error('createGroup: senderId not set');
      const now = Date.now();
      const membersObj: Record<string, IGroupMember> = {};
      const memberIds = members.map((m) => m.userId);
      for (const m of members) {
        membersObj[m.userId] = {
          username: m.username,
          phoneNumber: m.phoneNumber ?? '',
          isActive: true,
        };
      }

      membersObj[this.senderId] = {
        username: this.authService.authData?.name as string,
        phoneNumber: this.authService.authData?.phone_number as string,
        isActive: true,
      };

      const groupDataForRTDB: IGroup = {
        roomId: groupId,
        title: groupName,
        description: 'Hey I am using Telldemm',
        adminIds: [this.senderId],
        createdBy: this.senderId,
        createdAt: now,
        members: membersObj,
        type: 'group',
        isArchived: false,
        isPinned: false,
        isLocked: false,
      };

      // --- 3️⃣ Chat metadata for /userchats/{userId}/{groupId}
      const chatMeta: IChatMeta = {
        type: 'group',
        lastmessageAt: now,
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
      };

      const updates: Record<string, any> = {};
      updates[`/groups/${groupId}`] = groupDataForRTDB;

      for (const member of Object.keys(membersObj)) {
        updates[`/userchats/${member}/${groupId}`] = chatMeta;
      }
      await rtdbUpdate(rtdbRef(this.db, '/'), updates);

      const convo: IConversation = {
        roomId: groupId,
        title: groupName,
        type: 'group',
        avatar: '',
        members: memberIds,
        adminIds: [this.senderId],
        createdAt: new Date(now),
        updatedAt: new Date(now),
        lastMessage: chatMeta.lastmessage,
        lastMessageType: chatMeta.lastmessageType,
        lastMessageAt: new Date(now),
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        isMyself: true,
      };

      try {
        await this.sqliteService.createConversation({
          ...convo,
          ownerId: this.senderId,
        });
      } catch (e) {
        console.warn('SQLite conversation save failed:', e);
      }
      // const existingConvs = this._conversations$.value;
      // this._conversations$.next([...existingConvs, convo]);
      console.log(
        `✅ Group "${groupName}" created successfully with ${members.length} members.`
      );
    } catch (err) {
      console.error('Error creating group:', err);
      throw err;
    }
  }

  async updateBackendGroupId(groupId: string, backendGroupId: string) {
    const groupRef = ref(this.db, `groups/${groupId}/backendGroupId`);
    await set(groupRef, backendGroupId);
  }

  async getGroupAdminIds(groupId: string): Promise<string[]> {
    try {
      const adminIdsRef = ref(this.db, `groups/${groupId}/adminIds`);
      const snapshot = await get(adminIdsRef);
      return snapshot.exists() ? snapshot.val() : [];
    } catch (error) {
      console.error('Error fetching admin IDs:', error);
      return [];
    }
  }

  /**
   * Check if a user is admin in a group
   */
  async isUserAdmin(groupId: string, userId: string): Promise<boolean> {
    try {
      const adminIds = await this.getGroupAdminIds(groupId);
      return adminIds.includes(String(userId));
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  /**
   * Make a user admin in a group
   */
  async makeGroupAdmin(groupId: string, userId: string): Promise<boolean> {
    try {
      const adminIdsRef = ref(this.db, `groups/${groupId}/adminIds`);

      // Get current adminIds
      const snapshot = await get(adminIdsRef);
      const currentAdminIds: string[] = snapshot.exists() ? snapshot.val() : [];

      // Add new admin if not already present
      if (!currentAdminIds.includes(String(userId))) {
        currentAdminIds.push(String(userId));
        await set(adminIdsRef, currentAdminIds);
      }

      return true;
    } catch (error) {
      console.error('Error making user admin:', error);
      return false;
    }
  }

  /**
   * Remove admin privileges from a user
   */
  async dismissGroupAdmin(groupId: string, userId: string): Promise<boolean> {
    try {
      const adminIdsRef = ref(this.db, `groups/${groupId}/adminIds`);

      // Get current adminIds
      const snapshot = await get(adminIdsRef);
      const currentAdminIds: string[] = snapshot.exists() ? snapshot.val() : [];

      // Remove admin
      const updatedAdminIds = currentAdminIds.filter(
        (id) => String(id) !== String(userId)
      );
      await set(adminIdsRef, updatedAdminIds);

      return true;
    } catch (error) {
      console.error('Error dismissing admin:', error);
      return false;
    }
  }

  /**
   * Get admin check details for action sheet
   */
  async getAdminCheckDetails(
    groupId: string,
    currentUserId: string,
    targetUserId: string
  ) {
    try {
      const adminIds = await this.getGroupAdminIds(groupId);

      return {
        adminIds,
        isCurrentUserAdmin: adminIds.includes(String(currentUserId)),
        isTargetUserAdmin: adminIds.includes(String(targetUserId)),
        isSelf: String(targetUserId) === String(currentUserId),
      };
    } catch (error) {
      console.error('Error getting admin check details:', error);
      return {
        adminIds: [],
        isCurrentUserAdmin: false,
        isTargetUserAdmin: false,
        isSelf: false,
      };
    }
  }

  async createCommunity({
    communityId,
    communityName,
    description,
    createdBy,
    avatar = '',
    privacy = 'invite_only',
  }: {
    communityId: string;
    communityName: string;
    description?: string;
    createdBy: string;
    avatar?: string;
    privacy?: 'public' | 'invite_only';
  }): Promise<{
    communityId: string;
    announcementGroupId: string;
    generalGroupId: string;
  }> {
    try {
      if (!createdBy)
        throw new Error('createCommunity: createdBy (userId) is required');

      const now = Date.now();
      const announcementGroupId = `${communityId}_announcement`;
      const generalGroupId = `${communityId}_general`;

      // Get creator profile info
      let creatorProfile: { username?: string; phoneNumber?: string } = {};
      try {
        const user = this.currentUsers.find((u) => u.userId === createdBy);
        if (user) {
          creatorProfile.username = user.username || '';
          creatorProfile.phoneNumber = user.phoneNumber || '';
        } else {
          // Fallback to API if not in current users
          const userSnap = await get(ref(this.db, `users/${createdBy}`));
          if (userSnap.exists()) {
            const u = userSnap.val();
            creatorProfile.username = u.name || u.username || '';
            creatorProfile.phoneNumber = u.phone_number || u.phoneNumber || '';
          }
        }
      } catch (err) {
        console.warn('Failed to fetch creator profile, using fallback', err);
        creatorProfile.username = this.authService.authData?.name || 'User';
        creatorProfile.phoneNumber =
          this.authService.authData?.phone_number || '';
      }

      // 1️⃣ Community member details
      const communityMemberDetails: ICommunityMember = {
        username: creatorProfile.username || '',
        phoneNumber: creatorProfile.phoneNumber || '',
        isActive: true,
        joinedAt: now,
        role: 'admin',
      };

      // 2️⃣ Group member details (for announcement and general groups)
      const groupMemberDetails: IGroupMember = {
        username: creatorProfile.username || '',
        phoneNumber: creatorProfile.phoneNumber || '',
        isActive: true,
      };

      // 3️⃣ Community data structure
      const communityData: ICommunity = {
        roomId: communityId,
        title: communityName,
        description: description || 'Hey, I am using Telldemm',
        avatar: avatar || '',
        adminIds: [createdBy],
        createdBy,
        createdAt: now,
        members: {
          [createdBy]: communityMemberDetails,
        },
        groups: {
          [announcementGroupId]: true,
          [generalGroupId]: true,
        },
        type: 'community',
        isArchived: false,
        isPinned: false,
        isLocked: false,
        privacy,
        settings: {
          whoCanCreateGroups: 'admins',
          announcementPosting: 'adminsOnly',
        },
      };

      // 4️⃣ Announcement Group structure
      const announcementGroupData: IGroup = {
        roomId: announcementGroupId,
        title: 'Announcements',
        description: 'Important announcements for the community',
        avatar: '',
        adminIds: [createdBy],
        createdBy,
        createdAt: now,
        members: {
          [createdBy]: groupMemberDetails,
        },
        type: 'group',
        isArchived: false,
        isPinned: false,
        isLocked: false,
        communityId, // Link to parent community
      };

      // 5️⃣ General Group structure
      const generalGroupData: IGroup = {
        roomId: generalGroupId,
        title: 'General',
        description: 'General discussion for community members',
        avatar: '',
        adminIds: [createdBy],
        createdBy,
        createdAt: now,
        members: {
          [createdBy]: groupMemberDetails,
        },
        type: 'group',
        isArchived: false,
        isPinned: false,
        isLocked: false,
        communityId, // Link to parent community
      };

      // 6️⃣ Chat metadata for userchats (community entry)
      const communityChatMeta: ICommunityChatMeta = {
        type: 'community',
        lastmessageAt: now,
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        communityGroups: [announcementGroupId, generalGroupId],
      };

      // 7️⃣ Chat metadata for announcement group
      const announcementChatMeta: IChatMeta = {
        type: 'group',
        lastmessageAt: now,
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
      };

      // 8️⃣ Chat metadata for general group
      const generalChatMeta: IChatMeta = {
        type: 'group',
        lastmessageAt: now,
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
      };

      // 9️⃣ Build atomic updates object
      const updates: Record<string, any> = {};

      // Community node
      updates[`/communities/${communityId}`] = communityData;

      // Groups nodes
      updates[`/groups/${announcementGroupId}`] = announcementGroupData;
      updates[`/groups/${generalGroupId}`] = generalGroupData;

      // User's chat list - community
      updates[`/userchats/${createdBy}/${communityId}`] = communityChatMeta;

      // User's chat list - announcement group
      updates[`/userchats/${createdBy}/${announcementGroupId}`] =
        announcementChatMeta;

      // User's chat list - general group
      updates[`/userchats/${createdBy}/${generalGroupId}`] = generalChatMeta;

         // ✅ User's joined communities node
      updates[`/usersInCommunity/${createdBy}/joinedCommunities/${communityId}`] = true;

      // 🔟 Apply all updates atomically
      await rtdbUpdate(rtdbRef(this.db, '/'), updates);

      // 1️⃣1️⃣ Create local conversation entries for SQLite
      const communityConvo: IConversation = {
        roomId: communityId,
        title: communityName,
        type: 'community',
        avatar: avatar || '',
        members: [createdBy],
        adminIds: [createdBy],
        createdAt: new Date(now),
        updatedAt: new Date(now),
        lastMessage: '',
        lastMessageType: 'text',
        lastMessageAt: new Date(now),
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        isMyself: true,
      };

      const announcementConvo: IConversation = {
        roomId: announcementGroupId,
        title: 'Announcements',
        type: 'group',
        communityId,
        avatar: '',
        members: [createdBy],
        adminIds: [createdBy],
        createdAt: new Date(now),
        updatedAt: new Date(now),
        lastMessage: '',
        lastMessageType: 'text',
        lastMessageAt: new Date(now),
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        isMyself: true,
      };

      const generalConvo: IConversation = {
        roomId: generalGroupId,
        title: 'General',
        type: 'group',
        communityId,
        avatar: '',
        members: [createdBy],
        adminIds: [createdBy],
        createdAt: new Date(now),
        updatedAt: new Date(now),
        lastMessage: '',
        lastMessageType: 'text',
        lastMessageAt: new Date(now),
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        isMyself: true,
      };

      // Save to SQLite
      try {
        await this.sqliteService.createConversation({
          ...communityConvo,
          ownerId: this.senderId as string,
        });
        await this.sqliteService.createConversation({
          ...announcementConvo,
          ownerId: this.senderId as string,
        });
        await this.sqliteService.createConversation({
          ...generalConvo,
          ownerId: this.senderId as string,
        });
      } catch (e) {
        console.warn('SQLite conversation save failed:', e);
      }

      // Update local conversations observable
      // const existingConvs = this._conversations$.value;
      // this._conversations$.next([...existingConvs, communityConvo, announcementConvo, generalConvo]);

      console.log(
        `✅ Community "${communityName}" created successfully with Announcement and General groups.`
      );

      return {
        communityId,
        announcementGroupId,
        generalGroupId,
      };
    } catch (err) {
      console.error('Error creating community:', err);
      throw err;
    }
  }

  /**
   * Get community details by ID
   */
  // async getCommunityDetails(communityId: string): Promise<any | null> {
  //   try {
  //     if (!communityId) return null;

  //     const communityRef = rtdbRef(this.db, `communities/${communityId}`);
  //     const snapshot = await rtdbGet(communityRef);

  //     if (!snapshot.exists()) {
  //       console.warn(`Community ${communityId} not found`);
  //       return null;
  //     }

  //     return snapshot.val();
  //   } catch (error) {
  //     console.error('getCommunityDetails error:', error);
  //     return null;
  //   }
  // }

  async getCommunityDetails(
    communityId: string,
    onUpdate?: (data: any) => void
  ): Promise<any | null> {
    try {
      if (!communityId) return null;

      const communityRef = rtdbRef(this.db, `communities/${communityId}`);

      // ---- 1) GET initial snapshot once ----
      const snapshot = await rtdbGet(communityRef);

      if (!snapshot.exists()) {
        console.warn(`Community ${communityId} not found`);
        return null;
      }

      const initialData = snapshot.val();

      // ---- 2) LISTEN for updates if callback provided ----
      if (onUpdate) {
        onValue(communityRef, (snap) => {
          if (snap.exists()) {
            onUpdate(snap.val());
          }
        });
      }

      return initialData;
    } catch (error) {
      console.error('getCommunityDetails error:', error);
      return null;
    }
  }

  /**
   * Get all groups in a community with full details
   */
  async getCommunityGroupsWithDetails(
    communityId: string,
    currentUserId?: string
  ): Promise<{
    announcementGroup: any | null;
    generalGroup: any | null;
    otherGroups: any[];
    memberGroups: any[];
    availableGroups: any[];
  }> {
    try {
      if (!communityId) {
        return {
          announcementGroup: null,
          generalGroup: null,
          otherGroups: [],
          memberGroups: [],
          availableGroups: [],
        };
      }

      // Get community data to fetch group IDs
      const communityRef = rtdbRef(this.db, `communities/${communityId}`);
      const commSnap = await rtdbGet(communityRef);

      if (!commSnap.exists()) {
        return {
          announcementGroup: null,
          generalGroup: null,
          otherGroups: [],
          memberGroups: [],
          availableGroups: [],
        };
      }

      const communityData = commSnap.val();
      const groupsObj = communityData.groups || {};
      const groupIds = Object.keys(groupsObj);

      let announcementGroup: any = null;
      let generalGroup: any = null;
      const otherGroups: any[] = [];
      const memberGroups: any[] = [];
      const availableGroups: any[] = [];

      // Fetch each group's details
      for (const groupId of groupIds) {
        try {
          const groupRef = rtdbRef(this.db, `groups/${groupId}`);
          const groupSnap = await rtdbGet(groupRef);

          if (!groupSnap.exists()) continue;

          const groupData = groupSnap.val();

          const groupObj = {
            id: groupId,
            roomId: groupId,
            name: groupData.title || groupData.name || 'Unnamed group',
            title: groupData.title || groupData.name || 'Unnamed group',
            type: groupData.type || 'group',
            description: groupData.description || '',
            avatar: groupData.avatar || '',
            membersCount: groupData.members
              ? Object.keys(groupData.members).length
              : 0,
            members: groupData.members || {},
            createdBy: groupData.createdBy || '',
            createdAt: groupData.createdAt || Date.now(),
            adminIds: groupData.adminIds || [],
            communityId: groupData.communityId || communityId,
          };

          // Check if current user is a member
          const isMember =
            currentUserId && groupObj.members
              ? Object.prototype.hasOwnProperty.call(
                  groupObj.members,
                  currentUserId
                )
              : false;

          // Categorize groups
          if (groupData.title === 'Announcements') {
            announcementGroup = groupObj;
          } else if (groupData.title === 'General') {
            generalGroup = groupObj;
          } else {
            otherGroups.push(groupObj);

            if (isMember) {
              memberGroups.push(groupObj);
            } else {
              availableGroups.push(groupObj);
            }
          }
        } catch (err) {
          console.error(`Error fetching group ${groupId}:`, err);
        }
      }

      // Sort groups alphabetically
      otherGroups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      memberGroups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      availableGroups.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );

      return {
        announcementGroup,
        generalGroup,
        otherGroups,
        memberGroups,
        availableGroups,
      };
    } catch (error) {
      console.error('getCommunityGroupsWithDetails error:', error);
      return {
        announcementGroup: null,
        generalGroup: null,
        otherGroups: [],
        memberGroups: [],
        availableGroups: [],
      };
    }
  }

  /**
   * Join a group in community
   */
  async joinCommunityGroup(
    groupId: string,
    userId: string,
    userData: {
      username: string;
      phoneNumber: string;
    }
  ): Promise<{ success: boolean; message: string; groupName?: string }> {
    try {
      if (!groupId || !userId) {
        return { success: false, message: 'Invalid group ID or user ID' };
      }

      const groupRef = rtdbRef(this.db, `groups/${groupId}`);
      const groupSnap = await rtdbGet(groupRef);

      if (!groupSnap.exists()) {
        return { success: false, message: 'Group not found' };
      }

      const groupData = groupSnap.val();

      // Check if already a member
      if (
        groupData.members &&
        Object.prototype.hasOwnProperty.call(groupData.members, userId)
      ) {
        return {
          success: false,
          message: 'You are already a member',
          groupName: groupData.title || groupData.name,
        };
      }

      // Prepare member details
      const memberDetails = {
        username: userData.username || '',
        phoneNumber: userData.phoneNumber || '',
        isActive: true,
      };

      const updates: Record<string, any> = {};

      // Add member to group
      updates[`/groups/${groupId}/members/${userId}`] = memberDetails;

      // Add group to user's chat list
      updates[`/userchats/${userId}/${groupId}`] = {
        type: 'group',
        lastmessageAt: Date.now(),
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
      };

      await rtdbUpdate(rtdbRef(this.db, '/'), updates);

      return {
        success: true,
        message: 'Successfully joined group',
        groupName: groupData.title || groupData.name,
      };
    } catch (error) {
      console.error('joinCommunityGroup error:', error);
      return {
        success: false,
        message: 'Failed to join group. Please try again.',
      };
    }
  }

  /**
   * Leave a community group
   */
  async leaveCommunityGroup(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!groupId || !userId) {
        return { success: false, message: 'Invalid group ID or user ID' };
      }

      const groupRef = rtdbRef(this.db, `groups/${groupId}`);
      const groupSnap = await rtdbGet(groupRef);

      if (!groupSnap.exists()) {
        return { success: false, message: 'Group not found' };
      }

      const groupData = groupSnap.val();
      const memberData = groupData.members?.[userId];

      if (!memberData) {
        return {
          success: false,
          message: 'You are not a member of this group',
        };
      }

      const updates: Record<string, any> = {};

      // Remove member from group
      updates[`/groups/${groupId}/members/${userId}`] = null;

      // Add to past members
      updates[`/groups/${groupId}/pastmembers/${userId}`] = {
        ...memberData,
        removedAt: new Date().toISOString(),
      };

      // Remove from user's chat list
      updates[`/userchats/${userId}/${groupId}`] = null;

      await rtdbUpdate(rtdbRef(this.db, '/'), updates);

      return { success: true, message: 'Successfully left group' };
    } catch (error) {
      console.error('leaveCommunityGroup error:', error);
      return {
        success: false,
        message: 'Failed to leave group. Please try again.',
      };
    }
  }

  async exitCommunity(
    communityId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!communityId || !userId) {
        return { success: false, message: 'Invalid community ID or user ID' };
      }

      // Get community details
      const communityRef = rtdbRef(this.db, `communities/${communityId}`);
      const communitySnap = await rtdbGet(communityRef);

      if (!communitySnap.exists()) {
        return { success: false, message: 'Community not found' };
      }

      const communityData = communitySnap.val();

      // Check if user is the creator
      if (communityData.createdBy === userId) {
        return {
          success: false,
          message:
            'Creator cannot exit the community. Please assign a new owner first.',
        };
      }

      // Check if user is a member
      if (!communityData.members?.[userId]) {
        return {
          success: false,
          message: 'You are not a member of this community',
        };
      }

      // Remove member from community
      const updates: Record<string, any> = {};
      updates[`/communities/${communityId}/members/${userId}`] = null;

      // Update member count
      const currentMemberCount = Object.keys(
        communityData.members || {}
      ).length;
      updates[`/communities/${communityId}/memberCount`] = Math.max(
        0,
        currentMemberCount - 1
      );

      await rtdbUpdate(rtdbRef(this.db, '/'), updates);

      console.log(`✅ User ${userId} removed from community ${communityId}`);

      return {
        success: true,
        message: 'Successfully exited the community',
      };
    } catch (error) {
      console.error('exitCommunity error:', error);
      return {
        success: false,
        message: 'Failed to exit community. Please try again.',
      };
    }
  }

  /**
   * Check if user is member of a community
   */
  async isUserCommunityMember(
    communityId: string,
    userId: string
  ): Promise<boolean> {
    try {
      if (!communityId || !userId) return false;

      const memberRef = rtdbRef(
        this.db,
        `communities/${communityId}/members/${userId}`
      );
      const snapshot = await rtdbGet(memberRef);

      return snapshot.exists();
    } catch (error) {
      console.error('isUserCommunityMember error:', error);
      return false;
    }
  }

  /**
   * Get community member count
   */
  async getCommunityMemberCount(communityId: string): Promise<number> {
    try {
      if (!communityId) return 0;

      const membersRef = rtdbRef(this.db, `communities/${communityId}/members`);
      const snapshot = await rtdbGet(membersRef);

      if (!snapshot.exists()) return 0;

      const members = snapshot.val();
      return Object.keys(members).length;
    } catch (error) {
      console.error('getCommunityMemberCount error:', error);
      return 0;
    }
  }

  /**
   * Check if user is admin of a community
   */
  async isUserCommunityAdmin(
    communityId: string,
    userId: string
  ): Promise<boolean> {
    try {
      if (!communityId || !userId) return false;

      const adminIdsRef = rtdbRef(
        this.db,
        `communities/${communityId}/adminIds`
      );
      const snapshot = await rtdbGet(adminIdsRef);

      if (!snapshot.exists()) return false;

      const adminIds: string[] = snapshot.val() || [];
      return adminIds.includes(String(userId));
    } catch (error) {
      console.error('isUserCommunityAdmin error:', error);
      return false;
    }
  }

  /**
   * Add group to community
   */
  async addGroupToCommunity(
    communityId: string,
    groupId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!communityId || !groupId) {
        return { success: false, message: 'Invalid community ID or group ID' };
      }

      const updates: Record<string, any> = {};

      // Add group to community's groups list
      updates[`/communities/${communityId}/groups/${groupId}`] = true;

      // Link community to group
      updates[`/groups/${groupId}/communityId`] = communityId;

      await rtdbUpdate(rtdbRef(this.db, '/'), updates);

      return {
        success: true,
        message: 'Group added to community successfully',
      };
    } catch (error) {
      console.error('addGroupToCommunity error:', error);
      return { success: false, message: 'Failed to add group to community' };
    }
  }

  /**
   * Remove group from community
   */
  async removeGroupFromCommunity(
    communityId: string,
    groupId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!communityId || !groupId) {
        return { success: false, message: 'Invalid community ID or group ID' };
      }

      const updates: Record<string, any> = {};

      // Remove group from community's groups list
      updates[`/communities/${communityId}/groups/${groupId}`] = null;

      // Remove community link from group
      updates[`/groups/${groupId}/communityId`] = null;

      await rtdbUpdate(rtdbRef(this.db, '/'), updates);

      return {
        success: true,
        message: 'Group removed from community successfully',
      };
    } catch (error) {
      console.error('removeGroupFromCommunity error:', error);
      return {
        success: false,
        message: 'Failed to remove group from community',
      };
    }
  }

  /**
   * Get community announcement group
   */
  async getCommunityAnnouncementGroup(
    communityId: string
  ): Promise<any | null> {
    try {
      if (!communityId) return null;

      const { announcementGroup } = await this.getCommunityGroupsWithDetails(
        communityId
      );
      return announcementGroup;
    } catch (error) {
      console.error('getCommunityAnnouncementGroup error:', error);
      return null;
    }
  }

  /**
   * Get community general group
   */
  async getCommunityGeneralGroup(communityId: string): Promise<any | null> {
    try {
      if (!communityId) return null;

      const { generalGroup } = await this.getCommunityGroupsWithDetails(
        communityId
      );
      return generalGroup;
    } catch (error) {
      console.error('getCommunityGeneralGroup error:', error);
      return null;
    }
  }

  // Add these functions to your FirebaseChatService class

  /**
   * Get all groups in a community (simple list with basic info)
   */
  async getCommunityGroupsList(communityId: string): Promise<
    Array<{
      id: string;
      name: string;
      title: string;
      type: string;
      membersCount: number;
      isSystemGroup: boolean;
    }>
  > {
    try {
      if (!communityId) return [];

      const communityRef = rtdbRef(this.db, `communities/${communityId}`);
      const commSnap = await rtdbGet(communityRef);

      if (!commSnap.exists()) return [];

      const communityData = commSnap.val();
      const groupsObj = communityData.groups || {};
      const groupIds = Object.keys(groupsObj);

      const groups: Array<{
        id: string;
        name: string;
        title: string;
        type: string;
        membersCount: number;
        isSystemGroup: boolean;
      }> = [];

      for (const groupId of groupIds) {
        try {
          const groupRef = rtdbRef(this.db, `groups/${groupId}`);
          const groupSnap = await rtdbGet(groupRef);

          if (!groupSnap.exists()) continue;

          const groupData = groupSnap.val();
          const title = groupData.title || groupData.name || 'Unnamed group';
          const type = groupData.type || 'group';

          // Check if it's a system group (Announcements or General)
          const isSystemGroup =
            title === 'Announcements' || title === 'General';

          groups.push({
            id: groupId,
            name: title,
            title: title,
            type: type,
            membersCount: groupData.members
              ? Object.keys(groupData.members).length
              : 0,
            isSystemGroup: isSystemGroup,
          });
        } catch (err) {
          console.error(`Error fetching group ${groupId}:`, err);
        }
      }

      // Sort: system groups first, then alphabetically
      groups.sort((a, b) => {
        if (a.isSystemGroup && !b.isSystemGroup) return -1;
        if (!a.isSystemGroup && b.isSystemGroup) return 1;
        return a.name.localeCompare(b.name);
      });

      return groups;
    } catch (error) {
      console.error('getCommunityGroupsList error:', error);
      return [];
    }
  }

  /**
   * Remove a group from community
   */
  async removeGroupFromCommunitys(
    communityId: string,
    groupId: string,
    options: {
      removeMembers: boolean;
      currentUserId?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    removedMembersCount?: number;
  }> {
    try {
      if (!communityId || !groupId) {
        return { success: false, message: 'Invalid community ID or group ID' };
      }

      const updates: Record<string, any> = {};

      // 1. Unlink group from community
      updates[`/communities/${communityId}/groups/${groupId}`] = null;
      updates[`/groups/${groupId}/communityId`] = null;

      // 2. Get community info
      const communityRef = rtdbRef(this.db, `communities/${communityId}`);
      const commSnap = await rtdbGet(communityRef);
      const communityData = commSnap.exists() ? commSnap.val() : null;
      const commCreatedBy = communityData?.createdBy || null;
      const existingCommMembers = communityData?.members || {};

      // 3. Get all groups in community (remaining after removal)
      const allGroupIds = Object.keys(communityData?.groups || {});
      const remainingGroupIds = allGroupIds.filter((gid) => gid !== groupId);

      // 4. Get members from remaining groups
      const remainingMembersSet = new Set<string>();
      for (const gid of remainingGroupIds) {
        try {
          const gRef = rtdbRef(this.db, `groups/${gid}`);
          const gSnap = await rtdbGet(gRef);
          if (gSnap.exists()) {
            const gData = gSnap.val();
            const members = gData.members || {};
            Object.keys(members).forEach((uid) => {
              if (uid) remainingMembersSet.add(uid);
            });
          }
        } catch (err) {
          console.warn(`Failed to load group ${gid}:`, err);
        }
      }

      // 5. Get members from the group being removed
      const removedGroupRef = rtdbRef(this.db, `groups/${groupId}`);
      const removedGroupSnap = await rtdbGet(removedGroupRef);
      const removedGroupData = removedGroupSnap.exists()
        ? removedGroupSnap.val()
        : null;
      const removedGroupMembers = removedGroupData?.members || {};
      const removedGroupMemberIds = Object.keys(removedGroupMembers);

      let removedMembersCount = 0;

      if (options.removeMembers) {
        // Remove members who are ONLY in the removed group (not in other groups)
        const membersToRemove: string[] = [];

        for (const uid of removedGroupMemberIds) {
          // Skip community creator
          if (uid === commCreatedBy) continue;

          // If member is not in any remaining group, remove from community
          if (!remainingMembersSet.has(uid)) {
            membersToRemove.push(uid);
          }
        }

        // Remove these members from community
        for (const uid of membersToRemove) {
          updates[`/communities/${communityId}/members/${uid}`] = null;
          updates[`/userchats/${uid}/${communityId}`] = null;
          removedMembersCount++;
        }

        // Remove from the specific group being removed
        for (const uid of membersToRemove) {
          updates[`/groups/${groupId}/members/${uid}`] = null;
          updates[`/userchats/${uid}/${groupId}`] = null;
        }

        // Find and update announcement group
        const announcementGroupId = await this.findCommunityAnnouncementGroupId(
          communityId
        );
        if (announcementGroupId) {
          for (const uid of membersToRemove) {
            updates[`/groups/${announcementGroupId}/members/${uid}`] = null;
            updates[`/userchats/${uid}/${announcementGroupId}`] = null;
          }
        }

        // Find and update general group
        const generalGroupId = await this.findCommunityGeneralGroupId(
          communityId
        );
        if (generalGroupId) {
          for (const uid of membersToRemove) {
            updates[`/groups/${generalGroupId}/members/${uid}`] = null;
            updates[`/userchats/${uid}/${generalGroupId}`] = null;
          }
        }

        // Update community member count
        const newMemberCount = Math.max(
          0,
          Object.keys(existingCommMembers).length - removedMembersCount
        );
        updates[`/communities/${communityId}/membersCount`] = newMemberCount;
      } else {
        // Keep all members, just unlink the group
        // Members stay in community and in remaining groups
        remainingMembersSet.forEach((uid) => {
          updates[`/communities/${communityId}/members/${uid}`] =
            existingCommMembers[uid] || { isActive: true };
        });
      }

      // Apply all updates
      await rtdbUpdate(rtdbRef(this.db, '/'), updates);

      return {
        success: true,
        message: 'Group removed from community successfully',
        removedMembersCount,
      };
    } catch (error) {
      console.error('removeGroupFromCommunity error:', error);
      return {
        success: false,
        message: 'Failed to remove group from community',
      };
    }
  }

  /**
   * Find announcement group ID in a community
   */
  async findCommunityAnnouncementGroupId(
    communityId: string
  ): Promise<string | null> {
    try {
      const groupIds = await this.getGroupsInCommunity(communityId);

      for (const groupId of groupIds) {
        const groupRef = rtdbRef(this.db, `groups/${groupId}`);
        const groupSnap = await rtdbGet(groupRef);

        if (groupSnap.exists()) {
          const groupData = groupSnap.val();
          if (
            groupData.title === 'Announcements' ||
            groupData.type === 'announcement'
          ) {
            return groupId;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('findCommunityAnnouncementGroupId error:', error);
      return null;
    }
  }

  /**
   * Find general group ID in a community
   */
  async findCommunityGeneralGroupId(
    communityId: string
  ): Promise<string | null> {
    try {
      const groupIds = await this.getGroupsInCommunity(communityId);

      for (const groupId of groupIds) {
        const groupRef = rtdbRef(this.db, `groups/${groupId}`);
        const groupSnap = await rtdbGet(groupRef);

        if (groupSnap.exists()) {
          const groupData = groupSnap.val();
          if (groupData.title === 'General' || groupData.type === 'general') {
            return groupId;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('findCommunityGeneralGroupId error:', error);
      return null;
    }
  }

  /**
   * Get community name/title
   */
  async getCommunityName(communityId: string): Promise<string> {
    try {
      const communityRef = rtdbRef(this.db, `communities/${communityId}`);
      const snapshot = await rtdbGet(communityRef);

      if (!snapshot.exists()) return '';

      const data = snapshot.val();
      return data.title || data.name || '';
    } catch (error) {
      console.error('getCommunityName error:', error);
      return '';
    }
  }

  /**
   * Add multiple groups to a community with all member syncing
   * ✅ UPDATED: Now adds community meta to all group members' userchats
   */
  async addGroupsToCommunity(params: {
    communityId: string;
    groupIds: string[];
    backendCommunityId?: string | null;
    currentUserId?: string;
  }): Promise<{
    success: boolean;
    message: string;
    addedMembersCount?: number;
    updatedAnnouncementGroup?: boolean;
  }> {
    try {
      const { communityId, groupIds, backendCommunityId, currentUserId } =
        params;

      if (!communityId || !groupIds?.length) {
        return {
          success: false,
          message: 'Community ID or group IDs missing',
        };
      }

      const updates: Record<string, any> = {};
      const newMemberIds = new Set<string>();

      // 1️⃣ Get community info first (to get existing meta)
      let communityInfo: any = null;
      try {
        communityInfo = await this.getCommunityInfo(communityId);
      } catch (err) {
        console.warn('Failed to load community info:', err);
      }

      // 2️⃣ Link groups to community and collect members
      for (const groupId of groupIds) {
        updates[`/communities/${communityId}/groups/${groupId}`] = true;
        updates[`/groups/${groupId}/communityId`] = communityId;

        try {
          const groupInfo: any = await this.getGroupInfo(groupId);

          // Backend sync if backendCommunityId provided
          if (backendCommunityId) {
            const backendGroupId =
              groupInfo?.backendGroupId ?? groupInfo?.backend_group_id ?? null;

            if (backendGroupId && currentUserId) {
              try {
                await firstValueFrom(
                  this.apiService.addGroupToCommunity(
                    backendCommunityId,
                    String(backendGroupId),
                    Number(currentUserId) || 0
                  )
                );
              } catch (apiErr) {
                console.warn(
                  `Backend API failed for group ${groupId}:`,
                  apiErr
                );
              }
            }
          }

          // Collect members from this group
          if (groupInfo?.members) {
            Object.keys(groupInfo.members).forEach((memberId) => {
              if (memberId) newMemberIds.add(memberId);
            });
          }
        } catch (err) {
          console.warn(`Failed to process group ${groupId}:`, err);
        }
      }

      // 3️⃣ Merge with existing community members
      let existingMembersObj: any = {};
      try {
        existingMembersObj = communityInfo?.members || {};
        Object.keys(existingMembersObj).forEach((memberId) => {
          if (memberId) newMemberIds.add(memberId);
        });
      } catch (err) {
        console.warn('Failed to load existing community members:', err);
      }

      // 4️⃣ Get announcement and general group IDs (for communityGroups array)
      const announcementGroupId = await this.findCommunityAnnouncementGroupId(
        communityId
      );
      const generalGroupId = await this.findCommunityGeneralGroupId(
        communityId
      );

      // Build communityGroups array (system groups + newly added groups)
      const communityGroups: string[] = [];
      if (announcementGroupId) communityGroups.push(announcementGroupId);
      if (generalGroupId) communityGroups.push(generalGroupId);
      groupIds.forEach((gid) => communityGroups.push(gid));

      // 5️⃣ Create community chat meta for new members
      const communityChatMeta: ICommunityChatMeta = {
        type: 'community',
        lastmessageAt: Date.now(),
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        communityGroups: communityGroups,
      };

      // 6️⃣ Add all members to community + userchats
      newMemberIds.forEach((userId) => {
        // Add to community members
        updates[`/communities/${communityId}/members/${userId}`] = {
          isActive: true,
          joinedAt: Date.now(),
        };

        // 🆕 Add community meta to user's chats (THIS IS THE KEY CHANGE!)
        updates[`/userchats/${userId}/${communityId}`] = communityChatMeta;

        // Legacy index (optional, for backward compatibility)
        updates[
          `/usersInCommunity/${userId}/joinedCommunities/${communityId}`
        ] = true;
      });

      // 7️⃣ Update community member count
      updates[`/communities/${communityId}/membersCount`] = newMemberIds.size;

      // 8️⃣ Update announcement group
      let updatedAnnouncementGroup = false;
      if (announcementGroupId) {
        try {
          const annGroupInfo = await this.getGroupInfo(announcementGroupId);
          const existingAnnMembers = annGroupInfo?.members || {};
          const annMemberSet = new Set<string>(Object.keys(existingAnnMembers));

          newMemberIds.forEach((userId) => {
            if (!annMemberSet.has(userId)) {
              updates[`/groups/${announcementGroupId}/members/${userId}`] = {
                isActive: true,
                username: '',
                phoneNumber: '',
              };
              updates[`/userchats/${userId}/${announcementGroupId}`] = {
                type: 'group',
                lastmessageAt: Date.now(),
                lastmessageType: 'text',
                lastmessage: '',
                unreadCount: 0,
                isArchived: false,
                isPinned: false,
                isLocked: false,
              };
              annMemberSet.add(userId);
            }
          });

          updates[`/groups/${announcementGroupId}/membersCount`] =
            annMemberSet.size;
          updatedAnnouncementGroup = true;
        } catch (err) {
          console.warn('Failed to update announcement group:', err);
        }
      }

      // 9️⃣ Update general group
      if (generalGroupId) {
        try {
          const genGroupInfo = await this.getGroupInfo(generalGroupId);
          const existingGenMembers = genGroupInfo?.members || {};
          const genMemberSet = new Set<string>(Object.keys(existingGenMembers));

          newMemberIds.forEach((userId) => {
            if (!genMemberSet.has(userId)) {
              updates[`/groups/${generalGroupId}/members/${userId}`] = {
                isActive: true,
                username: '',
                phoneNumber: '',
              };
              updates[`/userchats/${userId}/${generalGroupId}`] = {
                type: 'group',
                lastmessageAt: Date.now(),
                lastmessageType: 'text',
                lastmessage: '',
                unreadCount: 0,
                isArchived: false,
                isPinned: false,
                isLocked: false,
              };
              genMemberSet.add(userId);
            }
          });

          updates[`/groups/${generalGroupId}/membersCount`] = genMemberSet.size;
        } catch (err) {
          console.warn('Failed to update general group:', err);
        }
      }

      // 🔟 Apply all updates atomically
      await this.bulkUpdate(updates);

      console.log(
        `✅ Added ${groupIds.length} groups with ${newMemberIds.size} members`
      );
      console.log(
        `✅ Community meta added to ${newMemberIds.size} members' userchats`
      );

      return {
        success: true,
        message: `Successfully added ${groupIds.length} group(s) with ${newMemberIds.size} member(s)`,
        addedMembersCount: newMemberIds.size,
        updatedAnnouncementGroup,
      };
    } catch (error) {
      console.error('addGroupsToCommunity error:', error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to add groups to community',
      };
    }
  }

  /**
   * Get backend community ID from Firebase community ID
   */
  async getBackendCommunityId(
    firebaseCommunityId: string
  ): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.apiService.getCommunityById(firebaseCommunityId)
      );
      return res?.community?.community_id != null
        ? String(res.community.community_id)
        : null;
    } catch (error) {
      console.error('getBackendCommunityId error:', error);
      return null;
    }
  }

  /**
   * Collect all unique members from multiple groups
   */
  async collectMembersFromGroups(groupIds: string[]): Promise<Set<string>> {
    const memberIds = new Set<string>();

    for (const groupId of groupIds) {
      try {
        const groupInfo = await this.getGroupInfo(groupId);
        if (groupInfo?.members) {
          Object.keys(groupInfo.members).forEach((memberId) => {
            if (memberId) memberIds.add(memberId);
          });
        }
      } catch (err) {
        console.warn(`Failed to collect members from group ${groupId}:`, err);
      }
    }

    return memberIds;
  }

  /**
   * Sync members to community announcement and general groups
   */
  async syncMembersToCommunitySystemGroups(
    communityId: string,
    memberIds: Set<string>
  ): Promise<{ announcementSynced: boolean; generalSynced: boolean }> {
    const result = { announcementSynced: false, generalSynced: false };
    const updates: Record<string, any> = {};

    try {
      // Sync to announcement group
      const announcementGroupId = await this.findCommunityAnnouncementGroupId(
        communityId
      );
      if (announcementGroupId) {
        const annInfo = await this.getGroupInfo(announcementGroupId);
        const existingMembers = annInfo?.members || {};
        const memberSet = new Set<string>(Object.keys(existingMembers));

        memberIds.forEach((userId) => {
          if (!memberSet.has(userId)) {
            updates[`/groups/${announcementGroupId}/members/${userId}`] = {
              isActive: true,
              username: '',
              phoneNumber: '',
            };
            updates[`/userchats/${userId}/${announcementGroupId}`] = {
              type: 'group',
              lastmessageAt: Date.now(),
              lastmessageType: 'text',
              lastmessage: '',
              unreadCount: 0,
              isArchived: false,
              isPinned: false,
              isLocked: false,
            };
            memberSet.add(userId);
          }
        });

        updates[`/groups/${announcementGroupId}/membersCount`] = memberSet.size;
        result.announcementSynced = true;
      }

      // Sync to general group
      const generalGroupId = await this.findCommunityGeneralGroupId(
        communityId
      );
      if (generalGroupId) {
        const genInfo = await this.getGroupInfo(generalGroupId);
        const existingMembers = genInfo?.members || {};
        const memberSet = new Set<string>(Object.keys(existingMembers));

        memberIds.forEach((userId) => {
          if (!memberSet.has(userId)) {
            updates[`/groups/${generalGroupId}/members/${userId}`] = {
              isActive: true,
              username: '',
              phoneNumber: '',
            };
            updates[`/userchats/${userId}/${generalGroupId}`] = {
              type: 'group',
              lastmessageAt: Date.now(),
              lastmessageType: 'text',
              lastmessage: '',
              unreadCount: 0,
              isArchived: false,
              isPinned: false,
              isLocked: false,
            };
            memberSet.add(userId);
          }
        });

        updates[`/groups/${generalGroupId}/membersCount`] = memberSet.size;
        result.generalSynced = true;
      }

      if (Object.keys(updates).length > 0) {
        await this.bulkUpdate(updates);
      }
    } catch (error) {
      console.error('syncMembersToCommunitySystemGroups error:', error);
    }

    return result;
  }

  // =====================
  // ====== QUERYING =====
  // Read-only helpers that fetch one-off data
  // =====================

  async getPinnedMessageOnce(roomId: string): Promise<PinnedMessage | null> {
    return this.getPinnedMessage(roomId);
  }

  async getGroupInfo(groupId: string): Promise<any> {
    const snapshot = await get(child(ref(this.db), `groups/${groupId}`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async getGroupsForUser(userId: string): Promise<string[]> {
    const snapshot = await get(child(ref(this.db), 'groups'));
    const allGroups = snapshot.val();
    const userGroups: string[] = [];

    if (allGroups) {
      Object.entries(allGroups).forEach(([groupId, groupData]: any) => {
        if (groupData.members?.[userId]) {
          userGroups.push(groupId);
        }
      });
    }

    return userGroups;
  }

  // async fetchGroupWithProfiles(
  //   groupId: string
  // ): Promise<{ groupName: string; groupMembers: any[] }> {
  //   try {
  //     const db = getDatabase();
  //     const groupRef = ref(db, `groups/${groupId}`);
  //     const snapshot = await get(groupRef);

  //     if (!snapshot.exists()) {
  //       return { groupName: 'Group', groupMembers: [] };
  //     }

  //     const groupData = snapshot.val();
  //     const groupName = groupData.name || 'Group';

  //     const rawMembers = groupData.members || {};
  //     const members: any[] = Object.entries(rawMembers).map(
  //       ([userId, userData]: [string, any]) => ({
  //         user_id: userId,
  //         phone_number: userData?.phone_number,
  //         ...userData,
  //       })
  //     );

  //     const membersWithProfiles = await Promise.all(
  //       members.map(async (m) => {
  //         try {
  //           const res: any = await firstValueFrom(
  //             this.service.getUserProfilebyId(String(m.user_id))
  //           );
  //           m.avatar =
  //             res?.profile || m.avatar || 'assets/images/default-avatar.png';
  //           m.name = m.name || res?.name || `User ${m.user_id}`;
  //           m.publicKeyHex = res?.publicKeyHex || m.publicKeyHex || null;
  //           m.phone_number =
  //             m.phone_number || res?.phone_number || m.phone_number;
  //         } catch (err) {
  //           console.warn(
  //             `fetchGroupWithProfiles: failed to fetch profile for ${m.user_id}`,
  //             err
  //           );
  //           m.avatar = m.avatar || 'assets/images/default-avatar.png';
  //           m.name = m.name || `User ${m.user_id}`;
  //         }
  //         return m;
  //       })
  //     );

  //     return { groupName, groupMembers: membersWithProfiles };
  //   } catch (err) {
  //     console.error('fetchGroupWithProfiles error', err);
  //     return { groupName: 'Group', groupMembers: [] };
  //   }
  // }

  async fetchGroupWithProfiles(groupId: string): Promise<{
    groupName: string;
    groupMembers: Array<{
      user_id: string;
      username: string;
      phone: string;
      phoneNumber: string;
      avatar?: string;
      role?: string;
      isActive?: boolean;
      publicKeyHex?: string | null;
    }>;
  }> {
    const db = getDatabase();
    const groupRef = ref(db, `groups/${groupId}`);

    try {
      const snapshot = await get(groupRef);
      if (!snapshot.exists()) {
        console.warn(`Group ${groupId} not found`);
        return { groupName: 'Unknown Group', groupMembers: [] };
      }

      const groupData = snapshot.val() as IGroup;
      const groupName = groupData.title || 'Unnamed Group';
      const members = groupData.members || {};

      // Get admin IDs
      const adminIds = groupData.adminIds || [];

      const memberPromises = Object.entries(members).map(
        async ([userId, memberData]) => {
          try {
            const userProfileRes: any = await firstValueFrom(
              this.service.getUserProfilebyId(userId)
            );

            return {
              user_id: userId,
              username: memberData.username,
              phone: memberData.phoneNumber,
              phoneNumber: memberData.phoneNumber,
              avatar: userProfileRes?.profile || 'assets/images/user.jfif',
              isActive: memberData.isActive ?? true,
              role: adminIds.includes(userId) ? 'admin' : 'member',
              publicKeyHex: null,
            };
          } catch (err) {
            console.warn(`Failed to fetch profile for user ${userId}`, err);
            return {
              user_id: userId,
              username: memberData.username,
              phone: memberData.phoneNumber,
              phoneNumber: memberData.phoneNumber,
              avatar: 'assets/images/user.jfif',
              isActive: memberData.isActive ?? true,
              role: adminIds.includes(userId) ? 'admin' : 'member',
              publicKeyHex: null,
            };
          }
        }
      );

      const groupMembers = await Promise.all(memberPromises);

      return {
        groupName,
        groupMembers: groupMembers.filter((m) => m.isActive !== false),
      };
    } catch (error) {
      console.error('Error fetching group with profiles:', error);
      return { groupName: 'Error Loading Group', groupMembers: [] };
    }
  }

  async getGroupsInCommunity(communityId: string): Promise<string[]> {
    const snapshot = await get(
      child(ref(this.db), `communities/${communityId}/groups`)
    );
    const groups = snapshot.val();
    return groups ? Object.keys(groups) : [];
  }

  async getGroupsInCommunityWithInfo(communityId: string): Promise<any[]> {
    const groupIds = await this.getGroupsInCommunity(communityId);
    const result: any[] = [];

    for (const gid of groupIds) {
      const gSnap = await get(child(ref(this.db), `groups/${gid}`));
      if (gSnap.exists()) {
        const g = gSnap.val();
        result.push({
          id: gid,
          name: g.name,
          type: g.type || 'normal',
          createdBy: g.createdBy,
          createdAt: g.createdAt,
          membersCount:
            g.membersCount || (g.members ? Object.keys(g.members).length : 0),
        });
      }
    }

    return result;
  }

  async getUserCommunities(userId: string): Promise<string[]> {
    const snapshot = await get(
      child(ref(this.db), `usersInCommunity/${userId}/joinedCommunities`)
    );
    const communities = snapshot.val();
    return communities ? Object.keys(communities) : [];
  }

  async getCommunityInfo(communityId: string) {
    const snap = await get(child(ref(this.db), `communities/${communityId}`));
    return snap.exists() ? snap.val() : null;
  }

  async updateCommunityInfo(
    communityId: string,
    newName: string,
    newDescription: string
  ): Promise<boolean> {
    try {
      const db = getDatabase();
      const communityRef = ref(db, `communities/${communityId}`);

      // Update community details
      const updates: any = {
        title: newName,
        name: newName, // some communities might use 'name' instead of 'title'
        description: newDescription,
        updatedAt: new Date().toISOString(),
      };

      await update(communityRef, updates);

      console.log('✅ Community updated successfully:', communityId);

      // Optional: Update local cache if you maintain one
      // this.refreshCommunityInConversations(communityId, newName);

      return true;
    } catch (error) {
      console.error('❌ Error updating community info:', error);
      return false;
    }
  }

  async addMembersToCommunity(
    communityId: string,
    userIds: string[]
  ): Promise<void> {
    try {
      // 1. Get community data to find announcement group ID
      const communityRef = ref(this.db, `communities/${communityId}`);
      // const groupRef = ref(this.db, `groups`);
      const communitySnap = await get(communityRef);

      if (!communitySnap.exists()) {
        throw new Error('Community not found');
      }

      const communityData = communitySnap.val();
      // console.log({communityData})
      // const announcementGroupId = communityData.announcementGroupId;       //this will find
      // const generalGroupId = communityData.generalGroupId;

      // if (!announcementGroupId) {
      //   throw new Error('Announcement group not found for this community');
      // }

      // 2. Prepare updates object
      const updates: any = {};
      const timestamp = Date.now();

      // Build communityGroups array for ICommunityMeta
      const communityGroups: string[] = [];
      // if (announcementGroupId) communityGroups.push(announcementGroupId);
      // if (generalGroupId) communityGroups.push(generalGroupId);

      // Get all groups in community
      // const allGroupsObj = communityData.groups || {};
      // Object.keys(allGroupsObj).forEach(gid => {
      //   if (gid && !communityGroups.includes(gid)) {
      //     communityGroups.push(gid);
      //   }
      // });

      // Create community chat meta (similar to createCommunity)
      const communityChatMeta: ICommunityChatMeta = {
        type: 'community',
        lastmessageAt: timestamp,
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
        communityGroups: communityGroups,
      };

      // Create announcement group chat meta
      const announcementChatMeta: IChatMeta = {
        type: 'group',
        lastmessageAt: timestamp,
        lastmessageType: 'text',
        lastmessage: '',
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        isLocked: false,
      };

      // Add members to community and their userchats
      for (const userId of userIds) {
        // Add to community members
        updates[`communities/${communityId}/members/${userId}`] = {
          joinedAt: timestamp,
          role: 'member',
          userId: userId,
          isActive: true,
          username: '',
          phoneNumber: '',
        };

        // ✅ Add community chat meta to user's userchats (NOT users node)
        updates[`userchats/${userId}/${communityId}`] = communityChatMeta;
      }

      // Add members to announcement group and their userchats
      for (const userId of userIds) {
        // Add to announcement group members
        // updates[`groups/${announcementGroupId}/members/${userId}`] = {
        //   joinedAt: timestamp,
        //   role: 'member',
        //   userId: userId,
        //   isActive: true,
        //   username: '',
        //   phoneNumber: ''
        // };
        // ✅ Add announcement group chat meta to user's userchats (NOT users node)
        //   updates[`userchats/${userId}/${announcementGroupId}`] = announcementChatMeta;
      }

      // Update member counts
      const currentCommunityMemberCount = communityData.memberCount || 0;
      updates[`communities/${communityId}/memberCount`] =
        currentCommunityMemberCount + userIds.length;

      // Get announcement group data for member count
      // const announcementGroupRef = ref(this.db, `groups/${announcementGroupId}`);
      // const announcementGroupSnap = await get(announcementGroupRef);

      // if (announcementGroupSnap.exists()) {
      //   const announcementGroupData = announcementGroupSnap.val();
      //   const currentGroupMemberCount = announcementGroupData.memberCount || 0;
      //   updates[`groups/${announcementGroupId}/memberCount`] = currentGroupMemberCount + userIds.length;
      // }

      // 3. Execute all updates atomically
      await update(ref(this.db), updates);

      console.log(
        `Successfully added ${userIds.length} members to community and announcement group`
      );
    } catch (error) {
      console.error('Error adding members to community:', error);
      throw error;
    }
  }

  async getGroupMembers(groupId: string): Promise<string[]> {
    const snapshot = await get(ref(this.db, `groups/${groupId}/members`));
    const membersObj = snapshot.val();
    return membersObj ? Object.keys(membersObj) : [];
  }

  // =====================
  // ====== UNREADS ======
  // Helpers for unread counters
  // =====================
  incrementUnreadCount(roomId: string, receiverId: string) {
    const unreadRef = ref(this.db, `unreadCounts/${roomId}/${receiverId}`);
    return runTransaction(unreadRef, (count) => (count || 0) + 1);
  }

  resetUnreadCount(roomId: string, userId: string) {
    const unreadRef = ref(this.db, `unreadCounts/${roomId}/${userId}`);
    return set(unreadRef, 0);
  }

  // =====================
  // ====== MARKING ======
  // Delivery/read status helpers
  // =====================
  markDelivered(roomId: string, messageKey: string) {
    const messageRef = ref(this.db, `chats/${roomId}/${messageKey}`);
    update(messageRef, { delivered: true, deliveredAt: Date.now() });
  }

  markRead(roomId: string, messageKey: string) {
    const messageRef = ref(this.db, `chats/${roomId}/${messageKey}`);
    update(messageRef, { read: true, readAt: Date.now() });
  }

  async markRoomAsRead(roomId: string, userId: string): Promise<number> {
    const db = getDatabase();
    const snap = await get(rtdbRef(db, `chats/${roomId}`));
    if (!snap.exists()) {
      try {
        await update(rtdbRef(db, `/unreadCounts/${roomId}`), { [userId]: 0 });
      } catch {}
      return 0;
    }

    const now = Date.now();
    const msgs = snap.val() || {};
    const multi: Record<string, any> = {};
    let changed = 0;

    Object.entries(msgs).forEach(([key, m]: any) => {
      const isForMe = String(m?.receiver_id) === String(userId);
      const alreadyRead = !!m?.read || (m?.readBy && m.readBy[userId]);

      if (isForMe && !alreadyRead) {
        multi[`chats/${roomId}/${key}/read`] = true;
        multi[`chats/${roomId}/${key}/readAt`] = now;
        multi[`chats/${roomId}/${key}/readBy/${userId}`] = now;
        changed++;
      }
    });

    multi[`unreadCounts/${roomId}/${userId}`] = 0;

    if (Object.keys(multi).length) {
      await update(rtdbRef(db, '/'), multi);
    }
    return changed;
  }

  async markManyRoomsAsRead(
    roomIds: string[],
    userId: string
  ): Promise<number> {
    let total = 0;
    for (const rid of roomIds) {
      try {
        total += await this.markRoomAsRead(rid, userId);
      } catch {}
    }
    return total;
  }

  async markRoomAsUnread(
    roomId: string,
    userId: string,
    minCount: number = 1
  ): Promise<void> {
    const db = getDatabase();

    let current = 0;
    try {
      const snap = await get(rtdbRef(db, `unreadCounts/${roomId}/${userId}`));
      current = snap.exists() ? Number(snap.val() || 0) : 0;
    } catch {}

    const updates: Record<string, any> = {};
    updates[`unreadChats/${userId}/${roomId}`] = true;
    if (current < minCount) {
      updates[`unreadCounts/${roomId}/${userId}`] = minCount;
    }

    await update(rtdbRef(db, '/'), updates);
  }

  async markManyRoomsAsUnread(
    roomIds: string[],
    userId: string,
    minCount: number = 1
  ): Promise<void> {
    const db = getDatabase();
    const updates: Record<string, any> = {};
    const nowMin = Math.max(1, minCount);

    for (const roomId of roomIds) {
      updates[`unreadChats/${userId}/${roomId}`] = true;
      updates[`unreadCounts/${roomId}/${userId}`] = nowMin;
    }

    await update(rtdbRef(db, '/'), updates);
  }

  async removeMarkAsUnread(roomId: string, userId: string): Promise<void> {
    const db = getDatabase();
    const updates: Record<string, any> = {};
    updates[`unreadChats/${userId}/${roomId}`] = null;
    updates[`unreadCounts/${roomId}/${userId}`] = 0;
    await update(rtdbRef(db, '/'), updates);
  }

  async removeManyMarksAsUnread(
    roomIds: string[],
    userId: string
  ): Promise<void> {
    const db = getDatabase();
    const updates: Record<string, any> = {};
    for (const roomId of roomIds) {
      updates[`unreadChats/${userId}/${roomId}`] = null;
      updates[`unreadCounts/${roomId}/${userId}`] = 0;
    }
    await update(rtdbRef(db, '/'), updates);
  }

  async getGroupDetails(groupId: string): Promise<{
    adminIds: string[];
    members: Array<Record<string, any>>;
  } | null> {
    try {
      if (!groupId) return null;
      const groupRef = ref(this.db, `groups/${groupId}`);
      const snap = await get(groupRef);
      if (!snap.exists()) return null;

      const groupData: any = snap.val() || {};

      // normalize adminIds (support array / object / single value)
      let adminIdsRaw = groupData.adminIds ?? groupData.adminIdsList ?? null;
      let adminIds: string[] = [];

      if (Array.isArray(adminIdsRaw)) {
        adminIds = adminIdsRaw.filter(Boolean).map((id) => String(id));
      } else if (adminIdsRaw && typeof adminIdsRaw === 'object') {
        // could be { "0": "78" } or { "78": true }
        const vals = Object.values(adminIdsRaw);
        // if values are booleans (true), fall back to keys
        const areValuesBoolean =
          vals.length && vals.every((v) => typeof v === 'boolean');
        if (areValuesBoolean) {
          adminIds = Object.keys(adminIdsRaw).map((k) => String(k));
        } else {
          adminIds = vals.filter(Boolean).map((v) => String(v));
        }
      } else if (adminIdsRaw !== null && adminIdsRaw !== undefined) {
        adminIds = [String(adminIdsRaw)];
      }

      // dedupe and return
      adminIds = Array.from(new Set(adminIds));

      // normalize members (object -> array of { user_id, ...data })
      const membersObj: Record<string, any> = groupData.members || {};
      const members = Object.keys(membersObj).map((userId) => ({
        user_id: String(userId),
        ...(membersObj[userId] || {}),
      }));

      return { adminIds, members };
    } catch (err) {
      console.error('getGroupDetails error', err);
      return null;
    }
  }

  /**
   * Get past members of a group
   */
  async getPastMembers(groupId: string): Promise<
    Array<{
      user_id: string;
      username: string;
      phoneNumber: string;
      isActive: boolean;
      removedAt: string;
    }>
  > {
    try {
      if (!groupId) {
        console.warn('getPastMembers: groupId is required');
        return [];
      }

      const pastMembersRef = rtdbRef(this.db, `groups/${groupId}/pastmembers`);
      const snapshot = await rtdbGet(pastMembersRef);

      if (!snapshot.exists()) {
        console.log(`No past members found for group ${groupId}`);
        return [];
      }

      const data = snapshot.val();
      const pastMembers = Object.keys(data).map((user_id) => ({
        user_id,
        username: data[user_id].username || 'Unknown',
        phoneNumber: data[user_id].phoneNumber || '',
        isActive: data[user_id].isActive || false,
        removedAt: data[user_id].removedAt || '',
        ...data[user_id],
      }));

      console.log(
        `✅ Loaded ${pastMembers.length} past members for group ${groupId}`
      );
      return pastMembers;
    } catch (error) {
      console.error('❌ Error loading past members:', error);
      return [];
    }
  }

  async addMembersToGroup(roomId: string, userIds: string[]) {
    try {
      const memberRef = rtdbRef(this.db, `groups/${roomId}/members`);
      const snap = await rtdbGet(memberRef);
      const members: IGroup['members'] = snap.val();
      const newMembers: IGroup['members'] = {};
      for (const userId of userIds) {
        console.log(this.currentUsers, 'this.currentUsers');
        const user = this.currentUsers.find((u) => u.userId == userId);
        console.log(user, 'this.currentUsers');
        newMembers[userId] = {
          isActive: true,
          phoneNumber: user?.phoneNumber as string,
          username: user?.username as string,
        };
      }
      console.log({ newMembers });
      await rtdbSet(memberRef, { ...members, ...newMembers });
    } catch (error) {
      console.error('Error adding members in group', error);
    }
  }

  async removeMembersToGroup(roomId: string, userIds: string[]) {
    try {
      // console.log("groupId and memmber.userId from firebase chat service", roomId, userIds)
      const memberRef = rtdbRef(this.db, `groups/${roomId}/members`);
      const pastMemberRef = rtdbRef(this.db, `groups/${roomId}/pastmembers`);

      // Fetch current members snapshot
      const snap = await rtdbGet(memberRef);
      const members: IGroup['members'] = snap.exists() ? snap.val() : {};

      if (!members || Object.keys(members).length === 0) {
        console.warn(`No members found for group ${roomId}`);
        return;
      }

      // Prepare updates
      const updates: Record<string, any> = {};

      for (const userId of userIds) {
        const member = members[userId];
        if (!member) continue;

        // updates[`groups/${roomId}/members/${userId}`] = {
        //   ...member,
        //   isActive: false,
        //   // status: 'removed',
        // };

        updates[`groups/${roomId}/members/${userId}`] = null;

        updates[`groups/${roomId}/pastmembers/${userId}`] = {
          ...member,
          removedAt: new Date().toISOString(),
        };
      }

      // Apply updates atomically
      await rtdbUpdate(rtdbRef(this.db), updates);

      console.log(
        `✅ Successfully removed ${userIds.length} members from group ${roomId}`
      );
    } catch (error) {
      console.error('❌ Error removing members from group:', error);
    }
  }

  async getBackendGroupId(firebaseGroupId: string): Promise<number | null> {
    try {
      const db = getDatabase();
      const groupRef = ref(db, `groups/${firebaseGroupId}/backendGroupId`);
      const snapshot = await get(groupRef);
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      console.error('Error getting backend group ID:', error);
      return null;
    }
  }

  async exitGroup(roomId: string, userIds: string[]) {
    try {
      // console.log("this exit group function is called", roomId, userIds)
      const memberRef = rtdbRef(this.db, `groups/${roomId}/members`);

      // Fetch current members snapshot
      const snap = await rtdbGet(memberRef);
      const members: IGroup['members'] = snap.exists() ? snap.val() : {};

      if (!members || Object.keys(members).length === 0) {
        console.warn(`No members found for group ${roomId}`);
        return;
      }

      // Prepare updates
      const updates: Record<string, any> = {};

      for (const userId of userIds) {
        const member = members[userId];
        if (!member) {
          console.warn(`Member ${userId} not found in group ${roomId}`);
          continue;
        }

        // Remove from members (set to null to delete)
        updates[`groups/${roomId}/members/${userId}`] = null;

        // Add to pastmembers with removedAt timestamp
        updates[`groups/${roomId}/pastmembers/${userId}`] = {
          ...member,
          removedAt: new Date().toISOString(),
        };
      }

      // Apply updates atomically
      await rtdbUpdate(rtdbRef(this.db), updates);

      console.log(
        `✅ Successfully exited ${userIds.length} members from group ${roomId}`
      );
    } catch (error) {
      console.error('❌ Error exiting group:', error);
      throw error; // Re-throw to handle in calling function
    }
  }

  // =====================
  // ===== DELETIONS =====
  // Message / Chat / Group deletions (soft/hard)
  // =====================

  //this function is new
  async deleteMessage(msgId: string, forEveryone: boolean = true) {
    try {
      const messageRef = rtdbRef(
        this.db,
        `chats/${this.currentChat?.roomId}/${msgId}`
      );

      // Get previous message
      const prev = await rtdbGet(messageRef);
      const prevMsg = prev.val();

      // Prepare deletedFor object
      let deletedForData: { everyone: boolean; users: string[] };

      if (forEveryone) {
        deletedForData = {
          everyone: true,
          users: prevMsg?.deletedFor?.users || [],
        };
        await update(messageRef, { deletedFor: deletedForData });
      } else {
        deletedForData = {
          everyone: !!prevMsg?.deletedFor?.everyone,
          users: [...(prevMsg?.deletedFor?.users || []), this.senderId],
        };
        await update(messageRef, { deletedFor: deletedForData });
      }

      // ✅ Update SQLite
      await this.updateLocalMessageDeletion(msgId, deletedForData);
      await this.sqliteService.permanentlyDeleteMessages([msgId]);
    } catch (error) {
      console.error('❌ Error deleting message:', error);
      throw error;
    }
  }

  async updateLastMessageInMeta(msg: IMessage & { attachment: IAttachment }) {
    try {
      console.log(
        'last message sdgffffffffffffffffffffffffffffffffffffffffffffffffff',
        msg
      );
      const encryptedText = await this.encryptionService.encrypt(
        msg.text as string
      );
      const meta: Partial<IChatMeta> = {
        type: this.currentChat?.type || 'private',
        lastmessageAt: new Date(msg.timestamp).getTime().toString() as string,
        lastmessageType: msg.attachment ? msg.attachment.type : 'text',
        lastmessage: encryptedText || '',
      };
      const ref = rtdbRef(this.db, `userchats/${this.senderId}/${msg.roomId}`);
      // const idxSnap = await rtdbGet(ref);
      await rtdbUpdate(ref, { ...meta });
    } catch (error) {
      console.log('somethiing went wrong', error);
    }
  }

  /**
   * Update message deletion in local SQLite
   */
  private async updateLocalMessageDeletion(
    msgId: string,
    deletedFor: { everyone: boolean; users: string[] }
  ) {
    try {
      await this.sqliteService.updateMessageDeletionStatus(msgId, deletedFor);
      console.log('✅ Message deletion updated in SQLite:', msgId);
    } catch (error) {
      console.error('❌ SQLite update error:', error);
    }
  }

  async clearChatForUser(roomId?: string): Promise<void> {
    try {
      const targetRoomId = roomId || this.currentChat?.roomId;

      if (!targetRoomId) {
        throw new Error('Room ID not found');
      }

      if (!this.senderId) {
        throw new Error('senderId not set');
      }

      // Get all messages from the room
      const messagesRef = rtdbRef(this.db, `chats/${targetRoomId}`);
      const snapshot = await rtdbGet(messagesRef);

      if (!snapshot.exists()) {
        console.log('No messages to clear');
        return;
      }

      const messages = snapshot.val();
      const updates: Record<string, any> = {};

      Object.keys(messages).forEach((msgId) => {
        const prevMsg = messages[msgId];
        const existingUsers = prevMsg?.deletedFor?.users || [];

        if (!existingUsers.includes(this.senderId)) {
          updates[`chats/${targetRoomId}/${msgId}/deletedFor/users`] = [
            ...existingUsers,
            this.senderId,
          ];
        }
      });

      // Reset unread count for this user
      updates[`unreadCounts/${targetRoomId}/${this.senderId}`] = 0;

      // Apply all updates atomically
      if (Object.keys(updates).length > 0) {
        await rtdbUpdate(rtdbRef(this.db), updates);
      }

      console.log(
        `✅ Chat cleared for user ${this.senderId} in room ${targetRoomId}`
      );
    } catch (error) {
      console.error('❌ Error clearing chat for user:', error);
      throw error;
    }
  }

  async deleteMessageForMe(
    roomId: string,
    key: string,
    userId: string
  ): Promise<void> {
    const db = getDatabase();
    const updates: any = {};
    updates[`/chats/${roomId}/${key}/deletedFor/${userId}`] = true;
    await update(ref(db), updates);
  }

  async deleteMessageForEveryone(
    roomId: string,
    key: string,
    performedBy: string,
    participantIds?: string[]
  ): Promise<void> {
    const db = getDatabase();
    const updates: any = {};

    updates[`/chats/${roomId}/${key}/deletedForEveryone`] = true;
    updates[`/chats/${roomId}/${key}/deletedBy`] = performedBy;
    updates[`/chats/${roomId}/${key}/deletedAt`] = Date.now();

    if (Array.isArray(participantIds)) {
      for (const uid of participantIds) {
        updates[`/chats/${roomId}/${key}/deletedFor/${uid}`] = true;
      }
    }

    await update(ref(db), updates);
  }

  async deleteChatForUser(roomId: string, userId: string): Promise<void> {
    try {
      const db = getDatabase();
      const chatsRef = rtdbRef(db, `chats/${roomId}`);
      const snapshot = await get(chatsRef);

      if (snapshot.exists()) {
        const messages = snapshot.val();
        const updates: any = {};

        Object.keys(messages).forEach((messageKey) => {
          updates[`chats/${roomId}/${messageKey}/deletedFor/${userId}`] = true;
        });

        await update(rtdbRef(db), updates);
      }

      await update(rtdbRef(db), {
        [`unreadCounts/${roomId}/${userId}`]: 0,
      });
    } catch (error) {
      console.error('❌ Error deleting chat:', error);
      throw error;
    }
  }

  async deleteChatPermanently(roomId: string): Promise<void> {
    try {
      const db = getDatabase();
      const updates: any = {};
      updates[`chats/${roomId}`] = null;
      updates[`unreadCounts/${roomId}`] = null;
      updates[`typing/${roomId}`] = null;
      await update(rtdbRef(db), updates);
    } catch (error) {
      console.error('❌ Error permanently deleting chat:', error);
      throw error;
    }
  }

  //new delete chats functions

  async deleteChats(roomIds: string[]): Promise<void> {
    try {
      if (!this.senderId) {
        throw new Error('senderId not set');
      }

      if (!Array.isArray(roomIds) || roomIds.length === 0) {
        console.error('RoomIds is not an array or empty');
        return;
      }

      const updates: Record<string, any> = {};

      for (const roomId of roomIds) {
        // Remove chat from user's chat list
        updates[`userchats/${this.senderId}/${roomId}`] = null;

        const chatsRef = rtdbRef(this.db, `chats/${roomId}`);
        const snapshot = await rtdbGet(chatsRef);

        if (snapshot.exists()) {
          const messages = snapshot.val();

          Object.keys(messages).forEach((messageKey) => {
            const message = messages[messageKey];
            const existingUsers = message?.deletedFor?.users || [];

            if (!existingUsers.includes(this.senderId)) {
              updates[`chats/${roomId}/${messageKey}/deletedFor/users`] = [
                ...existingUsers,
                this.senderId,
              ];
            }
          });
        }

        // Reset unread count for this user
        updates[`unreadCounts/${roomId}/${this.senderId}`] = 0;
      }

      await rtdbUpdate(rtdbRef(this.db), updates);

      // Update local state
      const existingConvs = this._conversations$.value.filter(
        (c) => !roomIds.includes(c.roomId)
      );
      this._conversations$.next(existingConvs);

      const messageMap = new Map(this._messages$.value);

      // Delete from SQLite (local storage only)
      for (const roomId of roomIds) {
        try {
          await this.sqliteService.deleteConversation?.(roomId);
          try {
            messageMap.delete(roomId);
          } catch (error) {
            console.log('message Map is empty/causing error');
          }
        } catch (sqlErr) {
          console.warn('SQLite deletion failed for', roomId, sqlErr);
        }
      }

      console.log(
        `✅ Successfully deleted ${roomIds.length} chat(s) for current user`
      );
    } catch (error) {
      console.error('❌ Error deleting chats:', error);
      throw error;
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    try {
      const db = getDatabase();
      const updates: any = {};
      updates[`groups/${groupId}`] = null;
      updates[`chats/${groupId}`] = null;
      updates[`unreadCounts/${groupId}`] = null;
      updates[`typing/${groupId}`] = null;
      await update(rtdbRef(db), updates);
    } catch (error) {
      console.error('❌ Error deleting group:', error);
      throw error;
    }
  }

  async sendMessageDirectly(
    msg: Partial<IMessage & { attachment?: any }>,
    receiverId: string
  ): Promise<void> {
    try {
      console.log('this message is called', msg.attachment);
      const { attachment, translations, ...message } = msg || {};
      const { localUrl, ...restAttachment } = attachment || { localUrl: null };

      const roomId = this.getRoomIdFor1To1(this.senderId as string, receiverId);
      const members = [this.senderId, receiverId];

      // Encrypt text
      const encryptedText = await this.encryptionService.encrypt(
        msg.text as string
      );

      const messageToSave: Partial<IMessage> = {
        ...message,
        status: 'sent',
        roomId,
        text: msg.text,
        translations: translations || null,
        receipts: {
          read: { status: false, readBy: [] },
          delivered: { status: false, deliveredTo: [] },
        },
      };

      // Prepare chat meta
      const meta: Partial<IChatMeta> = {
        type: 'private',
        lastmessageAt: message.timestamp as string,
        lastmessageType: attachment ? restAttachment.type : 'text',
        lastmessage: encryptedText || '',
      };

      // Update userchats for both sender and receiver
      for (const member of members) {
        const ref = rtdbRef(this.db, `userchats/${member}/${roomId}`);
        const idxSnap = await rtdbGet(ref);

        if (!idxSnap.exists()) {
          await rtdbSet(ref, {
            ...meta,
            isArchived: false,
            isPinned: false,
            isLocked: false,
            unreadCount: member === this.senderId ? 0 : 1,
          });
        } else {
          await rtdbUpdate(ref, {
            ...meta,
            ...(member !== this.senderId && {
              unreadCount: (idxSnap.val().unreadCount || 0) + 1,
            }),
          });
        }
      }

      let cdnUrl = '';
      let previewUrl: string | null = null;

      const hasAttachment =
        !!attachment && Object.keys(restAttachment || {}).length > 0;

      if (hasAttachment) {
        if (restAttachment.mediaId) {
          const res: any = await firstValueFrom(
            this.apiService.getDownloadUrl(restAttachment.mediaId)
          );
          cdnUrl = res?.status ? res.downloadUrl : '';
        }

        console.log('yes local url exist before', localUrl);
        if (localUrl) {
          // Save to sent folder
          console.log('yes local url exist after');
          // previewUrl = await this.fileSystemService.saveFileToSent(
          //   restAttachment.fileName,
          //   attachment.blob
          // );
          previewUrl = await this.fileSystemService.getFilePreview(localUrl);
        }
      }
      console.log({ previewUrl });

      // const localUrl = await this.FileService.getFilePreview(relativePath as string)

      // Save to RTDB
      const messagesRef = ref(this.db, `chats/${roomId}/${message.msgId}`);
      await rtdbSet(messagesRef, {
        ...messageToSave,
        ...(hasAttachment ? { attachment: { ...restAttachment, cdnUrl } } : {}),
        text: encryptedText,
        ...(translations ? { translations } : {}),
      });

      // Mark as delivered if receiver online
      const isReceiverOnline = !!this.membersPresence.get(receiverId)?.isOnline;
      if (isReceiverOnline) {
        this.markAsDelivered(message.msgId as string, receiverId, roomId);
      }

      // Save to SQLite (sender side)
      await this.sqliteService.saveMessage({
        ...messageToSave,
        ownerId: this.senderId,
        isMe: true,
      } as IMessage & { ownerId: string });

      if (hasAttachment) {
        await this.sqliteService.saveAttachment({
          ...restAttachment,
          localUrl: previewUrl || localUrl,
          cdnUrl,
        });
      }

      console.log('✅ Message sent directly to', receiverId);
    } catch (error) {
      console.error('❌ Error in sendMessageDirectly:', error);
      throw error;
    }
  }

  // =====================
  // ====== STATE ========
  // Forward message storage and selected message info used by UI
  // =====================
  setForwardMessage(messages: IMessage[]) {
    this.forwardMessages = messages;
  }

  getForwardMessages() {
    return this.forwardMessages;
  }

  clearForwardMessages() {
    this.forwardMessages = [];
  }

  setSelectedAttachment(msg: any) {
    this._selectedAttachment = msg;
    console.log('set selected attachment', this._selectedAttachment);
  }
  getSelectedAttachment() {
    return this._selectedAttachment;
  }
  clearSelectedAttachment() {
    this._selectedAttachment = null;
  }
  setSelectedMessageInfo(msg: any) {
    this._selectedMessageInfo = msg;
  }

  getSelectedMessageInfo(clearAfterRead = false): any {
    const m = this._selectedMessageInfo;
    if (clearAfterRead) this._selectedMessageInfo = null;
    return m;
  }

  // =====================
  // ======= LEGACY ======
  // commented out / previously used helpers preserved for reference
  // =====================

  // // async deleteChatForUser(userId: string, chat: { receiver_Id: string; group?: boolean; isCommunity?: boolean }) { ... }
}
