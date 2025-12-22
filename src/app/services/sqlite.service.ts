import { Injectable } from '@angular/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { defineCustomElements } from 'jeep-sqlite/loader';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { AttachmentPreviewPage } from '../pages/attachment-preview/attachment-preview.page';

/** ----------------- INTERFACES ----------------- **/
export interface IUser {
  userId: string;
  username: string;
  phoneNumber: string;
  lastSeen?: Date;
  avatar?: string;
  status?: string; //mapping of status
  isOnPlatform?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// export interface IMessage {
//   msgId: string;
//   roomId: string;
//   sender: string;
//   type: 'text' | 'image' | 'audio' | 'video' | 'pdf' | 'other';

//   text?: string;
//   localUrl?: string;
//   cdnUrl?: string;
//   mediaId?: string;
//   isMe?: boolean;
//   status?: 'failed' | 'pending' | 'sent' | 'delivered' | 'read';
//   timestamp: string | Date | number;
//   deletedFor?: {
//     everyone: boolean;
//     users: [];
//   };
//   reactions: { userId: string; emoji: string | null }[];
//   replyToMsgId: string;
//   isEdit: boolean;
//   isPinned? : boolean;
//   isForwarded?: boolean;
//   receipts?: {
//     read: {
//       status: boolean;
//       readBy: {
//         userId: string;
//         timestamp: string | number | Date;
//       }[];
//     };
//     delivered: {
//       status: boolean;
//       deliveredTo: {
//         userId: string;
//         timestamp: string | number | Date;
//       }[];
//     };
//   };
// }

export interface IMessage {
  msgId: string;
  roomId: string;
  sender: string;
  sender_name: string;
  receiver_id: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'pdf' | 'other';

  // the text that will be displayed as the message body (for translated-send this may be a translated text)
  text?: string;

  // optional structured translations payload
  translations?: {
    original: {
      code: string;
      label: string;
      text: string;
    };
    myLanguage?: {
      code: string;
      label: string;
      text: string;
    };
    receiverLanguage?: {
      code: string;
      label: string;
      text: string;
    };

    // newly added - support for "other language" translate module
    otherLanguage?: {
      code: string;
      label: string;
      text: string;
    };
  } | null;

  localUrl?: string;
  cdnUrl?: string;
  mediaId?: string;
  isMe?: boolean;
  status?: 'failed' | 'pending' | 'sent' | 'delivered' | 'read';
  timestamp: string | Date | number;
  deletedFor?: {
    everyone: boolean;
    users: [];
  };
  reactions: { userId: string; emoji: string | null }[];
  replyToMsgId: string;
  isEdit: boolean;
  isPinned?: boolean;
  isForwarded?: boolean;
  receipts?: {
    read: {
      status: boolean;
      readBy: {
        userId: string;
        timestamp: string | number | Date;
      }[];
    };
    delivered: {
      status: boolean;
      deliveredTo: {
        userId: string;
        timestamp: string | number | Date;
      }[];
    };
  };
}

export interface IAttachment {
  type: 'audio' | 'video' | 'image' | 'pdf' | 'other';
  msgId: string;
  mediaId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  caption?: string;
  localUrl?: string;
  cdnUrl?: string;
}

export interface IConversation {
  roomId: string;
  title?: string;
  phoneNumber?: string;
  type: 'private' | 'group' | 'community';
  communityId?: string;
  isMyself?: boolean;
  avatar?: string;
  members?: string[];
  adminIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageAt?: Date;
  unreadCount?: number;
  isArchived: boolean;
  isPinned: boolean;
  pinnedAt?: number | null;
  isLocked: boolean;
  isTyping?: boolean;
}
export interface IGroup {
  roomId: string;
  title?: string;
  type: 'group';
  avatar?: string;
  groupAvatar? : string;
  description: string;
  members?: Record<string, IGroupMember>;
  adminIds?: string[];
  createdBy: string;
  createdByName : string;
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageAt?: Date | string | number;
  unreadCount?: number;
  isArchived: boolean;
  isPinned: boolean;
  isLocked: boolean;
  communityId?: string;
}

export interface IGroupMember {
  username: string;
  phoneNumber: string;
  isActive?: boolean;
}

export interface GroupMemberDisplay extends IGroupMember {
  user_id: string;
  phone: string; // alias for phoneNumber
  avatar?: string;
  role?: string;
  publicKeyHex?: string | null;
}

export interface ICommunityMember {
  username: string;
  phoneNumber: string;
  isActive: boolean;
  joinedAt?: number;
  role?: 'admin' | 'member';
}

export interface ICommunity {
  roomId: string; // community ID (e.g., "community_1234567890")
  title: string; // community name
  description?: string; // community description
  avatar?: string; // community display picture URL
  adminIds: string[]; // list of admin user IDs
  createdBy: string; // creator user ID
  createdAt: number | Date; // creation timestamp
  members: Record<string, ICommunityMember>; // userId -> member details
  groups: Record<string, boolean>; // groupId -> true (list of group IDs in community)
  type: 'community';
  isArchived?: boolean;
  isPinned?: boolean;
  isLocked?: boolean;
  privacy?: 'public' | 'invite_only';
  settings?: {
    whoCanCreateGroups?: 'all' | 'admins';
    announcementPosting?: 'all' | 'adminsOnly';
  };
}

/**
 * Community Chat Metadata
 * Stored in Firebase at /userchats/{userId}/{communityId}
 * Extends IChatMeta with community-specific fields
 */
export interface ICommunityChatMeta extends IChatMeta {
  type: 'community';
  communityGroups?: string[]; // list of group IDs in this community
}

export interface IChatMeta {
  type: 'private' | 'group' | 'community';
  lastmessageAt: number | string | Date;
  lastmessageType: IMessage['type'];
  lastmessage: string;
  unreadCount: number | string;
  isArchived: boolean;
  isPinned: boolean;
  isLocked: boolean;
}
// Note: Make sure IChatMeta is defined like this (if not already):
/*
export interface IChatMeta {
  type: 'private' | 'group' | 'community';
  lastmessageAt?: number | string;
  lastmessageType?: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location';
  lastmessage?: string;
  unreadCount?: number;
  isArchived?: boolean;
  isPinned?: boolean;
  isLocked?: boolean;
  roomId?: string;
}
*/

// Also ensure IGroup has the communityId field for linking groups to communities:
/*
export interface IGroup {
  roomId: string;
  title: string;
  description?: string;
  avatar?: string;
  adminIds: string[];
  createdBy: string;
  createdAt: number | Date;
  updatedAt?: number | Date;
  members: Record<string, IGroupMember>;
  type: 'group';
  isArchived?: boolean;
  isPinned?: boolean;
  isLocked?: boolean;
  communityId?: string; // 👈 Add this if not present - links group to parent community
}
*/
export interface IOpState {
  id: string;
  isLoading: boolean;
  isError: string | null;
  isSuccess: boolean | null;
}

export interface CreateConversationInput extends IConversation {
  ownerId: string;
}

const DB_NAME = 'telldemm.db';

/** ----------------- SCHEMAS ----------------- **/
const TABLE_SCHEMAS = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      phoneNumber TEXT UNIQUE NOT NULL,
      lastSeen TEXT,
      avatar TEXT,
      status TEXT,
      isOnPlatform INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT
    );
  `,
  conversations: `
    CREATE TABLE IF NOT EXISTS conversations (
      roomId TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      title TEXT,
      phoneNumber TEXT,
      type TEXT,
      communityId TEXT,
      isMyself INTEGER DEFAULT 0,
      avatar TEXT,
      members TEXT,
      adminIds TEXT,
      isArchived INTEGER DEFAULT 0,
      isPinned INTEGER DEFAULT 0,
      isLocked INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `,
  messages: `
    CREATE TABLE IF NOT EXISTS messages (
      msgId TEXT PRIMARY KEY,
      roomId TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      sender TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      text TEXT,
      translations TEXT,                       -- JSON string for translations
      isMe INTEGER DEFAULT 0,
      status TEXT,
      timestamp TEXT NOT NULL,
      receipts TEXT,
      replyToMsgId TEXT,
      isEdit INTEGER DEFAULT 0,
      reactions TEXT,
      deletedFor TEXT,
      mediaId TEXT,                            -- just a reference key, no FK
      FOREIGN KEY (roomId)
        REFERENCES conversations(roomId)
        ON DELETE CASCADE
    );
  `,
  attachments: `
    CREATE TABLE IF NOT EXISTS attachments (
      mediaId TEXT PRIMARY KEY,
      msgId TEXT UNIQUE,       -- one attachment per message (adjust if needed)
      ownerId TEXT NOT NULL,
      type TEXT,
      fileName TEXT,
      mimeType TEXT,
      fileSize TEXT,
      caption TEXT,
      localUrl TEXT,
      cdnUrl TEXT,
      FOREIGN KEY (msgId)
        REFERENCES messages(msgId)
        ON DELETE CASCADE
    );
  `,
};

@Injectable({
  providedIn: 'root',
})
export class SqliteService {
  private isInitialized: boolean = false;
  private sqliteConnection: SQLiteConnection;
  private db!: SQLiteDBConnection;
  private operationStates = new Map<string, BehaviorSubject<IOpState>>();

  constructor() {
    this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
    if (Capacitor.getPlatform() === 'web') {
      defineCustomElements(window);
    }
  }

  async init(): Promise<void> {
    try {
      if (this.isInitialized) {
        console.warn('DB Already initialized!');
        return;
      }

      if (Capacitor.getPlatform() === 'web') {
        await this.sqliteConnection.initWebStore();
      }
      const isConn = (await this.sqliteConnection.isConnection(DB_NAME, false))
        .result;
      if (isConn) {
        await this.sqliteConnection.closeConnection(DB_NAME, false);
      }
      this.db = await this.sqliteConnection.createConnection(
        DB_NAME,
        false,
        'no-encryption',
        1,
        false
      );
      await this.db.open();

      await this.initDB();
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ SQLite init error:', error);
    }
  }

  /** ----------------- DB INIT ----------------- **/
  private async initDB() {
    try {
      for (const schema of Object.values(TABLE_SCHEMAS)) {
        await this.db.execute(schema);
        console.log('Table created for ', schema);
      }
      console.info('SQLite tables created! ✅');
    } catch (err) {
      console.error('DB init error:', err);
    }
  }

  /** ----------------- OP STATE ----------------- **/
  private setOpState(id: string, partial: Partial<IOpState>) {
    if (!this.operationStates.has(id)) {
      this.operationStates.set(
        id,
        new BehaviorSubject<IOpState>({
          id,
          isLoading: false,
          isError: null,
          isSuccess: null,
        })
      );
    }
    const current = this.operationStates.get(id)!.value;
    this.operationStates.get(id)!.next({ ...current, ...partial });
  }

  private async withOpState<T>(
    id: string,
    action: () => Promise<T>,
    defaultValue?: T
  ): Promise<T> {
    this.setOpState(id, { isLoading: true, isError: null, isSuccess: null });
    try {
      if (!this.isInitialized) throw new Error('DB not initialized');
      const result = await action();
      this.setOpState(id, { isLoading: false, isSuccess: true });
      return result;
    } catch (err: any) {
      console.error(`#SQLiteService.${id} Error:`, err);
      this.setOpState(id, {
        isLoading: false,
        isError: err?.message || 'Unknown error',
      });
      return defaultValue as T;
    }
  }

  getOpState$(id: string) {
    if (!this.operationStates.has(id)) {
      this.operationStates.set(
        id,
        new BehaviorSubject<IOpState>({
          id,
          isLoading: false,
          isError: null,
          isSuccess: null,
        })
      );
    }
    return this.operationStates.get(id)!.asObservable();
  }

  /** ----------------- HELPERS ----------------- **/
  private toDate(value?: string | null): Date | undefined {
    return value ? new Date(Number(value)) : undefined;
  }

  /** ----------------- CONTACTS ----------------- **/
  async upsertContact(
    contact: IUser & { isOnPlatform?: boolean; ownerId: string }
  ) {
    return this.withOpState('upsertContact', async () => {
      const sql = `
        INSERT INTO users (userId, phoneNumber,ownerId, username, avatar, status, lastSeen, isOnPlatform, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?,?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(userId) DO UPDATE SET
        phoneNumber = excluded.phoneNumber,
        ownerId = excluded.ownerId,
        username = excluded.username,
        avatar = excluded.avatar,
        status = excluded.status,
        lastSeen = excluded.lastSeen,
        isOnPlatform = excluded.isOnPlatform,
        updatedAt = datetime('now')
      `;
      const params = [
        contact.userId,
        contact.phoneNumber,
        contact.ownerId,
        contact.username || contact.phoneNumber,
        contact.avatar || null,
        contact.status || null,
        contact.lastSeen?.toISOString() || null,
        contact.isOnPlatform ? 1 : 0,
      ];
      await this.db.run(sql, params);
    });
  }

  async upsertContacts(
    contacts: (IUser & { isOnPlatform?: boolean; ownerId: string })[]
  ) {
    return this.withOpState('upsertContacts', async () => {
      for (const c of contacts) {
        await this.upsertContact(c);
      }
      console.info('Upserted contacts!');
    });
  }

  async getContacts(onlyPlatformUsers = false): Promise<IUser[]> {
    return this.withOpState(
      'getContacts',
      async () => {
        const sql = onlyPlatformUsers
          ? `SELECT * FROM users WHERE isOnPlatform = 1 ORDER BY username ASC`
          : `SELECT * FROM users ORDER BY username ASC`;
        const res = await this.db.query(sql);
        return (
          res.values?.map((c) => ({
            ...c,
            _id: c.userId,
            isOnPlatform: !!c.isOnPlatform,
            lastSeen: this.toDate(c.lastSeen),
            createdAt: this.toDate(c.createdAt),
            updatedAt: this.toDate(c.updatedAt),
          })) ?? []
        );
      },
      []
    );
  }

  async getContactByPhone(phoneNumber: string): Promise<IUser | null> {
    return this.withOpState(
      'getContactByPhone',
      async () => {
        const res = await this.db.query(
          `SELECT * FROM users WHERE phoneNumber = ?`,
          [phoneNumber]
        );
        const c = res.values?.[0];
        if (!c) return null;
        return {
          ...c,
          // _id: c.userId,
          isOnPlatform: !!c.isOnPlatform,
          lastSeen: this.toDate(c.lastSeen),
          createdAt: this.toDate(c.createdAt),
          updatedAt: this.toDate(c.updatedAt),
        };
      },
      null
    );
  }

  async getContactById(id: string): Promise<IUser | null> {
    return this.withOpState(
      'getContactById',
      async () => {
        const res = await this.db.query(
          `SELECT * FROM users WHERE userId = ?`,
          [id]
        );
        const c = res.values?.[0];
        if (!c) return null;
        return {
          ...c,
          // _id: c.userId,
          isOnPlatform: !!c.isOnPlatform,
          lastSeen: this.toDate(c.lastSeen),
          createdAt: this.toDate(c.createdAt),
          updatedAt: this.toDate(c.updatedAt),
        };
      },
      null
    );
  }

  async updateContactMetadata(
    id: string,
    updates: Partial<Pick<IUser, 'avatar' | 'status' | 'username' | 'lastSeen'>>
  ) {
    return this.withOpState('updateContactMetadata', async () => {
      const setClauses: string[] = [];
      const params: any[] = [];
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          setClauses.push(`${key} = ?`);
          params.push(value instanceof Date ? value.toISOString() : value);
        }
      });
      if (!setClauses.length) return;
      params.push(id);
      await this.db.run(
        `UPDATE users SET ${setClauses.join(
          ', '
        )}, updatedAt = datetime('now') WHERE userId = ?`,
        params
      );
    });
  }

  async deleteContact(phoneNumber: string) {
    return this.withOpState('deleteContact', async () => {
      await this.db.run(`DELETE FROM users WHERE phoneNumber = ?`, [
        phoneNumber,
      ]);
    });
  }

  async deleteAllContacts() {
    return this.withOpState('deleteAllContacts', async () => {
      await this.db.execute('DELETE FROM users');
    });
  }

  /** ----------------- CONVERSATIONS ----------------- **/
  async createConversation(input: CreateConversationInput) {
    return this.withOpState('createConversation', async () => {
      const sql = `
        INSERT INTO conversations
        (roomId, title, ownerId, type, communityId, isMyself, avatar, members, adminIds, phoneNumber,isArchived, isPinned, isLocked, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?,?, ?, ?,?,?,?,?,  datetime('now'), datetime('now'))
        ON CONFLICT(roomId) DO UPDATE SET
        title = excluded.title,
        ownerId = excluded.ownerId,
        type = excluded.type,
        communityId = excluded.communityId,
        isMyself = excluded.isMyself,
        avatar = excluded.avatar,
        members = excluded.members,
        adminIds = excluded.adminIds,
        isArchived = excluded.isArchived,
        isPinned = excluded.isPinned,
        isLocked = excluded.isLocked,
        updatedAt = datetime('now')
      `;
      await this.db.run(sql, [
        input.roomId,
        input.title,
        input.ownerId,
        input.type,
        input.communityId || null,
        input.isMyself ? 1 : 0,
        input.avatar || null,
        JSON.stringify(input.members || []),
        JSON.stringify(input.adminIds || []),
        input.phoneNumber || null,
        input.isArchived ? 1 : 0,
        input.isPinned ? 1 : 0,
        input.isLocked ? 1 : 0,
      ]);
    });
  }

  async getConversation(
    roomId: string,
    ownerId: string
  ): Promise<IConversation | null> {
    return this.withOpState(
      'getConversation',
      async () => {
        const res = await this.db.query(
          `SELECT * FROM conversations WHERE roomId = ? AND ownerId = ?`,
          [roomId, ownerId]
        );
        const row = res.values?.[0];
        if (!row) return null;
        return {
          ...row,
          members: row.members ? JSON.parse(row.members) : [],
          adminIds: row.adminIds ? JSON.parse(row.adminIds) : [],
          createdAt: this.toDate(row.createdAt),
          updatedAt: this.toDate(row.updatedAt),
        };
      },
      null
    );
  }

  async getConversations(ownerId: string): Promise<IConversation[]> {
    return this.withOpState(
      'getConversations',
      async () => {
        const sql = `
        SELECT c.*,
        m.text AS lastMessage,
        m.type AS lastMessageType,
        m.timestamp AS lastMessageAt,
        (
          SELECT COUNT(um.msgId) FROM messages um 
          WHERE um.roomId = c.roomId AND um.isMe = 0 AND um.status = 'delivered' AND um.ownerId = ?
        ) AS unreadCount
        FROM conversations c
        LEFT JOIN messages m 
        ON m.roomId = c.roomId
        AND m.timestamp = (SELECT MAX(timestamp) FROM messages WHERE roomId = c.roomId AND ownerId = ?)
        WHERE c.ownerId = ?
        ORDER BY c.updatedAt DESC
      `;
        const res = await this.db.query(sql, [ownerId, ownerId, ownerId]);
        return (
          res.values?.map((c) => ({
            ...c,
            type: c.type,
            communityId: c.communityId,
            isMyself: !!c.isMyself,
            isArchived: !!c.isArchived,
            isPinned: !!c.isPinned,
            isLocked: !!c.isLocked,
            members: c.members ? JSON.parse(c.members) : [],
            adminIds: c.adminIds ? JSON.parse(c.adminIds) : [],
            lastMessageAt: this.toDate(c.lastMessageAt),
            createdAt: this.toDate(c.createdAt),
            updatedAt: this.toDate(c.updatedAt),
          })) ?? []
        );
      },
      []
    );
  }

  async updateConversationTitle(roomId: string, newTitle: string): Promise<void> {
  return this.withOpState('updateConversationTitle', async () => {
    const sql = `
      UPDATE conversations 
      SET title = ?, 
          updatedAt = datetime('now') 
      WHERE roomId = ?
    `;
    
    await this.db.run(sql, [newTitle, roomId]);
    
    console.log(`✅ Updated conversation title for ${roomId}: ${newTitle}`);
  });
}

  // async deleteConversation(roomId: string) {
  //   return this.withOpState('deleteConversation', async () => {
  //     await this.db.run('DELETE FROM messages WHERE roomId = ?', [roomId]);
  //     await this.db.run('DELETE FROM conversations WHERE roomId = ?', [roomId]);
  //   });
  // }

  async deleteConversation(roomId: string) {
    return this.withOpState('deleteConversation', async () => {
      // Delete attachments
      await this.db.run(
        'DELETE FROM attachments WHERE mediaId IN (SELECT mediaId FROM messages WHERE roomId = ?)',
        [roomId]
      );

      // Delete messages
      await this.db.run('DELETE FROM messages WHERE roomId = ?', [roomId]);

      // Delete conversation
      await this.db.run('DELETE FROM conversations WHERE roomId = ?', [roomId]);
    });
  }

  async deleteConversations(roomIds: string[]) {
    return this.withOpState('deleteConversations', async () => {
      if (!roomIds.length) return;
      const placeholders = roomIds.map(() => '?').join(', ');
      await this.db.run(
        `DELETE FROM messages WHERE roomId IN (${placeholders})`,
        roomIds
      );
      await this.db.run(
        `DELETE FROM conversations WHERE roomId IN (${placeholders})`,
        roomIds
      );
    });
  }

  /** ----------------- MESSAGES ----------------- **/
  // async saveMessage(message: IMessage) {
  //   return this.withOpState('saveMessage', async () => {
  //     const sql = `
  //       INSERT INTO messages
  //       (msgId, roomId, sender, type, text,mediaId, isMe, status, timestamp, receipts, deletedFor, replyToMsgId, reactions, isEdit )
  //       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  //     `;
  //     const params = [
  //       message.msgId,
  //       message.roomId,
  //       message.sender,
  //       message.type || 'text',
  //       message.text || null,
  //       message.mediaId || null,
  //       message.isMe ? 1 : 0,
  //       message.status,
  //       String(message.timestamp),
  //       JSON.stringify(message.receipts || {}),
  //       JSON.stringify(message.deletedFor || {}),
  //       message.replyToMsgId || '',
  //       JSON.stringify(message.reactions || []),
  //       !!message.isEdit ? 1 : 0,
  //     ];
  //     await this.db.run(sql, params);
  //   });
  // }

  async saveMessage(message: IMessage & { ownerId: string }) {
    console.log('this is from savemessage sqlite', message);
    return this.withOpState('saveMessage', async () => {
      if(message.deletedFor?.everyone || (message.deletedFor?.users as string[])?.includes(message.ownerId as string)) return;
      const sql = `
      INSERT INTO messages 
      (msgId, roomId, ownerId, sender, sender_name, receiver_id, type, text, translations, mediaId, isMe, status, timestamp, receipts, deletedFor, replyToMsgId, reactions, isEdit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

      const params = [
        message.msgId,
        message.roomId,
        message.ownerId,
        message.sender,
        message.sender_name,
        message.receiver_id,
        message.type || 'text',
        message.text ?? null,
        // store translations as JSON string or null
        message.translations ? JSON.stringify(message.translations) : null,
        message.mediaId ?? null,
        message.isMe ? 1 : 0,
        message.status ?? null,
        String(message.timestamp),
        JSON.stringify(message.receipts ?? {}),
        JSON.stringify(message.deletedFor ?? {}),
        message.replyToMsgId ?? '',
        JSON.stringify(message.reactions ?? []),
        message.isEdit ? 1 : 0,
      ];

      await this.db.run(sql, params);
    });
  }

  saveAttachment(attachment: IAttachment & { ownerId: string }) {
    return this.withOpState('saveAttachment', async () => {
      const query = `INSERT INTO attachments (msgId,ownerId,mediaId, type, fileName, mimeType, fileSize, caption, localUrl, cdnUrl)
      VALUES(?,?,?,?,?,?,?,?,?,?) `;
      await this.db.run(query, [
        attachment.msgId || '',
        attachment.ownerId || '',
        attachment.mediaId || '',
        attachment.type || '',
        attachment.fileName || '',
        attachment.mimeType || '',
        attachment.fileSize || '',
        attachment.caption || '',
        attachment.localUrl || '',
        attachment.cdnUrl || '',
      ]);
    });
  }

  updateAttachment(msgId: string, updates: Partial<IAttachment>) {
    return this.withOpState('updateAttachment', async () => {
      const fields = Object.keys(updates);
      if (fields.length === 0) return;

      const setClause = fields.map((field) => `${field} = ?`).join(', ');
      const values = fields.map((field) => (updates as any)[field]);

      const query = `UPDATE attachments SET ${setClause} WHERE msgId = ?`;

      await this.db.run(query, [...values, msgId]);
    });
  }

  async getAttachment(msgId: string): Promise<IAttachment | null> {
    return this.withOpState(`getAttachment`, async () => {
      const sql = `SELECT * FROM msgId WHERE attachments WHERE msgId = ?`;
      const res = await this.db.query(sql, [msgId]);
      return res.values?.[0] || null;
    });
  }

  // async getMessages(
  //   roomId: string,
  //   ownerId: string,
  //   limit = 20,
  //   offset = 0
  // ): Promise<IMessage[]> {
  //   return this.withOpState(
  //     'getMessages',
  //     async () => {
  //       const sql = `SELECT * FROM messages WHERE roomId = ? AND ownerId = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
  //       const res = await this.db.query(sql, [roomId, ownerId, limit, offset]);
  //       const msgIds = res.values?.map((m) => m.msgId) || [];
  //       const placeholders = msgIds.map(() => '?').join(',');

  //       const attachQuery = `SELECT * FROM attachments WHERE msgId IN (${placeholders})`;

  //       const res2 = await this.db.query(attachQuery, msgIds);
  //       return (
  //         res.values?.reverse().map((msg) => {
  //           const attachment = res2.values?.find((a) => a.msgId == msg.msgId);
  //           return {
  //             ...msg,
  //             ...(attachment && { attachment }),
  //             receipts: JSON.parse(msg.receipts || '{}'),
  //             reactions: JSON.parse(msg.reactions || '[]'),
  //             deletedFor: JSON.parse(msg.deletedFor || '{}'),
  //             isMe: !!msg.isMe,
  //             isEdit: !!msg.isEdit,
  //             timestamp: this.toDate(msg.timestamp),
  //           };
  //         }) ?? []
  //       );
  //     },
  //     []
  //   );
  // }

  async getMessages(
  roomId: string,
  ownerId: string,
  limit = 20,
  offset = 0
): Promise<IMessage[]> {
  return this.withOpState(
    'getMessages',
    async () => {
      // Step 1: Get messages
      const sql = `
        SELECT * FROM messages 
        WHERE roomId = ? AND ownerId = ? 
        ORDER BY timestamp DESC 
        LIMIT ? OFFSET ?
      `;
      const res = await this.db.query(sql, [roomId, ownerId, limit, offset]);

      if (!res.values || res.values.length === 0) {
        return [];
      }

      // Step 2: Get msgIds for attachment query
      const msgIds = res.values.map((m) => m.msgId);
      
      // Step 3: Get attachments only if msgIds exist
      let attachmentsMap: Map<string, any> = new Map();
      
      if (msgIds.length > 0) {
        const placeholders = msgIds.map(() => '?').join(',');
        const attachQuery = `SELECT * FROM attachments WHERE msgId IN (${placeholders})`;
        
        const attachRes = await this.db.query(attachQuery, msgIds);
        
        // Create a map for quick lookup
        if (attachRes.values) {
          attachRes.values.forEach((attachment) => {
            attachmentsMap.set(attachment.msgId, attachment);
          });
        }
      }

      // Step 4: Combine messages with attachments and parse JSON fields
      return res.values.reverse().map((msg) => {
        const attachment = attachmentsMap.get(msg.msgId);
        
        return {
          ...msg,
          ...(attachment && { attachment }),
          // Parse translations if it exists
          translations: msg.translations ? JSON.parse(msg.translations) : null,
          receipts: JSON.parse(msg.receipts || '{}'),
          reactions: JSON.parse(msg.reactions || '[]'),
          deletedFor: JSON.parse(msg.deletedFor || '{}'),
          isMe: !!msg.isMe,
          isEdit: !!msg.isEdit,
          timestamp: msg.timestamp, // Keep as string or convert based on your need
        };
      });
    },
    []
  );
}

  async getMessage(msgId: string): Promise<IMessage | null> {
    return this.withOpState(
      'getMessage',
      async () => {
        const res = await this.db.query(
          `SELECT * FROM messages WHERE msgId = ?`,
          [msgId]
        );
        const m = res.values?.[0];
        if (!m) return null;
        return {
          ...m,
          receipts: JSON.parse(m.receipts || '{}'),
          isMe: m.isMe === 1,
          timestamp: this.toDate(m.timestamp),
        };
      },
      null
    );
  }

  async clearRoomChat(roomId : string){
    return this.withOpState('clearRoomChat', async () =>{
      await this.db.run('DELETE FROM messages WHERE roomId = ?',[roomId])
    })
  }

  async deleteMessages(msgIds: string[]) {
    return this.withOpState('deleteMessages', async () => {
      if (msgIds.length > 0) {
        const placeholders = msgIds.map(() => '?').join(', ');
        await this.db.run(
          `DELETE FROM messages WHERE msgId IN (${placeholders})`,
          msgIds
        );
      }
    });
  }

  async permanentlyDeleteMessages(msgIds: string[]) {
    return this.withOpState('permanentlyDeleteMessages', async () => {
      if (!msgIds.length) {
        console.warn('⚠️ No messages selected for deletion');
        return;
      }

      const placeholders = msgIds.map(() => '?').join(', ');

      await this.db.run(
        `DELETE FROM attachments WHERE msgId IN (${placeholders})`,
        msgIds
      );

      await this.db.run(
        `DELETE FROM messages WHERE msgId IN (${placeholders})`,
        msgIds
      );

      console.log(
        `✅ Permanently deleted ${msgIds.length} messages from local database`
      );
    });
  }

  async getLastMessage(roomId: string, ownerId: string) {
  return this.withOpState(
    'getLastMessage',
    async () => {
      // 1) Get latest message for this room + owner
      const res = await this.db.query(
        `
        SELECT *
        FROM messages
        WHERE roomId = ?
          AND ownerId = ?
        ORDER BY timestamp DESC
        LIMIT 1
        `,
        [roomId, ownerId]
      );

      const m = res.values?.[0];
      if (!m) return null;

      // 2) Get attachment (if any) for this message
      let attachment: any | undefined = undefined;

      if (m.msgId) {
        const res2 = await this.db.query(
          `SELECT * FROM attachments WHERE msgId = ?`,
          [m.msgId]
        );
        attachment = res2.values?.[0];
      }

      // 3) Normalize & return (same style as getMessages)
      return {
        ...m,
        ...(attachment && { attachment }),
        receipts: JSON.parse(m.receipts || '{}'),
        reactions: JSON.parse(m.reactions || '[]'),
        deletedFor: JSON.parse(m.deletedFor || '{}'),
        isMe: !!m.isMe,
        isEdit: !!m.isEdit,
        timestamp: this.toDate(m.timestamp),
      };
    },
    null
  );
}


  // async permanentlyDeleteMessage(msgId: string) {
  //   return this.permanentlyDeleteMessages([msgId]);
  // }

  async updateMessageDeletionStatus(
    msgId: string,
    deletedFor: { everyone: boolean; users: string[] }
  ) {
    return this.withOpState('updateMessageDeletionStatus', async () => {
      const sql = `UPDATE messages SET deletedFor = ? WHERE msgId = ?`;
      await this.db.run(sql, [JSON.stringify(deletedFor), msgId]);
    });
  }

  async updateMessageStatus(msgId: string, status: IMessage['status']) {
    return this.withOpState('updateMessageStatus', async () => {
      await this.db.run(`UPDATE messages SET status = ? WHERE msgId = ?`, [
        status,
        msgId,
      ]);
    });
  }

  async updateMessageReceipts(msgId: string, receipt: IMessage['receipts']) {
    return this.withOpState('updateMessageReceipts', async () => {
      await this.db.run(`UPDATE messages SET receipts = ? WHERE msgId = ?`, [
        JSON.stringify(receipt),
        msgId,
      ]);
    });
  }

  async getMessageCount(roomId: string): Promise<number> {
    return this.withOpState(
      'getMessageCount',
      async () => {
        const res = await this.db.query(
          `SELECT COUNT(*) as count FROM messages WHERE roomId = ?`,
          [roomId]
        );
        return res.values?.[0]?.count ?? 0;
      },
      0
    );
  }

  /** ----------------- UTILITIES ----------------- **/
  async resetDB() {
    return this.withOpState('resetDB', async () => {
      const tables = ['messages', 'attachments', 'conversations', 'users'];

      // console.log('🗑️ Starting database reset...');

      // Drop all tables
      for (const table of tables) {
        try {
          await this.db.execute(`DROP TABLE IF EXISTS ${table}`);
          console.log(`✅ Dropped table: ${table}`);
        } catch (error) {
          console.error(`❌ Error dropping table ${table}:`, error);
        }
      }

      // Recreate all tables with fresh schemas
      for (const [tableName, schema] of Object.entries(TABLE_SCHEMAS)) {
        try {
          await this.db.execute(schema);
          console.log(`✅ Recreated table: ${tableName}`);
        } catch (error) {
          console.error(`❌ Error creating table ${tableName}:`, error);
        }
      }

      console.log(
        '✅ Database reset complete - all tables cleared and recreated'
      );
    });
  }

  /**
   * Helper: Convert Blob → Base64 string
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Helper: Convert Base64 → Blob
   */
  private base64ToBlob(base64Data: string, contentType = ''): Blob {
    const byteCharacters = atob(base64Data.split(',')[1] || base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  }

  /**
   * Close the database connection
   */
  async closeConnection(): Promise<void> {
    try {
      await this.sqliteConnection.closeConnection(DB_NAME, false);
    } catch (error) {
      console.error('❌ Error closing DB connection:', error);
    }
  }

  /** ----------------- SIMPLE DEBUG FUNCTION ----------------- **/

  /**
   * Print all tables data in console
   * Bas isko call karo aur sab kuch console mein aa jayega
   */
  async printAllTables() {
    try {
      console.log('========== DATABASE DATA ==========\n');

      // Users
      const users = await this.db.query('SELECT * FROM users');
      console.log('👥 USERS:', users.values);

      // Conversations
      const conversations = await this.db.query('SELECT * FROM conversations');
      console.log('\n💬 CONVERSATIONS:', conversations.values);

      // Messages
      const messages = await this.db.query('SELECT * FROM messages');
      console.log('\n📨 MESSAGES:', messages.values);

      // Attachments
      const attachments = await this.db.query('SELECT * FROM attachments');
      console.log('\n📎 ATTACHMENTS:', attachments.values);

      console.log('\n===================================');
    } catch (error) {
      console.error('❌ Error:', error);
    }
  }
}
