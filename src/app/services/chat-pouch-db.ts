import { Injectable } from '@angular/core';
import PouchDB from 'pouchdb';
import { IConversation, IMessage, IAttachment } from './sqlite.service';

export interface CachedMessage extends IMessage {
  isPending?: boolean;
  syncStatus?: 'synced' | 'pending' | 'failed';
  localTimestamp?: number;
}

export interface CachedConversation extends IConversation {
  syncStatus?: 'synced' | 'pending';
  lastSyncedAt?: number;
}

export interface PendingChatAction {
  type: 'send_message' | 'delete_message' | 'edit_message' | 'mark_read' | 'mark_delivered';
  conversationId: string;
  messageId?: string;
  data: any;
  timestamp: number;
  retryCount?: number;
  userId: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatPouchDb {
  private db: PouchDB.Database;
  private saveTimers: Map<string, any> = new Map();

  constructor() {
    this.db = new PouchDB('chat_unified_db');
  }

  /* =========================
     CONVERSATIONS - ENHANCED
     ========================= */

  /**
   * 🔥 NEW: Update specific conversation field (for real-time updates)
   */
  async updateConversationField(
    userId: string, 
    conversationId: string, 
    updates: Partial<CachedConversation>
  ): Promise<void> {
    try {
      const conversations = await this.getConversations(userId);
      const index = conversations.findIndex(c => c.roomId === conversationId);
      
      if (index >= 0) {
        // Update existing conversation
        conversations[index] = {
          ...conversations[index],
          ...updates,
          lastSyncedAt: Date.now(),
          syncStatus: 'synced'
        };
      } else {
        // Conversation not found, create new entry
        const newConv: CachedConversation = {
          roomId: conversationId,
          ...updates,
          lastSyncedAt: Date.now(),
          syncStatus: 'synced'
        } as CachedConversation;
        
        conversations.push(newConv);
      }
      
      // Save immediately (no debounce for real-time updates)
      await this.saveConversations(userId, conversations, true);
      console.log(`✅ Updated conversation ${conversationId} in PouchDB`);
    } catch (error) {
      console.error('❌ Failed to update conversation field:', error);
    }
  }

  /**
   * 🔥 NEW: Update unread count for a specific conversation
   */
  async updateConversationUnreadCount(
    userId: string,
    conversationId: string,
    unreadCount: number
  ): Promise<void> {
    try {
      const conversations = await this.getConversations(userId);
      const index = conversations.findIndex(c => c.roomId === conversationId);
      
      if (index >= 0) {
        conversations[index].unreadCount = unreadCount;
        conversations[index].lastSyncedAt = Date.now();
        
        // Save immediately (no debounce)
        await this.saveConversations(userId, conversations, true);
        console.log(`✅ Updated unread count for ${conversationId}: ${unreadCount}`);
      }
    } catch (error) {
      console.error('❌ Failed to update unread count:', error);
    }
  }

  /**
   * 🔥 NEW: Update last message details for conversation
   */
  async updateConversationLastMessage(
    userId: string,
    conversationId: string,
    lastMessage: string,
    lastMessageType: string,
    lastMessageAt: Date | number
  ): Promise<void> {
    try {
      const updates: Partial<CachedConversation> = {
        lastMessage,
        lastMessageType: lastMessageType as any,
        lastMessageAt: lastMessageAt instanceof Date ? lastMessageAt : new Date(lastMessageAt),
        updatedAt: new Date()
      };
      
      await this.updateConversationField(userId, conversationId, updates);
      console.log(`✅ Updated last message for ${conversationId}`);
    } catch (error) {
      console.error('❌ Failed to update last message:', error);
    }
  }

  /**
   * 🔥 NEW: Update conversation pin status
   */
  async updateConversationPinStatus(
    userId: string,
    conversationId: string,
    isPinned: boolean,
    pinnedAt?: number | null
  ): Promise<void> {
    try {
      const updates: Partial<CachedConversation> = {
        isPinned,
        pinnedAt: pinnedAt || null
      };
      
      await this.updateConversationField(userId, conversationId, updates);
      console.log(`✅ Updated pin status for ${conversationId}: ${isPinned}`);
    } catch (error) {
      console.error('❌ Failed to update pin status:', error);
    }
  }

  /**
   * 🔥 NEW: Update conversation archive status
   */
  async updateConversationArchiveStatus(
    userId: string,
    conversationId: string,
    isArchived: boolean
  ): Promise<void> {
    try {
      const updates: Partial<CachedConversation> = {
        isArchived
      };
      
      await this.updateConversationField(userId, conversationId, updates);
      console.log(`✅ Updated archive status for ${conversationId}: ${isArchived}`);
    } catch (error) {
      console.error('❌ Failed to update archive status:', error);
    }
  }

  /**
   * 🔥 NEW: Delete conversation from cache
   */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    try {
      const conversations = await this.getConversations(userId);
      const filtered = conversations.filter(c => c.roomId !== conversationId);
      
      await this.saveConversations(userId, filtered, true);
      
      // Also delete messages for this conversation
      await this.deleteAllMessages(conversationId);
      
      console.log(`✅ Deleted conversation ${conversationId} from cache`);
    } catch (error) {
      console.error('❌ Failed to delete conversation:', error);
    }
  }

  /**
   * Save conversations with debouncing
   */
  async saveConversations(userId: string, conversations: CachedConversation[], immediate: boolean = false): Promise<void> {
    const key = `conversations_${userId}`;

    if (this.saveTimers.has(key)) {
      clearTimeout(this.saveTimers.get(key));
    }

    const doSave = async () => {
      try {
        const docId = `conversations_${userId}`;
        
        try {
          const existing = await this.db.get(docId);
          await this.db.put({
            _id: docId,
            _rev: existing._rev,
            conversations,
            userId,
            timestamp: Date.now()
          });
        } catch (err: any) {
          if (err.status === 404) {
            await this.db.put({
              _id: docId,
              conversations,
              userId,
              timestamp: Date.now()
            });
          } else {
            throw err;
          }
        }
        console.log(`✅ Saved ${conversations.length} conversations for user ${userId}`);
        this.saveTimers.delete(key);
      } catch (error) {
        console.error('❌ Failed to save conversations:', error);
      }
    };

    if (immediate) {
      await doSave();
    } else {
      const timer = setTimeout(doSave, 500);
      this.saveTimers.set(key, timer);
    }
  }

  /**
   * Get conversations
   */
  async getConversations(userId: string): Promise<CachedConversation[]> {
    try {
      const docId = `conversations_${userId}`;
      const doc: any = await this.db.get(docId);
      return doc.conversations || [];
    } catch (err: any) {
      if (err.status === 404) {
        return [];
      }
      console.error('❌ Failed to get conversations:', err);
      return [];
    }
  }

  /**
   * Save single conversation
   */
  async saveConversation(conversation: CachedConversation, immediate: boolean = false): Promise<void> {
    const key = `conversation_${conversation.roomId}`;

    if (this.saveTimers.has(key)) {
      clearTimeout(this.saveTimers.get(key));
    }

    const doSave = async () => {
      try {
        const docId = `conversation_${conversation.roomId}`;
        
        try {
          const existing = await this.db.get(docId);
          await this.db.put({
            _id: docId,
            _rev: existing._rev,
            ...conversation,
            timestamp: Date.now()
          });
        } catch (err: any) {
          if (err.status === 404) {
            await this.db.put({
              _id: docId,
              ...conversation,
              timestamp: Date.now()
            });
          } else {
            throw err;
          }
        }
        this.saveTimers.delete(key);
      } catch (error) {
        console.error('❌ Failed to save conversation:', error);
      }
    };

    if (immediate) {
      await doSave();
    } else {
      const timer = setTimeout(doSave, 300);
      this.saveTimers.set(key, timer);
    }
  }

  /**
   * Get single conversation
   */
  async getConversation(conversationId: string): Promise<CachedConversation | null> {
    try {
      const docId = `conversation_${conversationId}`;
      const doc: any = await this.db.get(docId);
      const { _id, _rev, timestamp, ...conversation } = doc;
      return conversation as CachedConversation;
    } catch (err: any) {
      if (err.status === 404) {
        return null;
      }
      console.error('❌ Failed to get conversation:', err);
      return null;
    }
  }

  /* =========================
     MESSAGES - ENHANCED
     ========================= */

  /**
   * Save messages for a conversation
   */
  async saveMessages(conversationId: string, messages: CachedMessage[], immediate: boolean = false): Promise<void> {
    const key = `messages_${conversationId}`;

    if (this.saveTimers.has(key)) {
      clearTimeout(this.saveTimers.get(key));
    }

    const doSave = async () => {
      try {
        const docId = `messages_${conversationId}`;
        
        try {
          const existing = await this.db.get(docId);
          await this.db.put({
            _id: docId,
            _rev: existing._rev,
            messages,
            conversationId,
            timestamp: Date.now()
          });
        } catch (err: any) {
          if (err.status === 404) {
            await this.db.put({
              _id: docId,
              messages,
              conversationId,
              timestamp: Date.now()
            });
          } else {
            throw err;
          }
        }
        console.log(`✅ Saved ${messages.length} messages for conversation ${conversationId}`);
        this.saveTimers.delete(key);
      } catch (error) {
        console.error('❌ Failed to save messages:', error);
      }
    };

    if (immediate) {
      await doSave();
    } else {
      const timer = setTimeout(doSave, 500);
      this.saveTimers.set(key, timer);
    }
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string): Promise<CachedMessage[]> {
    try {
      const docId = `messages_${conversationId}`;
      const doc: any = await this.db.get(docId);
      return doc.messages || [];
    } catch (err: any) {
      if (err.status === 404) {
        return [];
      }
      console.error('❌ Failed to get messages:', err);
      return [];
    }
  }

  /**
   * Add single message
   */
  async addMessage(conversationId: string, message: CachedMessage): Promise<void> {
    try {
      const messages = await this.getMessages(conversationId);
      
      // Check if message already exists
      const existingIndex = messages.findIndex(m => m.msgId === message.msgId);
      
      if (existingIndex >= 0) {
        // Update existing message
        messages[existingIndex] = message;
      } else {
        // Add new message
        messages.push(message);
      }
      
      // Sort by timestamp
      messages.sort((a, b) => (a.timestamp as any) - (b.timestamp as any));
      
      await this.saveMessages(conversationId, messages, true);
    } catch (error) {
      console.error('❌ Failed to add message:', error);
    }
  }

  /**
   * Update message
   */
  async updateMessage(conversationId: string, messageId: string, updates: Partial<CachedMessage>): Promise<void> {
    try {
      const messages = await this.getMessages(conversationId);
      const index = messages.findIndex(m => m.msgId === messageId);
      
      if (index >= 0) {
        messages[index] = { ...messages[index], ...updates };
        await this.saveMessages(conversationId, messages, true);
      }
    } catch (error) {
      console.error('❌ Failed to update message:', error);
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    try {
      const messages = await this.getMessages(conversationId);
      const filtered = messages.filter(m => m.msgId !== messageId);
      await this.saveMessages(conversationId, filtered, true);
    } catch (error) {
      console.error('❌ Failed to delete message:', error);
    }
  }

  /**
   * 🔥 NEW: Delete all messages for a conversation
   */
  async deleteAllMessages(conversationId: string): Promise<void> {
    try {
      await this.saveMessages(conversationId, [], true);
      console.log(`✅ Deleted all messages for ${conversationId}`);
    } catch (error) {
      console.error('❌ Failed to delete all messages:', error);
    }
  }

  /* =========================
     PENDING ACTIONS QUEUE
     ========================= */

  /**
   * Enqueue a pending action
   */
  async enqueueAction(action: PendingChatAction): Promise<void> {
    try {
      const queueDoc = await this.getOrCreateQueue();
      queueDoc.actions.push(action);
      
      await this.db.put({
        _id: 'chat_action_queue',
        _rev: queueDoc._rev,
        actions: queueDoc.actions
      });

      console.log('📝 Queued chat action:', action.type);
    } catch (error) {
      console.error('❌ Failed to enqueue action:', error);
    }
  }

  /**
   * Get pending actions queue
   */
  async getQueue(): Promise<PendingChatAction[]> {
    try {
      const doc: any = await this.db.get('chat_action_queue');
      return doc.actions || [];
    } catch (err: any) {
      if (err.status === 404) {
        return [];
      }
      console.error('❌ Failed to get queue:', err);
      return [];
    }
  }

  /**
   * Remove action from queue
   */
  async removeFromQueue(actionIndex: number): Promise<void> {
    try {
      const doc: any = await this.db.get('chat_action_queue');
      doc.actions.splice(actionIndex, 1);
      await this.db.put(doc);
    } catch (error) {
      console.error('❌ Failed to remove from queue:', error);
    }
  }

  /**
   * Clear queue
   */
  async clearQueue(): Promise<void> {
    try {
      const doc: any = await this.db.get('chat_action_queue');
      await this.db.put({
        _id: 'chat_action_queue',
        _rev: doc._rev,
        actions: []
      });
    } catch (err: any) {
      if (err.status !== 404) {
        console.error('❌ Failed to clear queue:', err);
      }
    }
  }

  private async getOrCreateQueue(): Promise<any> {
    try {
      return await this.db.get('chat_action_queue');
    } catch (err: any) {
      if (err.status === 404) {
        const newQueue = {
          _id: 'chat_action_queue',
          actions: []
        };
        await this.db.put(newQueue);
        return { ...newQueue, _rev: undefined };
      }
      throw err;
    }
  }

  /* =========================
     ATTACHMENTS
     ========================= */

  /**
   * Cache attachment metadata
   */
  async cacheAttachment(messageId: string, attachment: IAttachment): Promise<void> {
    try {
      const docId = `attachment_${messageId}`;
      
      try {
        const existing = await this.db.get(docId);
        await this.db.put({
          _id: docId,
          _rev: existing._rev,
          attachment,
          messageId,
          timestamp: Date.now()
        });
      } catch (err: any) {
        if (err.status === 404) {
          await this.db.put({
            _id: docId,
            attachment,
            messageId,
            timestamp: Date.now()
          });
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error('❌ Failed to cache attachment:', error);
    }
  }

  /**
   * Get cached attachment
   */
  async getAttachment(messageId: string): Promise<IAttachment | null> {
    try {
      const docId = `attachment_${messageId}`;
      const doc: any = await this.db.get(docId);
      return doc.attachment || null;
    } catch (err: any) {
      if (err.status === 404) {
        return null;
      }
      console.error('❌ Failed to get attachment:', err);
      return null;
    }
  }

  /* =========================
     PRESENCE & TYPING
     ========================= */

  /**
   * Cache presence data
   */
  async cachePresence(userId: string, presence: { isOnline: boolean; lastSeen: number | null }): Promise<void> {
    try {
      const docId = `presence_${userId}`;
      
      try {
        const existing = await this.db.get(docId);
        await this.db.put({
          _id: docId,
          _rev: existing._rev,
          presence,
          userId,
          timestamp: Date.now()
        });
      } catch (err: any) {
        if (err.status === 404) {
          await this.db.put({
            _id: docId,
            presence,
            userId,
            timestamp: Date.now()
          });
        }
      }
    } catch (error) {
      console.error('❌ Failed to cache presence:', error);
    }
  }

  /**
   * Get cached presence
   */
  async getPresence(userId: string): Promise<{ isOnline: boolean; lastSeen: number | null } | null> {
    try {
      const docId = `presence_${userId}`;
      const doc: any = await this.db.get(docId);
      return doc.presence || null;
    } catch (err: any) {
      if (err.status === 404) {
        return null;
      }
      return null;
    }
  }

  /* =========================
     USER DATA
     ========================= */

  /**
   * Save platform users
   */
  async savePlatformUsers(users: any[]): Promise<void> {
    try {
      const docId = 'platform_users';
      
      try {
        const existing = await this.db.get(docId);
        await this.db.put({
          _id: docId,
          _rev: existing._rev,
          users,
          timestamp: Date.now()
        });
      } catch (err: any) {
        if (err.status === 404) {
          await this.db.put({
            _id: docId,
            users,
            timestamp: Date.now()
          });
        }
      }
    } catch (error) {
      console.error('❌ Failed to save platform users:', error);
    }
  }

  /**
   * Get platform users
   */
  async getPlatformUsers(): Promise<any[]> {
    try {
      const doc: any = await this.db.get('platform_users');
      return doc.users || [];
    } catch (err: any) {
      if (err.status === 404) {
        return [];
      }
      return [];
    }
  }

  /* =========================
     UTILITY & MAINTENANCE
     ========================= */

  /**
   * Flush all pending saves
   */
  async flushPendingSaves(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [key, timer] of this.saveTimers.entries()) {
      clearTimeout(timer);
      this.saveTimers.delete(key);
    }
    
    await Promise.all(promises);
    console.log('✅ Flushed all pending saves');
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    try {
      await this.db.destroy();
      this.db = new PouchDB('chat_unified_db');
      console.log('✅ Chat database cleared and recreated');
    } catch (error) {
      console.error('❌ Failed to clear database:', error);
    }
  }

  /**
   * Clear conversation data
   */
  async clearConversation(conversationId: string): Promise<void> {
    try {
      // Clear messages
      const messagesDoc = await this.db.get(`messages_${conversationId}`);
      await this.db.remove(messagesDoc);
      
      // Clear conversation
      const convDoc = await this.db.get(`conversation_${conversationId}`);
      await this.db.remove(convDoc);
      
      console.log('✅ Cleared conversation:', conversationId);
    } catch (err: any) {
      if (err.status !== 404) {
        console.error('❌ Failed to clear conversation:', err);
      }
    }
  }

  /**
   * Clear old data
   */
  async clearOldData(daysOld: number = 30): Promise<void> {
    try {
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      
      const result = await this.db.allDocs({
        include_docs: true
      });

      const toDelete = result.rows
        .filter((row: any) => {
          const doc = row.doc;
          return doc.timestamp && doc.timestamp < cutoffTime;
        })
        .map((row: any) => ({
          _id: row.doc._id,
          _rev: row.doc._rev,
          _deleted: true
        }));

      if (toDelete.length > 0) {
        await this.db.bulkDocs(toDelete);
        console.log(`✅ Cleared ${toDelete.length} old documents`);
      }
    } catch (error) {
      console.error('❌ Failed to clear old data:', error);
    }
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<any> {
    try {
      const info = await this.db.info();
      const queue = await this.getQueue();
      
      return {
        docCount: info.doc_count,
        updateSeq: info.update_seq,
        queuedActions: queue.length,
        pendingActions: queue.filter(a => a.retryCount && a.retryCount > 0).length
      };
    } catch (error) {
      console.error('❌ Failed to get stats:', error);
      return null;
    }
  }

  /**
   * Debug dump
   */
  async debugDump(): Promise<void> {
    try {
      const allDocs = await this.db.allDocs({ include_docs: true });
      
      console.group('📊 Chat PouchDB Debug Dump');
      console.log('Total documents:', allDocs.total_rows);
      
      const categories = {
        conversations: 0,
        messages: 0,
        attachments: 0,
        presence: 0,
        platformUsers: 0,
        queue: 0,
        other: 0
      };

      allDocs.rows.forEach((row: any) => {
        const id = row.id;
        if (id.startsWith('conversations_')) categories.conversations++;
        else if (id.startsWith('conversation_')) categories.conversations++;
        else if (id.startsWith('messages_')) categories.messages++;
        else if (id.startsWith('attachment_')) categories.attachments++;
        else if (id.startsWith('presence_')) categories.presence++;
        else if (id === 'platform_users') categories.platformUsers++;
        else if (id === 'chat_action_queue') categories.queue++;
        else categories.other++;
      });

      console.table(categories);
      
      const queue = await this.getQueue();
      if (queue.length > 0) {
        console.log('📝 Queued actions:', queue);
      }
      
      console.groupEnd();
    } catch (error) {
      console.error('❌ Debug dump failed:', error);
    }
  }

  /**
   * Compact database
   */
  async compact(): Promise<void> {
    try {
      await this.db.compact();
      console.log('✅ Database compacted');
    } catch (error) {
      console.error('❌ Failed to compact database:', error);
    }
  }
}