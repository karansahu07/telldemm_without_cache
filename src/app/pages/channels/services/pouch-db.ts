// import { Injectable } from '@angular/core';

// @Injectable({
//   providedIn: 'root'
// })
// export class PouchDb {
  
// }
import { Injectable } from '@angular/core';
import PouchDB from 'pouchdb';
import { Channel } from './channel';
// import { Channel } from '../pages/channels/services/channel';

@Injectable({
  providedIn: 'root'
})
export class ChannelPouchDbService {
  private db: PouchDB.Database;

  constructor() {
    this.db = new PouchDB('channels_offline_db');
  }

  /* =========================
     MY CHANNELS
     ========================= */
  
  async saveMyChannels(userId: string, channels: Channel[]): Promise<void> {
    try {
      const docId = `my_channels_${userId}`;
      
      try {
        const existing = await this.db.get(docId);
        await this.db.put({
          _id: docId,
          _rev: existing._rev,
          channels,
          userId,
          timestamp: Date.now()
        });
      } catch (err: any) {
        if (err.status === 404) {
          await this.db.put({
            _id: docId,
            channels,
            userId,
            timestamp: Date.now()
          });
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error('❌ Failed to save my channels to PouchDB:', error);
    }
  }

  async getMyChannels(userId: string): Promise<Channel[]> {
    try {
      const docId = `my_channels_${userId}`;
      const doc: any = await this.db.get(docId);
      return doc.channels || [];
    } catch (err: any) {
      if (err.status === 404) {
        return [];
      }
      console.error('❌ Failed to get my channels from PouchDB:', err);
      return [];
    }
  }

  /* =========================
     DISCOVER CHANNELS
     ========================= */
  
  async saveDiscoverChannels(userId: string, channels: Channel[]): Promise<void> {
    try {
      const docId = `discover_channels_${userId}`;
      
      try {
        const existing = await this.db.get(docId);
        await this.db.put({
          _id: docId,
          _rev: existing._rev,
          channels,
          userId,
          timestamp: Date.now()
        });
      } catch (err: any) {
        if (err.status === 404) {
          await this.db.put({
            _id: docId,
            channels,
            userId,
            timestamp: Date.now()
          });
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error('❌ Failed to save discover channels to PouchDB:', error);
    }
  }

  async getDiscoverChannels(userId: string): Promise<Channel[]> {
    try {
      const docId = `discover_channels_${userId}`;
      const doc: any = await this.db.get(docId);
      return doc.channels || [];
    } catch (err: any) {
      if (err.status === 404) {
        return [];
      }
      console.error('❌ Failed to get discover channels from PouchDB:', err);
      return [];
    }
  }

  /* =========================
     SINGLE CHANNEL CACHE
     ========================= */
  
  async saveChannel(channel: Channel): Promise<void> {
    try {
      const docId = `channel_${channel.channel_id}`;
      
      try {
        const existing = await this.db.get(docId);
        await this.db.put({
          _id: docId,
          _rev: existing._rev,
          ...channel,
          timestamp: Date.now()
        });
      } catch (err: any) {
        if (err.status === 404) {
          await this.db.put({
            _id: docId,
            ...channel,
            timestamp: Date.now()
          });
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error('❌ Failed to save channel to PouchDB:', error);
    }
  }

  async getChannel(channelId: number): Promise<Channel | null> {
    try {
      const docId = `channel_${channelId}`;
      const doc: any = await this.db.get(docId);
      
      // Remove PouchDB metadata
      const { _id, _rev, timestamp, ...channel } = doc;
      return channel as Channel;
    } catch (err: any) {
      if (err.status === 404) {
        return null;
      }
      console.error('❌ Failed to get channel from PouchDB:', err);
      return null;
    }
  }

  /* =========================
     WRITE QUEUE (for offline actions)
     ========================= */
  
  async enqueueAction(action: {
    type: 'follow' | 'unfollow';
    channelId: number;
    userId: string;
    channel?: Channel;
    timestamp: number;
  }): Promise<void> {
    try {
      const queueDoc = await this.getOrCreateQueue();
      queueDoc.actions.push(action);
      
      await this.db.put({
        _id: 'write_queue',
        _rev: queueDoc._rev,
        actions: queueDoc.actions
      });
    } catch (error) {
      console.error('❌ Failed to enqueue action:', error);
    }
  }

  async getQueue(): Promise<any[]> {
    try {
      const doc: any = await this.db.get('write_queue');
      return doc.actions || [];
    } catch (err: any) {
      if (err.status === 404) {
        return [];
      }
      console.error('❌ Failed to get queue:', err);
      return [];
    }
  }

  async clearQueue(): Promise<void> {
    try {
      const doc: any = await this.db.get('write_queue');
      await this.db.put({
        _id: 'write_queue',
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
      return await this.db.get('write_queue');
    } catch (err: any) {
      if (err.status === 404) {
        const newQueue = {
          _id: 'write_queue',
          actions: []
        };
        await this.db.put(newQueue);
        return { ...newQueue, _rev: undefined };
      }
      throw err;
    }
  }

  /* =========================
     UTILITY
     ========================= */
  
  async clearAll(): Promise<void> {
    try {
      await this.db.destroy();
      this.db = new PouchDB('channels_offline_db');
      console.log('✅ PouchDB cleared and recreated');
    } catch (error) {
      console.error('❌ Failed to clear PouchDB:', error);
    }
  }

  async getStats(): Promise<any> {
    try {
      const info = await this.db.info();
      return {
        docCount: info.doc_count,
        updateSeq: info.update_seq
      };
    } catch (error) {
      console.error('❌ Failed to get PouchDB stats:', error);
      return null;
    }
  }
}