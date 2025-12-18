import { Injectable, OnDestroy } from '@angular/core';
import { Database, ref, onValue, off, update, get } from '@angular/fire/database';
import { Channel } from './channel';
import { Storage } from '@ionic/storage-angular';


@Injectable({
  providedIn: 'root'
})
export class ChannelFirebaseSyncService  {

  private myChannelsRef: any;
  private discoverChannelsRef: any;
  private channelsCache: Record<number, any> = {};
  private channelsCacheInitialized = false;


  // private channelCacheRef: any;

  constructor(private db: Database,  private storage: Storage) {
    this.storage.create();
  }

//   listenChannelMeta() {
//   onValue(ref(this.db, 'channels'), snap => {
//     this.channelsCache = snap.val() || {};
//     console.log('🟢 CHANNEL META SNAPSHOT', snap.exists(), snap.val());
//   });
// }
// listenChannelMeta() {
//   if (this.channelsCacheInitialized) return;

//   this.channelsCacheInitialized = true;

//   onValue(ref(this.db, 'channels'), snap => {
//     console.log('🟢 CHANNEL META SNAPSHOT', snap.exists());
//     this.channelsCache = snap.val() || {};
//   });
// }

listenChannelMeta() {
  onValue(ref(this.db, 'channels'), async snap => {
    if (!snap.exists()) return;

    const data = snap.val();
    this.channelsCache = data;

    // 🔥 Persist for cold-start offline
    await this.storage.set('channels_meta', data);

    console.log('✅ Channel meta cached to storage');
  });
}
async loadChannelMetaFromStorage() {
  const cached = await this.storage.get('channels_meta');

  if (cached) {
    this.channelsCache = cached;
    console.log('🟡 Channel meta loaded from storage');
  }
}


  /* =========================
     READ - WITH FULL CHANNEL DATA
     ========================= */

  /**
   * Listen to my channels with full metadata from cache
   */
  // listenMyChannels(uid: string, cb: (channels: Channel[]) => void) {
  //   this.myChannelsRef = ref(this.db, `channel_userdata/${uid}/my_channels`);
    
  //   onValue(this.myChannelsRef, async (snap) => {
  //     const channelIds = Object.keys(snap.val() || {}).map(Number);
      
  //     if (channelIds.length === 0) {
  //       cb([]);
  //       return;
  //     }

  //     // Fetch full channel data from cache
  //     const channels = await this.getChannelsFromCache(uid, channelIds);
  //     cb(channels);
  //   });
  // }
// listenMyChannels(uid: string, cb: (channels: Channel[]) => void) {
//   this.myChannelsRef = ref(this.db, `channel_userdata/${uid}/my_channels`);

//   onValue(this.myChannelsRef, snap => {
//     const ids = Object.keys(snap.val() || {}).map(Number);

//     const channels = ids
//       .map(id => this.channelsCache[id]?.meta)
//       .filter(Boolean);

//     cb(channels);
//   });
// }

listenMyChannels(uid: string, cb: (channels: Channel[]) => void) {
  this.myChannelsRef = ref(this.db, `channel_userdata/${uid}/my_channels`);

  onValue(this.myChannelsRef, snap => {
    const ids = Object.keys(snap.val() || {}).map(Number);

    // 🔥 STEP 6 LOGIC
    const channels = ids
      .map(id => this.channelsCache?.[id]?.meta)
      .filter(Boolean);

    cb(channels);
  });
}

  /**
   * Listen to discover channels with full metadata from cache
   */
  // listenDiscoverChannels(uid: string, cb: (channels: Channel[]) => void) {
  //   this.discoverChannelsRef = ref(this.db, `channel_userdata/${uid}/discover_channels`);
    
  //   onValue(this.discoverChannelsRef, async (snap) => {
  //     const channelIds = Object.keys(snap.val() || {}).map(Number);
      
  //     if (channelIds.length === 0) {
  //       cb([]);
  //       return;
  //     }

  //     // Fetch full channel data from cache
  //     const channels = await this.getChannelsFromCache(uid, channelIds);
  //     cb(channels);
  //   });
  // }

//  listenDiscoverChannels(uid: string, cb: (channels: Channel[]) => void) {
//   this.discoverChannelsRef = ref(this.db, `channel_userdata/${uid}/discover_channels`);

//   onValue(this.discoverChannelsRef, snap => {
//     const ids = Object.keys(snap.val() || {}).map(Number);

//     const channels = ids
//       .map(id => this.channelsCache[id]?.meta)
//       .filter(Boolean);

//     cb(channels);
//   });
// }

listenDiscoverChannels(uid: string, cb: (channels: Channel[]) => void) {
  this.discoverChannelsRef = ref(this.db, `channel_userdata/${uid}/discover_channels`);

  onValue(this.discoverChannelsRef, snap => {
    const ids = Object.keys(snap.val() || {}).map(Number);

    const channels = ids
      .map(id => this.channelsCache?.[id]?.meta)
      .filter(Boolean);

    cb(channels);
  });
}


  /**
   * Get full channel objects from cache
   */
  private async getChannelsFromCache(uid: string, channelIds: number[]): Promise<Channel[]> {
    const cacheRef = ref(this.db, `channel_userdata/${uid}/channel_cache`);
    
    try {
      const snapshot = await get(cacheRef);
      const cache = snapshot.val() || {};
      
      const channels: Channel[] = [];
      
      for (const id of channelIds) {
        const cached = cache[id];
        if (cached) {
          channels.push({
            channel_id: id,
            channel_name: cached.channel_name || 'Unknown Channel',
            channel_dp: cached.channel_dp || 'assets/images/user.jfif',
            followers_count: cached.followers_count || 0,
            description: cached.description || '',
            created_by: cached.created_by || 0,
            creator_name: cached.creator_name || '',
            is_public: cached.is_public ?? 1,
            max_members: cached.max_members || null,
            firebase_channel_id: cached.firebase_channel_id || '',
            category_id: cached.category_id || 0,
            category_name: cached.category_name || '',
            region_id: cached.region_id || 0,
            region_name: cached.region_name || '',
            created_at: cached.created_at || '',
            is_verified: cached.is_verified || null,
            role_id: cached.role_id || null,
            is_following: cached.is_following || null
          });
        }
      }
      
      return channels;
    } catch (error) {
      console.error('Error fetching from cache:', error);
      return [];
    }
  }

  /**
   * Legacy method - just returns IDs
   */
  listenMyChannelIds(uid: string, cb: (ids: number[]) => void) {
    this.myChannelsRef = ref(this.db, `channel_userdata/${uid}/my_channels`);
    onValue(this.myChannelsRef, snap => {
      cb(Object.keys(snap.val() || {}).map(Number));
    });
  }

  /**
   * Legacy method - just returns IDs
   */
  listenDiscoverChannelIds(uid: string, cb: (ids: number[]) => void) {
    this.discoverChannelsRef = ref(this.db, `channel_userdata/${uid}/discover_channels`);
    onValue(this.discoverChannelsRef, snap => {
      cb(Object.keys(snap.val() || {}).map(Number));
    });
  }

  /* =========================
     CLEANUP
     ========================= */

  // ngOnDestroy() {
  //   // if (this.myChannelsRef) off(this.myChannelsRef);
  //   // if (this.discoverChannelsRef) off(this.discoverChannelsRef);
  //   // if (this.channelCacheRef) off(this.channelCacheRef);
  // }

  /* =========================
     WRITE
     ========================= */

  // syncMyChannels(uid: string, channels: Channel[]) {
  //   const payload: any = {};
  //   channels.forEach(ch => {
  //     payload[ch.channel_id] = true;
  //     // Also cache the metadata
  //     // this.cacheChannelMeta(uid, ch);
  //     this.upsertChannelMeta(ch);

  //   });
    
  //   return update(ref(this.db), {
  //     [`channel_userdata/${uid}/my_channels`]: payload
  //   });
  // }

  syncMyChannels(uid: string, channels: Channel[]) {
  const payload: any = {};

  channels.forEach(ch => {
    payload[ch.channel_id] = true;
    this.upsertChannelMeta(ch); // 🔥 global
  });

  return update(ref(this.db), {
    [`channel_userdata/${uid}/my_channels`]: payload
  });
}


  // syncDiscoverChannels(uid: string, channels: Channel[]) {
  //   const payload: any = {};
  //   channels.forEach(ch => {
  //     payload[ch.channel_id] = true;
  //     // Also cache the metadata
  //     // this.cacheChannelMeta(uid, ch);
  //     this.upsertChannelMeta(ch);

  //   });
    
  //   return update(ref(this.db), {
  //     [`channel_userdata/${uid}/discover_channels`]: payload
  //   });
  // }

  syncDiscoverChannels(uid: string, channels: Channel[]) {
  const payload: any = {};

  channels.forEach(ch => {
    payload[ch.channel_id] = true;
    this.upsertChannelMeta(ch);
  });

  return update(ref(this.db), {
    [`channel_userdata/${uid}/discover_channels`]: payload
  });
}


  // followChannel(uid: string, channel: Channel) {
  //   // Cache metadata before moving
  //   this.cacheChannelMeta(uid, channel);
    
  //   return update(ref(this.db), {
  //     [`channel_userdata/${uid}/my_channels/${channel.channel_id}`]: true,
  //     [`channel_userdata/${uid}/discover_channels/${channel.channel_id}`]: null
  //   });
  // }

  followChannel(uid: string, channel: Channel) {
  this.upsertChannelMeta(channel);

  return update(ref(this.db), {
    [`channel_userdata/${uid}/my_channels/${channel.channel_id}`]: true,
    [`channel_userdata/${uid}/discover_channels/${channel.channel_id}`]: null
  });
}


  // unfollowChannel(uid: string, channelId: number) {
  //   return update(ref(this.db), {
  //     [`channel_userdata/${uid}/my_channels/${channelId}`]: null,
  //     [`channel_userdata/${uid}/discover_channels/${channelId}`]: true
  //   });
  // }

  unfollowChannel(uid: string, channelId: number) {
  return update(ref(this.db), {
    [`channel_userdata/${uid}/my_channels/${channelId}`]: null,
    // [`channel_userdata/${uid}/discover_channels/${channelId}`]: true
  });
}


  // cacheChannelMeta(uid: string, channel: Channel) {
  //   return update(ref(this.db), {
  //     [`channel_userdata/${uid}/channel_cache/${channel.channel_id}`]: {
  //       channel_name: channel.channel_name,
  //       channel_dp: channel.channel_dp,
  //       followers_count: channel.followers_count,
  //       description: channel.description || '',
  //       created_by: channel.created_by || 0,
  //       creator_name: channel.creator_name || '',
  //       is_public: channel.is_public ?? 1,
  //       firebase_channel_id: channel.firebase_channel_id || '',
  //       category_id: channel.category_id || 0,
  //       category_name: channel.category_name || '',
  //       region_id: channel.region_id || 0,
  //       region_name: channel.region_name || '',
  //       created_at: channel.created_at || '',
  //       is_verified: channel.is_verified || null
  //     }
  //   });
  // }

  updateLastSync(uid: string) {
  return update(ref(this.db), {
    [`channel_userdata/${uid}/meta/last_sync`]: Date.now()
  });
}

private async upsertChannelMeta(channel: Channel) {
  return update(ref(this.db), {
    [`channels/${channel.channel_id}/meta`]: {
      channel_id: channel.channel_id,
      channel_name: channel.channel_name,
      channel_dp: channel.channel_dp,
      followers_count: channel.followers_count || 0,
      description: channel.description || '',
      created_by: channel.created_by || 0,
      creator_name: channel.creator_name || '',
      is_public: channel.is_public ?? 1,
      firebase_channel_id: channel.firebase_channel_id || '',
      category_id: channel.category_id || 0,
      category_name: channel.category_name || '',
      region_id: channel.region_id || 0,
      region_name: channel.region_name || '',
      created_at: channel.created_at || '',
      is_verified: channel.is_verified || null
    }
  });
}

// private async getChannelsByIds(channelIds: number[]): Promise<Channel[]> {
//   if (!channelIds.length) return [];

//   try {
//     const snapshot = await get(ref(this.db, 'channels'));
//     const allChannels = snapshot.val() || {};

//     return channelIds
//       .map(id => allChannels[id]?.meta)
//       .filter(Boolean);
//   } catch (err) {
//     console.error('❌ Failed to fetch channels', err);
//     return [];
//   }
// }

bootstrapChannelCache() {
  onValue(ref(this.db, 'channels'), () => {}, { onlyOnce: true });
}


}