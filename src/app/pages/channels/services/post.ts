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
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PostService {

  constructor(private db: Database) {}

  // ============================
  // 1️⃣ CREATE A POST
  // ============================
  async createPost(channelId: string, post: any) {
    const postsRef = ref(this.db, `channels/${channelId}/posts`);
    const newPostRef = push(postsRef);

    // Always store timestamp as a number (milliseconds since epoch)
    return set(newPostRef, {
      ...post,
      timestamp: Date.now(),       // numeric timestamp
      reactions: post.reactions || {}
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
