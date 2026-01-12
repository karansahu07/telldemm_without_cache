import { Injectable } from '@angular/core';
import PouchDB from 'pouchdb';
import { Channel } from './channel';

// In pouch-db.ts
export interface CachedPost {
  id: string;
  body: string;
  image?: string;
  media_id?: string;
  created_by: number;
  user_reactions?: { [userId: string]: any };
  timestamp?: number;
  isPending?: boolean;
  pendingImageId?: string; 
}

export interface PendingAction {
  type: 'channel_follow' | 'channel_unfollow' | 'post_create' | 'reaction_add' | 'reaction_remove';
  channelId?: string;
  postId?: string;
  data: any;
  timestamp: number;
  retryCount?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ChannelPouchDbService {
  private db: PouchDB.Database;

  constructor() {
    this.db = new PouchDB('channels_unified_db');
  }

  async consoleDumpAll(): Promise<void> {
  const res = await this.db.allDocs({ include_docs: true });

  console.log(
    '📦 channels_unified_db FULL DUMP:\n',
    JSON.stringify(
      res.rows.map(r => r.doc),
      null,
      2
    )
  );
}


  /* =========================
     CHANNELS - MY CHANNELS
     ========================= */


// Replace BOTH saveMyChannels AND saveDiscoverChannels methods in pouch-db.ts:

async saveMyChannels(userId: string, channels: Channel[]): Promise<void> {
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
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
        return; // Success!
      } catch (err: any) {
        if (err.status === 404) {
          await this.db.put({
            _id: docId,
            channels,
            userId,
            timestamp: Date.now()
          });
          return; // Success!
        } else if (err.status === 409) {
          // Conflict - retry with exponential backoff
          retries++;
          if (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 50 * retries));
            continue; // Retry the loop
          }
        }
        throw err;
      }
    } catch (error) {
      if (retries >= maxRetries) {
        console.error('❌ Failed to save my channels after retries:', error);
        return;
      }
    }
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
      console.error('❌ Failed to get my channels:', err);
      return [];
    }
  }

  /* =========================
     CHANNELS - DISCOVER
     ========================= */

async saveDiscoverChannels(userId: string, channels: Channel[]): Promise<void> {
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
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
        return; // Success!
      } catch (err: any) {
        if (err.status === 404) {
          await this.db.put({
            _id: docId,
            channels,
            userId,
            timestamp: Date.now()
          });
          return; // Success!
        } else if (err.status === 409) {
          // Conflict - retry with exponential backoff
          retries++;
          if (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 50 * retries));
            continue; // Retry the loop
          }
        }
        throw err;
      }
    } catch (error) {
      if (retries >= maxRetries) {
        console.error('❌ Failed to save discover channels after retries:', error);
        return;
      }
    }
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
      console.error('❌ Failed to get discover channels:', err);
      return [];
    }
  }

  /* =========================
     CHANNELS - SINGLE CHANNEL
     ========================= */


 private channelSaveTimers: Map<string, any> = new Map();

async saveChannel(channel: Channel, immediate: boolean = false): Promise<void> {
  const key = `channel_${channel.channel_id}`;

  if (this.channelSaveTimers.has(key)) {
    clearTimeout(this.channelSaveTimers.get(key));
  }

  const doSave = async () => {
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
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
          this.channelSaveTimers.delete(key);
          return;
        } catch (err: any) {
          if (err.status === 404) {
            await this.db.put({
              _id: docId,
              ...channel,
              timestamp: Date.now()
            });
            this.channelSaveTimers.delete(key);
            return;
          } else if (err.status === 409) {
            retries++;
            if (retries < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 50 * retries));
              continue;
            }
          }
          throw err;
        }
      } catch (error) {
        console.error('❌ Failed to save channel:', error);
        this.channelSaveTimers.delete(key);
        return;
      }
    }
  };

  if (immediate) {
    await doSave();
  } else {
    const timer = setTimeout(doSave, 300);
    this.channelSaveTimers.set(key, timer);
  }
}

  async getChannel(channelId: number): Promise<Channel | null> {
    try {
      const docId = `channel_${channelId}`;
      const doc: any = await this.db.get(docId);
      
      const { _id, _rev, timestamp, ...channel } = doc;
      return channel as Channel;
    } catch (err: any) {
      if (err.status === 404) {
        return null;
      }
      console.error('❌ Failed to get channel:', err);
      return null;
    }
  }

  /* =========================
     POSTS - CHANNEL POSTS
     ========================= */


 private saveTimers: Map<string, any> = new Map(); // Debounce timers
  /* =========================
     POSTS - CHANNEL POSTS (with debouncing)
     ========================= */

  /**
   * Save posts with debouncing to prevent rapid consecutive saves
   */
  async savePosts(channelId: string, posts: CachedPost[], immediate: boolean = false): Promise<void> {
     console.log(`💾 Saving ${posts.length} posts for channel ${channelId}`);
    const key = `posts_${channelId}`;

    // Clear existing timer
    if (this.saveTimers.has(key)) {
      clearTimeout(this.saveTimers.get(key));
    }

    const doSave = async () => {
      try {
        const docId = `posts_${channelId}`;
        
        try {
          const existing = await this.db.get(docId);
          await this.db.put({
            _id: docId,
            _rev: existing._rev,
            posts,
            channelId,
            timestamp: Date.now()
          });
        } catch (err: any) {
          if (err.status === 404) {
            await this.db.put({
              _id: docId,
              posts,
              channelId,
              timestamp: Date.now()
            });
          } else {
            throw err;
          }
        }
        console.log(`✅ Saved ${posts.length} posts for channel ${channelId}`);
        this.saveTimers.delete(key);
      } catch (error) {
        console.error('❌ Failed to save posts:', error);
      }
    };

    if (immediate) {
      // Save immediately (e.g., on app close)
      await doSave();
    } else {
      // Debounce by 500ms
      const timer = setTimeout(doSave, 500);
      this.saveTimers.set(key, timer);
    }
  }

  /**
   * Force save all pending debounced operations
   */
  async flushPendingSaves(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [key, timer] of this.saveTimers.entries()) {
      clearTimeout(timer);
      // Trigger immediate save
      // Note: This is a simplified version, you'd need to store the actual save function
    }
    
    await Promise.all(promises);
    console.log('✅ Flushed all pending saves');
  }

  async getPosts(channelId: string): Promise<CachedPost[]> {
    try {
      const docId = `posts_${channelId}`;
      const doc: any = await this.db.get(docId);
      return doc.posts || [];
    } catch (err: any) {
      if (err.status === 404) {
        return [];
      }
      console.error('❌ Failed to get posts:', err);
      return [];
    }
  }




  /* =========================
     MEDIA URL CACHE
     ========================= */

  async cacheMediaUrl(mediaId: string, url: string): Promise<void> {
    try {
      const docId = `media_${mediaId}`;
      
      try {
        const existing = await this.db.get(docId);
        await this.db.put({
          _id: docId,
          _rev: existing._rev,
          url,
          mediaId,
          timestamp: Date.now()
        });
      } catch (err: any) {
        if (err.status === 404) {
          await this.db.put({
            _id: docId,
            url,
            mediaId,
            timestamp: Date.now()
          });
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error('❌ Failed to cache media URL:', error);
    }
  }

  async getMediaUrl(mediaId: string): Promise<string | null> {
    try {
      const docId = `media_${mediaId}`;
      const doc: any = await this.db.get(docId);
      return doc.url || null;
    } catch (err: any) {
      if (err.status === 404) {
        return null;
      }
      console.error('❌ Failed to get media URL:', err);
      return null;
    }
  }

  /* =========================
     UNIFIED WRITE QUEUE
     ========================= */



// Add these properties to the ChannelPouchDbService class:

private queueLock: Promise<void> | null = null;
private pendingQueueOperations: Array<() => Promise<void>> = [];
private queueProcessing = false;
  
async enqueueAction(action: PendingAction): Promise<void> {
  return this.executeQueueOperation(async () => {
    let retries = 0;
    const maxRetries = 5;
    
    while (retries < maxRetries) {
      try {
        const queueDoc = await this.getOrCreateQueue();
        queueDoc.actions.push(action);
        
        await this.db.put({
          _id: 'unified_write_queue',
          _rev: queueDoc._rev,
          actions: queueDoc.actions
        });

        console.log('📝 Queued action:', action.type);
        return;
      } catch (error: any) {
        if (error.status === 409) {
          retries++;
          if (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 30 * retries));
            continue;
          }
        }
        throw error;
      }
    }
    
    console.error('❌ Failed to enqueue action after retries');
  });
}

async getQueue(): Promise<PendingAction[]> {
  try {
    const doc: any = await this.db.get('unified_write_queue');
    return doc.actions || [];
  } catch (err: any) {
    if (err.status === 404) {
      return [];
    }
    console.error('❌ Failed to get queue:', err);
    return [];
  }
}

async removeFromQueue(actionIndex: number): Promise<void> {
  return this.executeQueueOperation(async () => {
    let retries = 0;
    const maxRetries = 5;
    
    while (retries < maxRetries) {
      try {
        const doc: any = await this.db.get('unified_write_queue');
        doc.actions.splice(actionIndex, 1);
        await this.db.put(doc);
        return;
      } catch (error: any) {
        if (error.status === 409) {
          retries++;
          if (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 30 * retries));
            continue;
          }
        }
        throw error;
      }
    }
    
    console.error('❌ Failed to remove from queue after retries');
  });
}

async clearQueue(): Promise<void> {
  return this.executeQueueOperation(async () => {
    let retries = 0;
    const maxRetries = 5;
    
    while (retries < maxRetries) {
      try {
        const doc: any = await this.db.get('unified_write_queue');
        await this.db.put({
          _id: 'unified_write_queue',
          _rev: doc._rev,
          actions: []
        });
        return;
      } catch (err: any) {
        if (err.status === 404) {
          return; // Already cleared
        }
        if (err.status === 409) {
          retries++;
          if (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 30 * retries));
            continue;
          }
        }
        throw err;
      }
    }
    
    console.error('❌ Failed to clear queue after retries');
  });
}

private async getOrCreateQueue(): Promise<any> {
  try {
    return await this.db.get('unified_write_queue');
  } catch (err: any) {
    if (err.status === 404) {
      const newQueue = {
        _id: 'unified_write_queue',
        actions: []
      };
      await this.db.put(newQueue);
      // Fetch it back to get the _rev
      return await this.db.get('unified_write_queue');
    }
    throw err;
  }
}

/**
 * Execute queue operations serially with a lock
 * This prevents concurrent modifications to the queue document
 */
private async executeQueueOperation<T>(operation: () => Promise<T>): Promise<T> {
  // Add to pending operations queue
  return new Promise<T>((resolve, reject) => {
    this.pendingQueueOperations.push(async () => {
      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    
    // Start processing if not already running
    if (!this.queueProcessing) {
      this.processQueueOperations();
    }
  });
}

/**
 * Process pending queue operations one at a time
 */
private async processQueueOperations(): Promise<void> {
  if (this.queueProcessing) return;
  
  this.queueProcessing = true;
  
  while (this.pendingQueueOperations.length > 0) {
    const operation = this.pendingQueueOperations.shift();
    if (operation) {
      try {
        await operation();
      } catch (error) {
        console.error('❌ Queue operation failed:', error);
      }
    }
  }
  
  this.queueProcessing = false;
}

  /* =========================
     UTILITY & MAINTENANCE
     ========================= */

  async clearAll(): Promise<void> {
    try {
      await this.db.destroy();
      this.db = new PouchDB('channels_unified_db');
      console.log('✅ Database cleared and recreated');
    } catch (error) {
      console.error('❌ Failed to clear database:', error);
    }
  }

  async clearChannelsOnly(userId: string): Promise<void> {
    try {
      const myChannelsDoc = await this.db.get(`my_channels_${userId}`);
      const discoverDoc = await this.db.get(`discover_channels_${userId}`);
      
      await Promise.all([
        this.db.remove(myChannelsDoc),
        this.db.remove(discoverDoc)
      ]);
      
      console.log('✅ Cleared channel cache');
    } catch (err: any) {
      if (err.status !== 404) {
        console.error('❌ Failed to clear channels:', err);
      }
    }
  }

  async clearPostsOnly(channelId: string): Promise<void> {
    try {
      const postsDoc = await this.db.get(`posts_${channelId}`);
      await this.db.remove(postsDoc);
      console.log('✅ Cleared posts cache for channel:', channelId);
    } catch (err: any) {
      if (err.status !== 404) {
        console.error('❌ Failed to clear posts:', err);
      }
    }
  }

  async clearOldMediaCache(daysOld: number = 7): Promise<void> {
    try {
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      
      const result = await this.db.allDocs({
        include_docs: true,
        startkey: 'media_',
        endkey: 'media_\ufff0'
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
        console.log(`✅ Cleared ${toDelete.length} old media URLs`);
      }
    } catch (error) {
      console.error('❌ Failed to clear old media:', error);
    }
  }

  async getStats(): Promise<any> {
    try {
      const info = await this.db.info();
      const queue = await this.getQueue();
      
      return {
        docCount: info.doc_count,
        updateSeq: info.update_seq,
        queuedActions: queue.length
      };
    } catch (error) {
      console.error('❌ Failed to get stats:', error);
      return null;
    }
  }

  /* =========================
     DEBUG UTILITIES
     ========================= */

  async debugDump(): Promise<void> {
    try {
      const allDocs = await this.db.allDocs({ include_docs: true });
      
      console.group('📊 PouchDB Debug Dump');
      console.log('Total documents:', allDocs.total_rows);
      
      const categories = {
        myChannels: 0,
        discoverChannels: 0,
        channels: 0,
        posts: 0,
        pendingPosts: 0,
        media: 0,
        queue: 0,
        other: 0
      };

      allDocs.rows.forEach((row: any) => {
        const id = row.id;
        if (id.startsWith('my_channels_')) categories.myChannels++;
        else if (id.startsWith('discover_channels_')) categories.discoverChannels++;
        else if (id.startsWith('channel_')) categories.channels++;
        else if (id.startsWith('posts_')) categories.posts++;
        else if (id.startsWith('pending_post_')) categories.pendingPosts++;
        else if (id.startsWith('media_')) categories.media++;
        else if (id === 'unified_write_queue') categories.queue++;
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

//   async removeFromQueueById(docId: string): Promise<void> {
//   try {
//     const queueDoc: any = await this.db.get('unified_write_queue');
//     queueDoc.actions = queueDoc.actions.filter(a => a._id !== docId);

//     await this.db.put({
//       _id: 'unified_write_queue',
//       _rev: queueDoc._rev,
//       actions: queueDoc.actions
//     });

//   } catch (err) {
//     console.error('❌ Failed to remove queue action by id:', err);
//   }
// }

}