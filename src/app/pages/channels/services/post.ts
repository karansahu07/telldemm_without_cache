// src/app/pages/services/post.ts
import { Injectable } from '@angular/core';
import {
  Database,
  ref,
  push,
  set,
  onValue,
  get,
  remove,
  off,
  DatabaseReference
} from '@angular/fire/database';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment.prod';
import { AuthService } from 'src/app/auth/auth.service';
import { ChannelPouchDbService, CachedPost, PendingAction } from './pouch-db';
import { FileStorageService } from './file-storage';
// import { ChannelPouchDbService, CachedPost, PendingAction } from 'src/app/services/channel-pouch-db.service';

export interface UserReaction {
  emoji: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class PostService {
  private currentUserId!: any;
  private postsRefMap = new Map<string, DatabaseReference>();
  private baseUrl = environment.apiBaseUrl;
  private UPLOAD_API = `${this.baseUrl}/api/media/channel_media/upload-url`;
  private DOWNLOAD_API_BASE = `${this.baseUrl}/api/media/download-url`;

  // Connection status
  private isOnlineSubject = new BehaviorSubject<boolean>(true);

  constructor(
    private db: Database,
    private http: HttpClient,
    private authService: AuthService,
    private pouchDb: ChannelPouchDbService,
    private fileStorage: FileStorageService  // ✅ Add this
  ) {
    this.currentUserId = this.authService.authData?.userId || 0;
    this.monitorConnection();
  }

  /* =========================
     CONNECTION MONITORING
     ========================= */

  // private monitorConnection() {
  //   const connectedRef = ref(this.db, '.info/connected');

  //   onValue(connectedRef, (snapshot) => {
  //     const isConnected = snapshot.val() === true;
  //     this.isOnlineSubject.next(isConnected);

  //     if (isConnected) {
  //       console.log('🟢 Firebase connected, flushing queue...');
  //       this.flushQueue();
  //     } else {
  //       console.log('📴 Firebase disconnected');
  //     }
  //   });

  //   // Also monitor browser online/offline
  //   window.addEventListener('online', () => {
  //     console.log('🟢 Browser online');
  //     this.flushQueue();
  //   });

  //   window.addEventListener('offline', () => {
  //     console.log('📴 Browser offline');
  //   });
  // }

   /* =========================
     CONNECTION MONITORING
     ========================= */

  private monitorConnection() {
    const connectedRef = ref(this.db, '.info/connected');
    
    onValue(connectedRef, (snapshot) => {
      const isConnected = snapshot.val() === true;
      this.isOnlineSubject.next(isConnected);

      if (isConnected) {
        console.log('🟢 Firebase connected, flushing queue...');
        this.flushQueue();
      } else {
        console.log('📴 Firebase disconnected');
      }
    });

    window.addEventListener('online', () => {
      console.log('🟢 Browser online');
      this.flushQueue();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Browser offline');
    });
  }



  getConnectionStatus(): Observable<boolean> {
    return this.isOnlineSubject.asObservable();
  }




  /* =========================
       CREATE POST - UPDATED WITH FILE STORAGE
       ========================= */

  // async createPost(
  //   channelId: string,
  //   body: string,
  //   file?: File,
  //   senderId?: number,
  //   progressCallback?: (progress: number) => void
  // ): Promise<void> {
  //   // Generate unique IDs
  //   const tempPostId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  //   const tempImageId = file ? `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : undefined;

  //   // // 1️⃣ Store file in IndexedDB (as Blob - efficient!)
  //   // let objectURL: string | undefined;
  //   // if (file && tempImageId) {
  //   //   try {
  //   //     await this.fileStorage.storeFile(tempImageId, file);
  //   //     objectURL = await this.fileStorage.getFileURL(tempImageId);
  //   //     console.log(`✅ Image stored in IndexedDB: ${tempImageId}`);
  //   //   } catch (error) {
  //   //     console.error('❌ Failed to store image in IndexedDB:', error);
  //   //     // Continue without image
  //   //   }
  //   // }

  //   let objectURL: string | undefined;

  //   if (file && tempImageId) {
  //     try {
  //       await this.fileStorage.storeFile(tempImageId, file);

  //       const url = await this.fileStorage.getFileURL(tempImageId);
  //       objectURL = url ?? undefined;

  //       console.log(`✅ Image stored in IndexedDB: ${tempImageId}`);
  //     } catch (error) {
  //       console.error('❌ Failed to store image in IndexedDB:', error);
  //     }
  //   }

  //   // 2️⃣ Create optimistic post with Blob URL
  //   const optimisticPost: CachedPost = {
  //     id: tempPostId,
  //     body,
  //     created_by: senderId || this.currentUserId,
  //     timestamp: Date.now(),
  //     user_reactions: {},
  //     isPending: true,
  //     pendingImageId: tempImageId, // Link to IndexedDB file
  //     image: objectURL, // Blob URL for instant display
  //     media_id: tempImageId ? 'pending_upload' : undefined
  //   };

  //   // 3️⃣ Add optimistic post to cache (shows immediately in UI)
  //   const existingPosts = await this.pouchDb.getPosts(channelId);
  //   await this.pouchDb.savePosts(channelId, [...existingPosts, optimisticPost], true);
  //   console.log('✅ Optimistic post added to cache');

  //   // 4️⃣ Queue the action (store file ID, not the File object)
  //   const action: PendingAction = {
  //     type: 'post_create',
  //     channelId,
  //     data: {
  //       body,
  //       fileId: tempImageId, // Store ID reference instead of File
  //       senderId,
  //       tempPostId,
  //       tempImageId
  //     },
  //     timestamp: Date.now()
  //   };

  //   await this.pouchDb.enqueueAction(action);
  //   console.log(`📝 Post queued: ${tempPostId}`);

  //   // 5️⃣ Try immediate execution if online
  //   if (this.isOnlineSubject.value) {
  //     try {
  //       // Retrieve file from IndexedDB
  //       let fileToUpload: File | undefined;
  //       if (tempImageId) {
  //         const storedBlob = await this.fileStorage.getFile(tempImageId);
  //         if (storedBlob) {
  //           const fileInfo = await this.fileStorage.getFileInfo(tempImageId);
  //           fileToUpload = new File(
  //             [storedBlob],
  //             fileInfo?.fileName || `image_${tempImageId}`,
  //             { type: storedBlob.type }
  //           );
  //         }
  //       }

  //       await this.executeCreatePost(
  //         { ...action, data: { ...action.data, file: fileToUpload } },
  //         progressCallback
  //       );

  //       // ✅ Success - Clean up
  //       await this.removeActionFromQueue(tempPostId);
  //       await this.removeOptimisticPost(channelId, tempPostId);

  //       if (tempImageId) {
  //         await this.fileStorage.deleteFile(tempImageId);
  //         console.log(`🧹 Cleaned up IndexedDB file: ${tempImageId}`);
  //       }

  //       console.log(`✅ Post created successfully: ${tempPostId}`);

  //     } catch (error) {
  //       console.error('❌ Failed to create post immediately, will retry later:', error);
  //       // Optimistic post stays visible, will sync when back online
  //     }
  //   } else {
  //     console.log('📴 Offline: Post queued (visible with Blob URL)');
  //   }
  // }


// Also update createPost to pass file correctly
/* =========================
     CREATE POST
     ========================= */

  async createPost(
    channelId: string,
    body: string,
    file?: File,
    senderId?: number,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    const tempPostId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tempImageId = file ? `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : undefined;

    console.log('🚀 createPost called:', {
      channelId,
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      tempPostId,
      tempImageId
    });

    // 1️⃣ Store file in IndexedDB if exists
    let objectURL: string | undefined;
    if (file && tempImageId) {
      try {
        await this.fileStorage.storeFile(tempImageId, file);
        // objectURL = await this.fileStorage.getFileURL(tempImageId);
        const url = await this.fileStorage.getFileURL(tempImageId);
        objectURL = url ?? undefined;
        console.log(`✅ Image stored in IndexedDB: ${tempImageId}`);
      } catch (error) {
        console.error('❌ Failed to store image:', error);
      }
    }

    // 2️⃣ Create optimistic post
    const optimisticPost: CachedPost = {
      id: tempPostId,
      body,
      created_by: senderId || this.currentUserId,
      timestamp: Date.now(),
      user_reactions: {},
      isPending: true,
      pendingImageId: tempImageId,
      image: objectURL,
      media_id: tempImageId ? 'pending_upload' : undefined
    };

    // 3️⃣ Add to cache
    const existingPosts = await this.pouchDb.getPosts(channelId);
    await this.pouchDb.savePosts(channelId, [...existingPosts, optimisticPost], true);
    console.log('✅ Optimistic post added to cache');

    // 4️⃣ Queue the action
    const action: PendingAction = {
      type: 'post_create',
      channelId,
      data: {
        body,
        fileId: tempImageId,
        senderId,
        tempPostId,
        tempImageId
      },
      timestamp: Date.now()
    };

    await this.pouchDb.enqueueAction(action);
    console.log(`📝 Post queued: ${tempPostId}`);

    // 5️⃣ Try immediate execution if online
    if (this.isOnlineSubject.value) {
      try {
        // Retrieve file from IndexedDB
        let fileToUpload: File | undefined;
        
        if (tempImageId) {
          const storedBlob = await this.fileStorage.getFile(tempImageId);
          
          if (storedBlob) {
            const fileInfo = await this.fileStorage.getFileInfo(tempImageId);
            fileToUpload = new File(
              [storedBlob], 
              fileInfo?.fileName || `image_${tempImageId}.jpg`, 
              { type: storedBlob.type || 'image/jpeg' }
            );
            
            console.log('✅ File retrieved from IndexedDB:', {
              name: fileToUpload.name,
              size: fileToUpload.size,
              type: fileToUpload.type
            });
          } else {
            console.error('❌ File not found in IndexedDB:', tempImageId);
          }
        }

        await this.executeCreatePost(
          { ...action, data: { ...action.data, file: fileToUpload } },
          progressCallback
        );
        
        // Clean up
        await this.removeActionFromQueue(tempPostId);
        await this.removeOptimisticPost(channelId, tempPostId);
        
        if (tempImageId) {
          await this.fileStorage.deleteFile(tempImageId);
        }
        
        console.log(`✅ Post created: ${tempPostId}`);
        
      } catch (error: any) {
        console.error('❌ Failed to create post:', error);
      }
    } else {
      console.log('📴 Offline: Post queued');
    }
  }



  /**
   * Remove a specific action from queue by its unique ID
   */
  /* =========================
      HELPER METHODS
      ========================= */

  /**
   * Remove a specific action from queue by its unique ID
   */
  private async removeActionFromQueue(tempPostId: string): Promise<void> {
    const queue = await this.pouchDb.getQueue();
    const index = queue.findIndex(
      action => action.type === 'post_create' && action.data.tempPostId === tempPostId
    );
    
    if (index !== -1) {
      await this.pouchDb.removeFromQueue(index);
    }
  }


  /**
   * Remove optimistic post from cache
   */

  private async removeOptimisticPost(channelId: string, tempPostId: string): Promise<void> {
    try {
      const posts = await this.pouchDb.getPosts(channelId);
      const filteredPosts = posts.filter(p => p.id !== tempPostId);
      
      if (filteredPosts.length !== posts.length) {
        await this.pouchDb.savePosts(channelId, filteredPosts, true);
      }
    } catch (error) {
      console.error('❌ Failed to remove optimistic post:', error);
    }
  }

  /**
   * Execute the actual post creation
   */
  // private async executeCreatePost(
  //   action: PendingAction,
  //   progressCallback?: (progress: number) => void
  // ): Promise<void> {
  //   const { body, file, senderId, tempPostId } = action.data;
  //   let mediaId: string | null = null;

  //   try {
  //     // Upload file if exists
  //     if (file) {
  //       const uploadPayload = {
  //         channel_id: parseInt(action.channelId!),
  //         sender_id: senderId,
  //         media_type: file.type.startsWith('image/') ? 'image' : 'video',
  //         file_size: file.size,
  //         content_type: file.type,
  //         metadata: { caption: body }
  //       };

  //       const uploadResponse = await this.http.post<any>(this.UPLOAD_API, uploadPayload).toPromise();
  //       if (!uploadResponse.status) throw new Error('Failed to get upload URL');

  //       mediaId = uploadResponse.media_id;

  //       await new Promise<void>((resolve, reject) => {
  //         this.http.put(uploadResponse.upload_url, file, {
  //           observe: 'events',
  //           reportProgress: true
  //         }).subscribe({
  //           next: (event: any) => {
  //             if (event.type === HttpEventType.UploadProgress && progressCallback) {
  //               progressCallback(Math.round(100 * event.loaded / (event.total || 1)));
  //             } else if (event.type === HttpEventType.Response) {
  //               resolve();
  //             }
  //           },
  //           error: reject
  //         });
  //       });
  //     }

  //     // Create post in Firebase
  //     const postsRef = ref(this.db, `channels/${action.channelId}/posts`);
  //     const newPostRef = push(postsRef);

  //     await set(newPostRef, {
  //       body,
  //       media_id: mediaId,
  //       created_by: senderId || this.currentUserId,
  //       timestamp: Date.now(),
  //       user_reactions: {}
  //     });

  //     console.log(`✅ Post created successfully with ID: ${newPostRef.key}`);

  //     // 5️⃣ Remove pending post after success
  //     // Important: Remove BEFORE Firebase listener picks up the new post
  //     await this.pouchDb.removePendingPost(tempPostId);

  //     console.log(`🧹 Removed pending post: ${tempPostId}`);

  //   } catch (error) {
  //     console.error('❌ Failed to create post:', error);

  //     // Increment retry count
  //     action.retryCount = (action.retryCount || 0) + 1;

  //     // If too many retries, give up
  //     if (action.retryCount > 3) {
  //       console.error('❌ Post creation failed after 3 retries, removing pending post');
  //       await this.pouchDb.removePendingPost(tempPostId);
  //     }

  //     throw error;
  //   }
  // }

  //   private async executeCreatePost(
  //   action: PendingAction,
  //   progressCallback?: (progress: number) => void
  // ): Promise<void> {
  //   const { body, file, senderId } = action.data;
  //   let mediaId: string | null = null;

  //   try {
  //     // Upload file if exists
  //     if (file) {
  //       const uploadPayload = {
  //         channel_id: parseInt(action.channelId!),
  //         sender_id: senderId,
  //         media_type: file.type.startsWith('image/') ? 'image' : 'video',
  //         file_size: file.size,
  //         content_type: file.type,
  //         metadata: { caption: body }
  //       };

  //       const uploadResponse = await this.http.post<any>(this.UPLOAD_API, uploadPayload).toPromise();
  //       if (!uploadResponse.status) throw new Error('Failed to get upload URL');

  //       mediaId = uploadResponse.media_id;

  //       await new Promise<void>((resolve, reject) => {
  //         this.http.put(uploadResponse.upload_url, file, {
  //           observe: 'events',
  //           reportProgress: true
  //         }).subscribe({
  //           next: (event: any) => {
  //             if (event.type === HttpEventType.UploadProgress && progressCallback) {
  //               progressCallback(Math.round(100 * event.loaded / (event.total || 1)));
  //             } else if (event.type === HttpEventType.Response) {
  //               resolve();
  //             }
  //           },
  //           error: reject
  //         });
  //       });
  //     }

  //     // Create post in Firebase
  //     const postsRef = ref(this.db, `channels/${action.channelId}/posts`);
  //     const newPostRef = push(postsRef);

  //     await set(newPostRef, {
  //       body,
  //       media_id: mediaId,
  //       created_by: senderId || this.currentUserId,
  //       timestamp: Date.now(),
  //       user_reactions: {}
  //     });

  //     console.log(`✅ Post created successfully with ID: ${newPostRef.key}`);

  //   } catch (error) {
  //     console.error('❌ Failed to create post:', error);

  //     // Increment retry count
  //     action.retryCount = (action.retryCount || 0) + 1;

  //     // If too many retries, give up
  //     if (action.retryCount > 3) {
  //       console.error('❌ Post creation failed after 3 retries');
  //     }

  //     throw error;
  //   }
  // }


  //   getPosts(channelId: string): Observable<CachedPost[]> {
  //   const postsRef = ref(this.db, `channels/${channelId}/posts`);
  //   this.postsRefMap.set(channelId, postsRef);

  //   return new Observable((observer) => {
  //     let isFirstEmit = true;

  //     // 1️⃣ Load from PouchDB cache immediately (offline-first)
  //     this.pouchDb.getPosts(channelId).then(cachedPosts => {
  //       if (cachedPosts.length > 0) {
  //         console.log(`📱 Loaded ${cachedPosts.length} posts from cache`);
  //         observer.next(cachedPosts);
  //         isFirstEmit = false;
  //       }
  //     });

  //     // 2️⃣ Setup Firebase listener (real-time updates)
  //     onValue(postsRef, async (snapshot) => {
  //       const data = snapshot.val() || {};
  //       const firebasePosts: CachedPost[] = Object.keys(data)
  //         .map(id => ({ id, ...data[id] }))
  //         .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  //       console.log(`🔥 Firebase: ${firebasePosts.length} posts`);

  //       // Cache to PouchDB
  //       await this.pouchDb.savePosts(channelId, firebasePosts);

  //       observer.next(firebasePosts);
  //       isFirstEmit = false;

  //     }, (error) => {
  //       console.error('❌ Firebase error, using cache only:', error);

  //       // On error, load from cache if we haven't emitted yet
  //       if (isFirstEmit) {
  //         this.pouchDb.getPosts(channelId).then(cachedPosts => {
  //           observer.next(cachedPosts);
  //         });
  //       }
  //     });
  //   });
  // }

  // In post.ts - Replace the getPosts() method
  // In post.ts - Replace flushQueue() method


  /**
   * Flush queued actions when connection is restored
   */
  /* =========================
      QUEUE FLUSHING - UPDATED
      ========================= */

  // Update flushQueue to properly retrieve files
/* =========================
     QUEUE MANAGEMENT
     ========================= */

  private async flushQueue() {
    const queue = await this.pouchDb.getQueue();
    
    if (queue.length === 0) return;

    console.log(`🔄 Flushing ${queue.length} queued actions...`);

    for (let i = queue.length - 1; i >= 0; i--) {
      const action = queue[i];

      try {
        switch (action.type) {
          case 'post_create':
            // Retrieve file from IndexedDB
            let fileToUpload: File | undefined;
            
            if (action.data.fileId) {
              const storedBlob = await this.fileStorage.getFile(action.data.fileId);
              
              if (storedBlob) {
                const fileInfo = await this.fileStorage.getFileInfo(action.data.fileId);
                fileToUpload = new File(
                  [storedBlob], 
                  fileInfo?.fileName || `image_${action.data.fileId}.jpg`, 
                  { type: storedBlob.type || 'image/jpeg' }
                );
                console.log(`✅ File retrieved for queue: ${action.data.fileId}`);
              }
            }

            await this.executeCreatePost({
              ...action,
              data: { ...action.data, file: fileToUpload }
            });
            
            // Clean up
            await this.pouchDb.removeFromQueue(i);
            await this.removeOptimisticPost(action.channelId!, action.data.tempPostId);
            
            if (action.data.fileId) {
              await this.fileStorage.deleteFile(action.data.fileId);
            }
            
            console.log(`✅ Synced post: ${action.data.tempPostId}`);
            break;

          case 'reaction_add':
            const addRef = ref(
              this.db,
              `channels/${action.channelId}/posts/${action.postId}/user_reactions/${action.data.userId}`
            );
            await set(addRef, {
              emoji: action.data.emoji,
              timestamp: Date.now()
            });
            await this.pouchDb.removeFromQueue(i);
            break;

          case 'reaction_remove':
            const removeRef = ref(
              this.db,
              `channels/${action.channelId}/posts/${action.postId}/user_reactions/${action.data.userId}`
            );
            await remove(removeRef);
            await this.pouchDb.removeFromQueue(i);
            break;
        }

      } catch (error: any) {
        console.error(`❌ Failed to sync ${action.type}:`, error);
        
        action.retryCount = (action.retryCount || 0) + 1;
        
        if (action.retryCount > 3) {
          console.error(`❌ Removing after 3 retries`);
          await this.pouchDb.removeFromQueue(i);
          
          if (action.type === 'post_create') {
            await this.removeOptimisticPost(action.channelId!, action.data.tempPostId);
            if (action.data.fileId) {
              await this.fileStorage.deleteFile(action.data.fileId);
            }
          }
        }
        break;
      }
    }
  }
  // Also update executeCreatePost to not handle queue removal

  /**
 * Execute the actual post creation with proper error handling
 */
  /* =========================
     EXECUTE CREATE POST
     ========================= */

  private async executeCreatePost(
    action: PendingAction,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    const { body, file, senderId } = action.data;
    let mediaId: string | null = null;

    console.log('🔄 Executing createPost:', {
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      channelId: action.channelId
    });

    try {
      // 1️⃣ Upload file if exists
      if (file) {
        console.log('📤 Starting file upload...');

        const uploadPayload = {
          channel_id: parseInt(action.channelId!),
          sender_id: senderId || this.currentUserId,
          media_type: file.type.startsWith('image/') ? 'image' : 'video',
          file_size: file.size,
          content_type: file.type,
          metadata: { caption: body }
        };

        console.log('📤 Upload payload:', uploadPayload);

        const uploadResponse = await this.http
          .post<any>(this.UPLOAD_API, uploadPayload)
          .toPromise();

        console.log('✅ Upload response:', uploadResponse);

        if (!uploadResponse?.status) {
          throw new Error('Failed to get upload URL');
        }

        if (!uploadResponse.media_id) {
          throw new Error('No media_id in response');
        }

        if (!uploadResponse.upload_url) {
          throw new Error('No upload_url in response');
        }

        mediaId = uploadResponse.media_id;
        console.log(`✅ Got media_id: ${mediaId}`);

        // Upload to signed URL
        console.log('📤 Uploading to signed URL...');
        
        await new Promise<void>((resolve, reject) => {
          this.http.put(uploadResponse.upload_url, file, {
            observe: 'events',
            reportProgress: true,
            headers: {
              'Content-Type': file.type
            }
          }).subscribe({
            next: (event: any) => {
              if (event.type === HttpEventType.UploadProgress) {
                const progress = Math.round(100 * event.loaded / (event.total || 1));
                console.log(`📊 Upload progress: ${progress}%`);
                if (progressCallback) {
                  progressCallback(progress);
                }
              } else if (event.type === HttpEventType.Response) {
                console.log('✅ File uploaded');
                resolve();
              }
            },
            error: (err) => {
              console.error('❌ Upload failed:', err);
              reject(err);
            }
          });
        });

        console.log(`✅ File uploaded with media_id: ${mediaId}`);
      }

      // 2️⃣ Create post in Firebase
      console.log('📝 Creating post in Firebase...');
      
      const postsRef = ref(this.db, `channels/${action.channelId}/posts`);
      const newPostRef = push(postsRef);

      const postData: any = {
        body,
        created_by: senderId || this.currentUserId,
        timestamp: Date.now(),
        user_reactions: {}
      };

      // Only add media_id if it exists
      if (mediaId) {
        postData.media_id = mediaId;
      }

      console.log('📝 Post data:', postData);

      await set(newPostRef, postData);

      console.log(`✅ Post created in Firebase: ${newPostRef.key}`);

    } catch (error: any) {
      console.error('❌ Failed to create post:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }


  // In post.ts - Replace getPosts() method

 /* =========================
     GET POSTS
     ========================= */

  getPosts(channelId: string): Observable<CachedPost[]> {
    const postsRef = ref(this.db, `channels/${channelId}/posts`);
    this.postsRefMap.set(channelId, postsRef);

    return new Observable((observer) => {
      let hasEmitted = false;

      // Load from cache first
      this.pouchDb.getPosts(channelId).then(cachedPosts => {
        if (cachedPosts.length > 0) {
          console.log(`📱 Loaded ${cachedPosts.length} posts from cache`);
          observer.next(cachedPosts);
          hasEmitted = true;
        }
      });

      // Setup Firebase listener
      onValue(postsRef, async (snapshot) => {
        const data = snapshot.val() || {};
        const firebasePosts: CachedPost[] = Object.keys(data)
          .map(id => ({ id, ...data[id] }))
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        console.log(`🔥 Firebase: ${firebasePosts.length} posts`);

        await this.pouchDb.savePosts(channelId, firebasePosts);
        observer.next(firebasePosts);
        hasEmitted = true;

      }, (error) => {
        console.error('❌ Firebase error:', error);
        
        if (!hasEmitted) {
          this.pouchDb.getPosts(channelId).then(cachedPosts => {
            observer.next(cachedPosts);
          });
        }
      });
    });
  }

  cleanupPostsListener(channelId: string) {
    const ref = this.postsRefMap.get(channelId);
    if (ref) {
      off(ref);
      this.postsRefMap.delete(channelId);
    }
  }

  /**
   * Helper to load and emit cached posts
   */
  private async loadAndEmitCache(
    channelId: string,
    observer: any
  ): Promise<void> {
    try {
      const cachedPosts = await this.pouchDb.getPosts(channelId);

      if (cachedPosts.length > 0) {
        console.log(`📱 Emitting ${cachedPosts.length} cached posts`);
        observer.next(cachedPosts);
      } else {
        console.log('📱 No cached posts found');
        observer.next([]);
      }
    } catch (error) {
      console.error('❌ Failed to load cached posts:', error);
      observer.next([]);
    }
  }

  /**
   * Alternative: Simpler implementation with better offline handling
   */
  getPostsSimplified(channelId: string): Observable<CachedPost[]> {
    return new Observable((observer) => {
      const postsRef = ref(this.db, `channels/${channelId}/posts`);
      this.postsRefMap.set(channelId, postsRef);

      // Load cache immediately
      this.pouchDb.getPosts(channelId).then(cachedPosts => {
        console.log(`📱 Loaded ${cachedPosts.length} posts from cache`);
        observer.next(cachedPosts);
      });

      // Setup Firebase listener (will update when online)
      const unsubscribe = onValue(
        postsRef,
        async (snapshot) => {
          const data = snapshot.val() || {};
          const firebasePosts: CachedPost[] = Object.keys(data)
            .map(id => ({ id, ...data[id] }))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

          console.log(`🔥 Firebase: ${firebasePosts.length} posts`);

          // Save to cache
          await this.pouchDb.savePosts(channelId, firebasePosts);

          // Emit to UI
          observer.next(firebasePosts);
        },
        (error) => {
          // Firebase error - silently continue using cache
          console.error('❌ Firebase error (using cache):', error);
        }
      );

      return () => unsubscribe();
    });
  }

  /**
   * Check if Firebase data is different from cached data
   */
  private hasDataChanged(cached: CachedPost[], firebase: CachedPost[]): boolean {
    // Quick checks first
    if (cached.length !== firebase.length) return true;

    // Create maps for efficient comparison
    const cachedMap = new Map(cached.map(p => [p.id, p]));
    const firebaseMap = new Map(firebase.map(p => [p.id, p]));

    // Check if any post IDs are different
    for (const id of firebaseMap.keys()) {
      if (!cachedMap.has(id)) return true;
    }

    // Check if any post content is different
    for (const [id, firebasePost] of firebaseMap.entries()) {
      const cachedPost = cachedMap.get(id);
      if (!cachedPost) return true;

      // Compare key fields that matter
      if (
        cachedPost.body !== firebasePost.body ||
        cachedPost.media_id !== firebasePost.media_id ||
        cachedPost.timestamp !== firebasePost.timestamp ||
        JSON.stringify(cachedPost.user_reactions) !== JSON.stringify(firebasePost.user_reactions)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Load posts from cache (including pending)
   */
  // private async loadCachedPosts(channelId: string): Promise<CachedPost[]> {
  //   const [cached, pending] = await Promise.all([
  //     this.pouchDb.getPosts(channelId),
  //     this.pouchDb.getPendingPosts(channelId)
  //   ]);

  //   return [...cached, ...pending];
  // }

  // cleanupPostsListener(channelId: string) {
  //   const ref = this.postsRefMap.get(channelId);
  //   if (ref) {
  //     off(ref);
  //     this.postsRefMap.delete(channelId);
  //   }
  // }

  /* =========================
     MEDIA URL MANAGEMENT
     ========================= */

    /* =========================
     MEDIA & REACTIONS (Keep existing code)
     ========================= */

  async getFreshMediaUrl(mediaId: string): Promise<{ downloadUrl: string }> {
    const cachedUrl = await this.pouchDb.getMediaUrl(mediaId);
    if (cachedUrl) {
      return { downloadUrl: cachedUrl };
    }

    try {
      const response = await this.http.get<any>(
        `${this.DOWNLOAD_API_BASE}/${mediaId}`
      ).toPromise();

      if (response?.downloadUrl) {
        await this.pouchDb.cacheMediaUrl(mediaId, response.downloadUrl);
      }

      return response;
    } catch (error) {
      console.error('❌ Failed to get media URL:', error);
      throw error;
    }
  }

  /* =========================
     REACTIONS (WITH QUEUE)
     ========================= */


  /**
   * Enhanced reactions with immediate queue cleanup
   */
  async addOrUpdateReaction(
    channelId: string,
    postId: string,
    emoji: string,
    userId?: number
  ) {
    const uid = userId || this.currentUserId;
    const userReactionRef = ref(
      this.db,
      `channels/${channelId}/posts/${postId}/user_reactions/${uid}`
    );

    // Check existing reaction
    const snapshot = await get(userReactionRef);
    const existingReaction = snapshot.val() as UserReaction | null;

    if (existingReaction?.emoji === emoji) {
      // Toggle off - remove reaction
      await this.removeReaction(channelId, postId, userId);
      return;
    }

    // Create unique action ID
    const tempActionId = `reaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const action: PendingAction = {
      type: 'reaction_add',
      channelId,
      postId,
      data: { emoji, userId: uid, tempActionId },
      timestamp: Date.now()
    };

    await this.pouchDb.enqueueAction(action);

    // Try immediate execution if online
    if (this.isOnlineSubject.value) {
      try {
        await set(userReactionRef, {
          emoji,
          timestamp: Date.now()
        });

        // ✅ Remove from queue after success
        await this.removeActionFromQueue(tempActionId);
        console.log('✅ Reaction added and removed from queue');

      } catch (error) {
        console.error('❌ Failed to add reaction, will retry later:', error);
      }
    } else {
      console.log('📴 Offline: Reaction queued');
    }
  }

  async removeReaction(channelId: string, postId: string, userId?: number) {
    const uid = userId || this.currentUserId;
    const userReactionRef = ref(
      this.db,
      `channels/${channelId}/posts/${postId}/user_reactions/${uid}`
    );

    const tempActionId = `reaction_remove_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const action: PendingAction = {
      type: 'reaction_remove',
      channelId,
      postId,
      data: { userId: uid, tempActionId },
      timestamp: Date.now()
    };

    await this.pouchDb.enqueueAction(action);

    if (this.isOnlineSubject.value) {
      try {
        await remove(userReactionRef);

        // ✅ Remove from queue after success
        await this.removeActionFromQueue(tempActionId);
        console.log('✅ Reaction removed and removed from queue');

      } catch (error) {
        console.error('❌ Failed to remove reaction, will retry later:', error);
      }
    } else {
      console.log('📴 Offline: Reaction removal queued');
    }
  }



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

  aggregateReactions(
    userReactions: { [userId: string]: UserReaction } | null
  ): { [emoji: string]: number } {
    if (!userReactions) return {};

    const aggregated: { [emoji: string]: number } = {};
    Object.values(userReactions).forEach(reaction => {
      aggregated[reaction.emoji] = (aggregated[reaction.emoji] || 0) + 1;
    });

    return aggregated;
  }



  /* =========================
     UTILITY
     ========================= */

  async clearCache() {
    await this.pouchDb.clearAll();
    console.log('✅ Post cache cleared');
  }

  async getQueueStatus() {
    const queue = await this.pouchDb.getQueue();

    // Filter only post-related actions
    const postActions = queue.filter(a =>
      a.type === 'post_create' ||
      a.type === 'reaction_add' ||
      a.type === 'reaction_remove'
    );

    return {
      pending: postActions.length,
      actions: postActions
    };
  }

  /**
   * Get all queued actions (including channel actions)
   */
  async getAllQueuedActions() {
    const queue = await this.pouchDb.getQueue();
    return queue;
  }


  /* =========================
    CLEANUP & UTILITY
    ========================= */

  /**
   * Get storage status
   */
  async getStorageStatus() {
    const [fileUsage, queueStatus] = await Promise.all([
      this.fileStorage.getStorageUsage(),
      this.getQueueStatus()
    ]);

    return {
      files: fileUsage,
      queue: queueStatus
    };
  }

  /**
   * Clear all offline data
   */
  async clearAllOfflineData() {
    await Promise.all([
      this.fileStorage.clearAllFiles(),
      this.pouchDb.clearAll()
    ]);
    console.log('✅ Cleared all offline data');
  }

  /**
   * Cleanup old data
   */
  async cleanupOldData(daysOld: number = 7) {
    const [deletedFiles] = await Promise.all([
      this.fileStorage.clearOldFiles(daysOld),
      this.pouchDb.clearOldMediaCache(daysOld)
    ]);

    console.log(`🧹 Cleaned up ${deletedFiles} old files`);
    return { deletedFiles };
  }
}