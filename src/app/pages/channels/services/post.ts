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
  runTransaction
} from '@angular/fire/database';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HttpEventType } from '@angular/common/http';

const UPLOAD_API = 'https://apps.ekarigar.com/backend/api/media/channel_media/upload-url';
const DOWNLOAD_API_BASE = 'https://apps.ekarigar.com/backend/api/media/download-url';

@Injectable({
  providedIn: 'root'
})
export class PostService {

  constructor(private db: Database, private http: HttpClient) {}

  // ============================
  // 1️⃣ CREATE A POST (UPDATED WITH MEDIA UPLOAD)
  // ============================
  async createPost(
    channelId: string,
    body: string,
    file?: File,
    senderId: number = 52,
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    let imageUrl: string | undefined;

    if (file) {
      try {
        // Step 1: Get upload URL
        const uploadPayload = {
          channel_id: parseInt(channelId),
          sender_id: senderId,
          media_type: file.type.startsWith('image/') ? 'image' : 'video',
          file_size: file.size,
          content_type: file.type,
          metadata: {
            caption: body || 'Test post'
          }
        };

        const uploadResponse = await this.http.post<any>(UPLOAD_API, uploadPayload).toPromise();

        if (!uploadResponse.status || !uploadResponse.media_id || !uploadResponse.upload_url) {
          throw new Error('Failed to get upload URL');
        }

        const { media_id, upload_url } = uploadResponse;

        // Step 2: Upload file to S3 signed URL with progress
        await new Promise<void>((resolve, reject) => {
          const subscription = this.http.put(upload_url, file, {
            reportProgress: true,
            observe: 'events'
          }).subscribe({
            next: (event: any) => {
              if (event.type === HttpEventType.UploadProgress && progressCallback) {
                const progress = Math.round(100 * event.loaded / (event.total || 1));
                progressCallback(progress);
              } else if (event.type === HttpEventType.Response) {
                resolve();
              }
            },
            error: (error) => {
              reject(error);
            }
          });
        });

        // Step 3: Get download URL
        const downloadResponse = await this.http.get<any>(
          `${DOWNLOAD_API_BASE}/${media_id}`
        ).toPromise();

        if (!downloadResponse.status || !downloadResponse.downloadUrl) {
          throw new Error('Failed to get download URL');
        }

        imageUrl = downloadResponse.downloadUrl;
      } catch (error) {
        console.error('Media upload failed:', error);
        throw error; // Re-throw to handle in component
      }
    }

    // Step 4: Store post in Firebase
    const postsRef = ref(this.db, `channels/${channelId}/posts`);
    const newPostRef = push(postsRef);

    // Always store timestamp as a number (milliseconds since epoch)
    await set(newPostRef, {
      body,
      image: imageUrl,
      author: 'Volunteer Events',
      verified: true,
      isSent: true,
      timestamp: Date.now(),       // numeric timestamp
      reactions: {}
    });
  }

  // ============================
  // 2️⃣ GET POSTS REAL-TIME (OLDEST → NEWEST)
  // ============================
  getPosts(channelId: string): Observable<any[]> {
    const postsRef = query(
      ref(this.db, `channels/${channelId}/posts`),
      orderByChild('timestamp')
    );

    return new Observable((observer) => {
      onValue(postsRef, (snapshot) => {
        const data = snapshot.val() || {};

        const posts = Object.keys(data)
          .map(id => ({ id, ...data[id] }))
          // ✅ oldest first (11:00, 12:00, 13:00)
          .sort((a, b) => a.timestamp - b.timestamp);

        observer.next(posts);
      });
    });
  }

  // ============================
  // 3️⃣ ADD REACTION (SAFE INCREMENT USING TRANSACTION)
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
}