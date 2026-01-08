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
  private isOnline: boolean = true;

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

      const channels = channelIds
        .map(id => allChannels[id]?.meta)
        .filter(Boolean);

      // 🔹 Cache individual channels to PouchDB
      for (const channel of channels) {
        await this.pouchDb.saveChannel(channel);
      }

      return channels;
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
     WRITE - WITH UNIFIED QUEUE
     ========================= */

  /**
   * Sync My Channels (with offline queue)
   */
  async syncMyChannels(uid: string, channels: Channel[]) {
    const payload: any = {};

    // Build Firebase payload
    channels.forEach(ch => {
      payload[ch.channel_id] = true;
    });

    // 🔹 Always save to PouchDB first (offline-first)
    await this.pouchDb.saveMyChannels(uid, channels);

    // 🔹 Cache individual channels
    for (const ch of channels) {
      await this.upsertChannelMeta(ch);
    }

    // 🔹 Try Firebase or queue
    if (this.isOnline) {
      try {
        await update(ref(this.db), {
          [`channel_userdata/${uid}/my_channels`]: payload
        });
        console.log('✅ Synced my channels to Firebase');
      } catch (error) {
        console.error('❌ Firebase sync failed, queuing:', error);
        await this.enqueueChannelSync('my', uid, channels);
      }
    } else {
      console.log('📴 Offline: queuing my channels sync');
      await this.enqueueChannelSync('my', uid, channels);
    }
  }

  /**
   * Sync Discover Channels (with offline queue)
   */
  async syncDiscoverChannels(uid: string, channels: Channel[]) {
    const payload: any = {};

    channels.forEach(ch => {
      payload[ch.channel_id] = true;
    });

    // 🔹 Always save to PouchDB first
    await this.pouchDb.saveDiscoverChannels(uid, channels);

    // 🔹 Cache individual channels
    for (const ch of channels) {
      await this.upsertChannelMeta(ch);
    }

    // 🔹 Try Firebase or queue
    if (this.isOnline) {
      try {
        await update(ref(this.db), {
          [`channel_userdata/${uid}/discover_channels`]: payload
        });
        console.log('✅ Synced discover channels to Firebase');
      } catch (error) {
        console.error('❌ Firebase sync failed, queuing:', error);
        await this.enqueueChannelSync('discover', uid, channels);
      }
    } else {
      console.log('📴 Offline: queuing discover channels sync');
      await this.enqueueChannelSync('discover', uid, channels);
    }
  }

  /**
   * Follow Channel (with offline queue)
   */
  async followChannel(uid: string, channel: Channel) {
    // 🔹 Cache channel metadata
    await this.upsertChannelMeta(channel);
    
    // 🔹 Queue to unified PouchDB queue
    await this.pouchDb.enqueueAction({
      type: 'channel_follow',
      channelId: String(channel.channel_id),
      data: { uid, channel },
      timestamp: Date.now()
    });

    // 🔹 Try immediate execution if online
    if (this.isOnline) {
      try {
        await update(ref(this.db), {
          [`channel_userdata/${uid}/my_channels/${channel.channel_id}`]: true,
          [`channel_userdata/${uid}/discover_channels/${channel.channel_id}`]: null
        });
        console.log('✅ Follow synced to Firebase');
      } catch (error) {
        console.error('❌ Follow failed, will retry when online:', error);
      }
    } else {
      console.log('📴 Offline: follow action queued');
    }
  }

  /**
   * Unfollow Channel (with offline queue)
   */
  async unfollowChannel(uid: string, channelId: number) {
    // 🔹 Queue to unified PouchDB queue
    await this.pouchDb.enqueueAction({
      type: 'channel_unfollow',
      channelId: String(channelId),
      data: { uid, channelId },
      timestamp: Date.now()
    });

    // 🔹 Try immediate execution if online
    if (this.isOnline) {
      try {
        await update(ref(this.db), {
          [`channel_userdata/${uid}/my_channels/${channelId}`]: null,
          [`channel_userdata/${uid}/discover_channels/${channelId}`]: true
        });
        console.log('✅ Unfollow synced to Firebase');
      } catch (error) {
        console.error('❌ Unfollow failed, will retry when online:', error);
      }
    } else {
      console.log('📴 Offline: unfollow action queued');
    }
  }

  /**
   * Cache individual channel metadata
   */
  private async upsertChannelMeta(channel: Channel) {
    // 🔹 Always save to PouchDB first
    await this.pouchDb.saveChannel(channel);

    // 🔹 Try Firebase if online
    if (this.isOnline) {
      try {
        await update(ref(this.db), {
          [`channels/${channel.channel_id}/meta`]: {
            channel_id: channel.channel_id,
            channel_name: channel.channel_name,
            channel_dp: channel.channel_dp,
            followers_count: channel.followers_count || 0,
            created_by: channel.created_by || 0,
            creator_name: channel.creator_name || '',
            is_verified: channel.is_verified || false
          }
        });
      } catch (error) {
        console.error('❌ Failed to cache channel meta to Firebase:', error);
      }
    }
  }

  /* =========================
     QUEUE HELPERS
     ========================= */

  /**
   * Helper to enqueue channel sync actions
   */
  private async enqueueChannelSync(type: 'my' | 'discover', uid: string, channels: Channel[]) {
    await this.pouchDb.enqueueAction({
      type: type === 'my' ? 'channel_follow' : 'channel_unfollow',
      data: { uid, channels, syncType: type },
      timestamp: Date.now()
    });
  }

  /**
   * Flush queued channel actions
   * Called by PostService or can be called manually
   */
  async flushChannelQueue() {
    if (!this.isOnline) return;

    const queue = await this.pouchDb.getQueue();
    
    // Filter only channel actions
    const channelActions = queue.filter(a => 
      a.type === 'channel_follow' || 
      a.type === 'channel_unfollow'
    );

    if (channelActions.length === 0) return;

    console.log(`🔄 Flushing ${channelActions.length} channel actions...`);

    for (let i = channelActions.length - 1; i >= 0; i--) {
      const action = channelActions[i];

      try {
        if (action.type === 'channel_follow') {
          const { uid, channel } = action.data;

          if (channel) {
            // Single follow
            await update(ref(this.db), {
              [`channel_userdata/${uid}/my_channels/${channel.channel_id}`]: true,
              [`channel_userdata/${uid}/discover_channels/${channel.channel_id}`]: null
            });
          } else if (action.data.channels) {
            // Bulk sync
            const payload: any = {};
            action.data.channels.forEach((ch: Channel) => {
              payload[ch.channel_id] = true;
            });
            await update(ref(this.db), {
              [`channel_userdata/${uid}/my_channels`]: payload
            });
          }
        } 
        else if (action.type === 'channel_unfollow') {
          const { uid, channelId, channels } = action.data;

          if (channelId) {
            // Single unfollow
            await update(ref(this.db), {
              [`channel_userdata/${uid}/my_channels/${channelId}`]: null,
              [`channel_userdata/${uid}/discover_channels/${channelId}`]: true
            });
          } else if (channels) {
            // Bulk sync
            const payload: any = {};
            channels.forEach((ch: Channel) => {
              payload[ch.channel_id] = true;
            });
            await update(ref(this.db), {
              [`channel_userdata/${uid}/discover_channels`]: payload
            });
          }
        }

        console.log(`✅ Synced queued ${action.type}`);

        // Remove from queue
        const queueIndex = queue.indexOf(action);
        if (queueIndex !== -1) {
          await this.pouchDb.removeFromQueue(queueIndex);
        }

      } catch (error) {
        console.error(`❌ Failed to sync ${action.type}:`, error);
        // Keep in queue for retry
        break;
      }
    }
  }

  /* =========================
     CONNECTION MONITORING
     ========================= */

  private monitorConnection() {
    // Monitor Firebase connection
    const connectedRef = ref(this.db, '.info/connected');
    onValue(connectedRef, (snapshot) => {
      const wasOnline = this.isOnline;
      this.isOnline = snapshot.val() === true;

      if (this.isOnline && !wasOnline) {
        console.log('🟢 Firebase connected → flushing channel queue');
        this.flushChannelQueue();
      } else if (!this.isOnline) {
        console.log('📴 Firebase disconnected');
      }
    });

    // Monitor browser online/offline
    window.addEventListener('online', () => {
      console.log('🟢 Browser online → flushing channel queue');
      this.isOnline = true;
      this.flushChannelQueue();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Browser offline');
      this.isOnline = false;
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
     UTILITY METHODS
     ========================= */

  /**
   * Get current online status
   */
  isConnected(): boolean {
    return this.isOnline;
  }

  /**
   * Get queued channel actions
   */
  async getQueuedChannelActions() {
    const queue = await this.pouchDb.getQueue();
    return queue.filter(a => 
      a.type === 'channel_follow' || 
      a.type === 'channel_unfollow'
    );
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
    if (!this.isOnline) return Promise.resolve();
    
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