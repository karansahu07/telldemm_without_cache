// src/app/pages/services/post.ts
import { Injectable } from '@angular/core';
import {
  Database,
  ref,
  push,
  set,
  onValue,
  query,
  orderByChild,
  runTransaction,
  remove,
  onDisconnect,
  get,
  off, DatabaseReference
} from '@angular/fire/database';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HttpEventType } from '@angular/common/http';
import { environment } from 'src/environments/environment.prod';
import { AuthService } from 'src/app/auth/auth.service';
import { Storage } from '@ionic/storage-angular';

export interface UserReaction {
  emoji: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class PostService {
  // private currentUserId: number = 52; // Replace with actual auth user ID
  private currentUserId!: any;
private postsRefMap = new Map<string, DatabaseReference>();


  // constructor(private db: Database, private http: HttpClient, private authService: AuthService) {
  //   this.currentUserId = this.authService.authData?.userId || 0;  // ADD THIS
  //   // this.currentUserId = "76";  // ADD THIS

  //   // Firebase Realtime Database automatically enables offline persistence
  //   // No additional configuration needed - it works out of the box
  // }

  constructor(
    private db: Database,
    private http: HttpClient,
    private authService: AuthService,
    private storage: Storage
  ) {
    this.currentUserId = this.authService.authData?.userId || 0;
    this.storage.create(); // 🔥 important
  }

  private baseUrl = environment.apiBaseUrl;
  private UPLOAD_API = `${this.baseUrl}/api/media/channel_media/upload-url`;
  private DOWNLOAD_API_BASE = `${this.baseUrl}/api/media/download-url`;


  private postsCacheKey(channelId: string) {
    return `posts_${channelId}`;
  }

  async savePostsToCache(channelId: string, posts: any[]) {
    await this.storage.set(this.postsCacheKey(channelId), posts);
  }

  async getCachedPosts(channelId: string): Promise<any[]> {
    return (await this.storage.get(this.postsCacheKey(channelId))) || [];
  }


  // ============================
  // 1️⃣ CREATE POST (STORE ONLY media_id)
  // ============================
  async createPost(
    channelId: string,
    body: string,
    file?: File,
    senderId?: number,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    let mediaId: string | null = null;

    if (file) {
      try {
        const uploadPayload = {
          channel_id: parseInt(channelId),
          sender_id: senderId,
          media_type: file.type.startsWith('image/') ? 'image' : 'video',
          file_size: file.size,
          content_type: file.type,
          metadata: { caption: body }
        };

        const uploadResponse = await this.http.post<any>(this.UPLOAD_API, uploadPayload).toPromise();
        if (!uploadResponse.status) throw new Error('Failed to get upload URL');

        mediaId = uploadResponse.media_id;

        await new Promise<void>((resolve, reject) => {
          this.http.put(uploadResponse.upload_url, file, {
            observe: 'events',
            reportProgress: true
          }).subscribe({
            next: (event: any) => {
              if (event.type === HttpEventType.UploadProgress && progressCallback) {
                progressCallback(Math.round(100 * event.loaded / (event.total || 1)));
              } else if (event.type === HttpEventType.Response) {
                resolve();
              }
            },
            error: reject
          });
        });
      } catch (err) {
        console.error('Upload failed:', err);
        throw err;
      }
    }

    const postsRef = ref(this.db, `channels/${channelId}/posts`);
    const newPostRef = push(postsRef);

    // await set(newPostRef, {
    //   body,
    //   media_id: mediaId,
    //   author: 'Volunteer Events',
    //   verified: true,
    //   isSent: true,
    //   timestamp: Date.now(),
    //   reactions: {}, // Legacy counter (optional, for backward compatibility)
    //   user_reactions: {} // New user-based reactions
    // });

    await set(newPostRef, {
      body,
      media_id: mediaId,
      created_by: senderId,  // User ID who created the post
      timestamp: Date.now(),
      user_reactions: {}
    });
  }

  // ============================
  // 2️⃣ GET FRESH DOWNLOAD URL
  // ============================
  getFreshMediaUrl(mediaId: string) {
    return this.http.get<any>(`${this.DOWNLOAD_API_BASE}/${mediaId}`);
  }

  // ============================
  // 3️⃣ GET POSTS REAL-TIME (OLDEST → NEWEST)
  // ============================




  cleanupPostsListener(channelId: string) {
  const ref = this.postsRefMap.get(channelId);
  if (ref) {
    off(ref);
    this.postsRefMap.delete(channelId);
  }
}

  getPosts(channelId: string): Observable<any[]> {
    // const postsRef = ref(this.db, `channels/${channelId}/posts`);
    const postsRef = ref(this.db, `channels/${channelId}/posts`);
this.postsRefMap.set(channelId, postsRef);


    return new Observable((observer) => {

      // 1️⃣ Emit cached posts immediately (offline / cold start)
      this.getCachedPosts(channelId).then(cached => {
        if (cached.length) {
          observer.next(cached);
        }
      });

      // 2️⃣ Listen to Firebase (online or cached DB)
      onValue(postsRef, (snapshot) => {
        const data = snapshot.val() || {};
        const posts = Object.keys(data)
          .map(id => ({ id, ...data[id] }))
          .sort((a, b) => a.timestamp - b.timestamp);

        // 3️⃣ Save fresh data to cache
        this.savePostsToCache(channelId, posts);

        observer.next(posts);
      });
    });
  }

  // getPosts(channelId: string): Observable<any[]> {
  //   const postsRef = query(
  //     ref(this.db, `channels/${channelId}/posts`),
  //     orderByChild('timestamp')
  //   );

  //   return new Observable((observer) => {
  //     onValue(postsRef, (snapshot) => {
  //       const data = snapshot.val() || {};

  //       const posts = Object.keys(data)
  //         .map(id => ({ id, ...data[id] }))
  //         .sort((a, b) => a.timestamp - b.timestamp);

  //       observer.next(posts);
  //     });
  //   });
  // }

// getPosts(channelId: string): Observable<any[]> {
//   const postsRef = ref(this.db, `channels/${channelId}/posts`);
//   console.log("postsRef",postsRef);

//   return new Observable((observer) => {

//     // 1️⃣ Emit cached posts immediately
//     this.getCachedPosts(channelId).then(cached => {
//       if (cached.length) observer.next(cached);
//     });

//     // 2️⃣ Listen to Firebase (online or offline cache)
//     onValue(postsRef, (snapshot) => {
//       const data = snapshot.val() || {};

//       const posts = Object.keys(data)
//         .map(id => ({ id, ...data[id] }))
//         .sort((a, b) => a.timestamp - b.timestamp); // client sort

//       this.savePostsToCache(channelId, posts);
//       observer.next(posts);
//     });
//   });
// }


  // ============================
  // 4️⃣ ADD/UPDATE USER REACTION (One reaction per user)
  // ============================
  async addOrUpdateReaction(channelId: string, postId: string, emoji: string, userId?: number) {
    const uid = userId || this.currentUserId;
    const userReactionRef = ref(
      this.db,
      `channels/${channelId}/posts/${postId}/user_reactions/${uid}`
    );

    // Check if user already has a reaction
    const snapshot = await get(userReactionRef);
    const existingReaction = snapshot.val() as UserReaction | null;

    if (existingReaction) {
      // If same emoji, remove it (toggle off)
      if (existingReaction.emoji === emoji) {
        await this.removeReaction(channelId, postId, userId);
        return;
      }
    }

    // Set or update reaction
    await set(userReactionRef, {
      emoji,
      timestamp: Date.now()
    });
  }

  // ============================
  // 5️⃣ REMOVE USER REACTION
  // ============================
  async removeReaction(channelId: string, postId: string, userId?: number) {
    const uid = userId || this.currentUserId;
    const userReactionRef = ref(
      this.db,
      `channels/${channelId}/posts/${postId}/user_reactions/${uid}`
    );
    await remove(userReactionRef);
  }

  // ============================
  // 6️⃣ GET USER'S CURRENT REACTION FOR A POST
  // ============================
  // async getUserReaction(channelId: string, postId: string, userId?: number): Promise<string | null> {
  //   const uid = userId || this.currentUserId;
  //   const userReactionRef = ref(
  //     this.db,
  //     `channels/${channelId}/posts/${postId}/user_reactions/${uid}`
  //   );
  //   const snapshot = await get(userReactionRef);
  //   const reaction = snapshot.val() as UserReaction | null;
  //   return reaction ? reaction.emoji : null;
  // }
  async getUserReaction(
    channelId: string,
    postId: string,
    userId?: number
  ): Promise<string | null> {

    const uid = userId || this.currentUserId;
    const userReactionRef = ref(
      this.db,
      `channels/${channelId}/posts/${postId}/user_reactions/${uid}`
    );

    return new Promise((resolve) => {
      onValue(userReactionRef, (snapshot) => {
        const val = snapshot.val();
        resolve(val ? val.emoji : null);
      }, { onlyOnce: true });
    });
  }

  // ============================
  // 7️⃣ AGGREGATE REACTIONS FOR DISPLAY
  // ============================
  aggregateReactions(userReactions: { [userId: string]: UserReaction } | null): { [emoji: string]: number } {
    if (!userReactions) return {};

    const aggregated: { [emoji: string]: number } = {};
    Object.values(userReactions).forEach(reaction => {
      aggregated[reaction.emoji] = (aggregated[reaction.emoji] || 0) + 1;
    });

    return aggregated;
  }

  // ============================
  // 8️⃣ LEGACY: Old counter-based reaction (if needed)
  // ============================
  async addReaction(channelId: string, postId: string, emoji: string) {
    const reactionRef = ref(
      this.db,
      `channels/${channelId}/posts/${postId}/reactions/${emoji}`
    );

    return runTransaction(reactionRef, (currentValue) => {
      return (currentValue || 0) + 1;
    });
  }

  // Add this method
  getConnectionStatus(): Observable<boolean> {
    const connectedRef = ref(this.db, '.info/connected');

    return new Observable((observer) => {
      onValue(connectedRef, (snapshot) => {
        const isConnected = snapshot.val() === true;
        observer.next(isConnected);
      });
    });
  }
}