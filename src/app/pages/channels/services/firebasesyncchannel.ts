import { Injectable, OnDestroy } from '@angular/core';
import { Database, ref, onValue, off, update, get } from '@angular/fire/database';
import { Channel } from './channel';
import { ChannelPouchDbService } from './pouch-db';
// import { ChannelPouchDbService } from '../../../services/channel-pouch-db.service';

@Injectable({
  providedIn: 'root'
})
export class ChannelFirebaseSyncService implements OnDestroy {

  private myChannelsRef: any;
  private discoverChannelsRef: any;

  // 🔁 Write queue for offline actions
  private writeQueue: Array<{
    type: 'follow' | 'unfollow' | 'syncMy' | 'syncDiscover';
    payload: any;
  }> = [];

  constructor(
    private db: Database,
    private pouchDb: ChannelPouchDbService
  ) {
    this.monitorConnection();
  }

  /* =========================
     READ - WITH POUCHDB CACHE
     ========================= */

  /**
   * Listen to My Channels with PouchDB fallback
   */
  listenMyChannels(uid: string, cb: (channels: Channel[]) => void) {
    this.myChannelsRef = ref(this.db, `channel_userdata/${uid}/my_channels`);

    onValue(this.myChannelsRef, async snap => {
      const channelIds = Object.keys(snap.val() || {}).map(Number);
      const channels = await this.getChannelsByIds(channelIds);
      
      // 🔹 Cache to PouchDB
      await this.pouchDb.saveMyChannels(uid, channels);
      
      cb(channels);
    }, async (error) => {
      console.error('❌ Firebase read error, loading from PouchDB:', error);
      // 🔹 Fallback to PouchDB
      const cachedChannels = await this.pouchDb.getMyChannels(uid);
      cb(cachedChannels);
    });
  }

  /**
   * Listen to Discover Channels with PouchDB fallback
   */
  listenDiscoverChannels(uid: string, cb: (channels: Channel[]) => void) {
    this.discoverChannelsRef = ref(this.db, `channel_userdata/${uid}/discover_channels`);

    onValue(this.discoverChannelsRef, async snap => {
      const channelIds = Object.keys(snap.val() || {}).map(Number);
      const channels = await this.getChannelsByIds(channelIds);
      
      // 🔹 Cache to PouchDB
      await this.pouchDb.saveDiscoverChannels(uid, channels);
      
      cb(channels);
    }, async (error) => {
      console.error('❌ Firebase read error, loading from PouchDB:', error);
      // 🔹 Fallback to PouchDB
      const cachedChannels = await this.pouchDb.getDiscoverChannels(uid);
      cb(cachedChannels);
    });
  }

  /**
   * Get full channel objects from Firebase cache
   */
  private async getChannelsByIds(channelIds: number[]): Promise<Channel[]> {
    if (!channelIds.length) return [];

    try {
      const snapshot = await get(ref(this.db, 'channels'));
      const allChannels = snapshot.val() || {};

      return channelIds
        .map(id => allChannels[id]?.meta)
        .filter(Boolean);
    } catch (err) {
      console.error('❌ Failed to fetch channels from Firebase:', err);
      // Try to get from PouchDB cache
      const cachedChannels: Channel[] = [];
      for (const id of channelIds) {
        const cached = await this.pouchDb.getChannel(id);
        if (cached) cachedChannels.push(cached);
      }
      return cachedChannels;
    }
  }

  /* =========================
     WRITE - WITH QUEUE
     ========================= */

  /**
   * Sync My Channels (with offline queue)
   */
  async syncMyChannels(uid: string, channels: Channel[]) {
    const payload: any = {};

    channels.forEach(ch => {
      payload[ch.channel_id] = true;
      this.upsertChannelMeta(ch); // Cache individual channels
    });

    // 🔹 Always save to PouchDB first
    await this.pouchDb.saveMyChannels(uid, channels);

    // 🔹 Try Firebase or queue
    if (navigator.onLine) {
      try {
        await update(ref(this.db), {
          [`channel_userdata/${uid}/my_channels`]: payload
        });
      } catch (error) {
        console.error('❌ Firebase sync failed, queuing:', error);
        this.enqueueWrite('syncMy', { uid, channels });
      }
    } else {
      console.log('📴 Offline: queuing my channels sync');
      this.enqueueWrite('syncMy', { uid, channels });
    }
  }

  /**
   * Sync Discover Channels (with offline queue)
   */
  async syncDiscoverChannels(uid: string, channels: Channel[]) {
    const payload: any = {};

    channels.forEach(ch => {
      payload[ch.channel_id] = true;
      this.upsertChannelMeta(ch);
    });

    // 🔹 Always save to PouchDB first
    await this.pouchDb.saveDiscoverChannels(uid, channels);

    // 🔹 Try Firebase or queue
    if (navigator.onLine) {
      try {
        await update(ref(this.db), {
          [`channel_userdata/${uid}/discover_channels`]: payload
        });
      } catch (error) {
        console.error('❌ Firebase sync failed, queuing:', error);
        this.enqueueWrite('syncDiscover', { uid, channels });
      }
    } else {
      console.log('📴 Offline: queuing discover channels sync');
      this.enqueueWrite('syncDiscover', { uid, channels });
    }
  }

  /**
   * Follow Channel (with offline queue)
   */
  async followChannel(uid: string, channel: Channel) {
    await this.upsertChannelMeta(channel);
    
    // 🔹 Queue the action to PouchDB
    await this.pouchDb.enqueueAction({
      type: 'follow',
      channelId: channel.channel_id,
      userId: uid,
      channel,
      timestamp: Date.now()
    });

    if (navigator.onLine) {
      try {
        await update(ref(this.db), {
          [`channel_userdata/${uid}/my_channels/${channel.channel_id}`]: true,
          [`channel_userdata/${uid}/discover_channels/${channel.channel_id}`]: null
        });
      } catch (error) {
        console.error('❌ Follow failed, queued for retry:', error);
        this.enqueueWrite('follow', { uid, channel });
      }
    } else {
      console.log('📴 Offline: follow action queued');
      this.enqueueWrite('follow', { uid, channel });
    }
  }

  /**
   * Unfollow Channel (with offline queue)
   */
  async unfollowChannel(uid: string, channelId: number) {
    // 🔹 Queue the action to PouchDB
    await this.pouchDb.enqueueAction({
      type: 'unfollow',
      channelId,
      userId: uid,
      timestamp: Date.now()
    });

    if (navigator.onLine) {
      try {
        await update(ref(this.db), {
          [`channel_userdata/${uid}/my_channels/${channelId}`]: null,
          [`channel_userdata/${uid}/discover_channels/${channelId}`]: true
        });
      } catch (error) {
        console.error('❌ Unfollow failed, queued for retry:', error);
        this.enqueueWrite('unfollow', { uid, channelId });
      }
    } else {
      console.log('📴 Offline: unfollow action queued');
      this.enqueueWrite('unfollow', { uid, channelId });
    }
  }

  /**
   * Cache individual channel metadata
   */
  private async upsertChannelMeta(channel: Channel) {
    // 🔹 Save to PouchDB
    await this.pouchDb.saveChannel(channel);

    // 🔹 Try Firebase
    if (navigator.onLine) {
      try {
        await update(ref(this.db), {
          [`channels/${channel.channel_id}/meta`]: {
            channel_id: channel.channel_id,
            channel_name: channel.channel_name,
            channel_dp: channel.channel_dp,
            followers_count: channel.followers_count || 0,
            created_by: channel.created_by || 0,
            creator_name: channel.creator_name || ''
          }
        });
      } catch (error) {
        console.error('❌ Failed to cache channel meta to Firebase:', error);
      }
    }
  }

  /* =========================
     WRITE QUEUE MANAGEMENT
     ========================= */

  private enqueueWrite(type: string, payload: any) {
    this.writeQueue.push({ type: type as any, payload });
  }

  private async flushQueue() {
    if (!navigator.onLine || this.writeQueue.length === 0) return;

    console.log(`🔄 Flushing ${this.writeQueue.length} queued operations...`);

    while (this.writeQueue.length > 0) {
      const item = this.writeQueue.shift();
      if (!item) continue;

      try {
        switch (item.type) {
          case 'follow':
            await update(ref(this.db), {
              [`channel_userdata/${item.payload.uid}/my_channels/${item.payload.channel.channel_id}`]: true,
              [`channel_userdata/${item.payload.uid}/discover_channels/${item.payload.channel.channel_id}`]: null
            });
            break;

          case 'unfollow':
            await update(ref(this.db), {
              [`channel_userdata/${item.payload.uid}/my_channels/${item.payload.channelId}`]: null,
              [`channel_userdata/${item.payload.uid}/discover_channels/${item.payload.channelId}`]: true
            });
            break;

          case 'syncMy':
            const myPayload: any = {};
            item.payload.channels.forEach((ch: Channel) => {
              myPayload[ch.channel_id] = true;
            });
            await update(ref(this.db), {
              [`channel_userdata/${item.payload.uid}/my_channels`]: myPayload
            });
            break;

          case 'syncDiscover':
            const discoverPayload: any = {};
            item.payload.channels.forEach((ch: Channel) => {
              discoverPayload[ch.channel_id] = true;
            });
            await update(ref(this.db), {
              [`channel_userdata/${item.payload.uid}/discover_channels`]: discoverPayload
            });
            break;
        }

        console.log(`✅ Synced queued ${item.type}`);
      } catch (error) {
        console.error(`❌ Failed to sync ${item.type}, re-queuing:`, error);
        this.writeQueue.unshift(item); // Put it back
        break; // Stop processing if one fails
      }
    }

    // 🔹 Clear PouchDB queue after successful flush
    if (this.writeQueue.length === 0) {
      await this.pouchDb.clearQueue();
    }
  }

  /* =========================
     CONNECTION MONITORING
     ========================= */

  private monitorConnection() {
    window.addEventListener('online', () => {
      console.log('🟢 Back online → flushing queue');
      this.flushQueue();
    });
  }

  /* =========================
     OFFLINE-FIRST RELOAD
     ========================= */

  /**
   * Load from PouchDB immediately, Firebase will update in background
   */
  async reloadMyChannels(uid: string, cb: (channels: Channel[]) => void) {
    console.log('🔄 Loading my channels from PouchDB...');
    const cached = await this.pouchDb.getMyChannels(uid);
    cb(cached);
    // Firebase listener will update automatically if online
  }

  async reloadDiscoverChannels(uid: string, cb: (channels: Channel[]) => void) {
    console.log('🔄 Loading discover channels from PouchDB...');
    const cached = await this.pouchDb.getDiscoverChannels(uid);
    cb(cached);
    // Firebase listener will update automatically if online
  }

  /* =========================
     LEGACY METHODS
     ========================= */

  listenMyChannelIds(uid: string, cb: (ids: number[]) => void) {
    this.myChannelsRef = ref(this.db, `channel_userdata/${uid}/my_channels`);
    onValue(this.myChannelsRef, snap => {
      cb(Object.keys(snap.val() || {}).map(Number));
    });
  }

  listenDiscoverChannelIds(uid: string, cb: (ids: number[]) => void) {
    this.discoverChannelsRef = ref(this.db, `channel_userdata/${uid}/discover_channels`);
    onValue(this.discoverChannelsRef, snap => {
      cb(Object.keys(snap.val() || {}).map(Number));
    });
  }

  cacheChannelMeta(uid: string, channel: Channel) {
    return this.upsertChannelMeta(channel);
  }

  updateLastSync(uid: string) {
    return update(ref(this.db), {
      [`channel_userdata/${uid}/meta/last_sync`]: Date.now()
    });
  }

  /* =========================
     CLEANUP
     ========================= */

  ngOnDestroy() {
    if (this.myChannelsRef) off(this.myChannelsRef);
    if (this.discoverChannelsRef) off(this.discoverChannelsRef);
  }
}