// import { Injectable } from '@angular/core';

// @Injectable({
//   providedIn: 'root'
// })
// export class Post {
  
// }
// src/app/services/post.ts
import { Injectable } from '@angular/core';

export interface ReactionMap {
  [emoji: string]: number;
}

export interface Post {
  id: string;
  channelId: string;
  title: string;
  body: string;
  image?: string;
  author?: string;
  reactions?: ReactionMap;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class PostService {
  // in-memory store keyed by channelId
  private postsByChannel: Record<string, Post[]> = {
    upstox: [
      {
        id: 'p1',
        channelId: 'upstox',
        title: 'This is what 50K people look like in one place!',
        body: 'Thank you 50K+ strong community',
        image: 'assets/upstox_post.png',
        author: 'Upstox',
        reactions: { '👍': 38 },
        createdAt: new Date().toISOString(),
      },
    ],
    memes: [
      {
        id: 'm1',
        channelId: 'memes',
        title: 'Top meme of the day',
        body: "You won't believe this one!",
        author: 'Memes',
        reactions: { '😂': 120 },
        createdAt: new Date().toISOString(),
      },
    ],
  };

  constructor() {}

  /** Return posts for a channel (shallow copies so callers don't mutate internal state). */
  async getPostsForChannel(channelId: string): Promise<Post[]> {
    await this.sleep(150); // simulate network latency
    const list = this.postsByChannel[channelId] ?? [];
    return list.map((p) => ({ ...p, reactions: { ...(p.reactions ?? {}) } }));
  }

  /**
   * Add a reaction to a post.
   * Returns the updated post (copy).
   */
  async addReaction(postId: string, emoji: string): Promise<Post> {
    await this.sleep(100);

    // find the post across channels
    for (const channelId of Object.keys(this.postsByChannel)) {
      const idx = this.postsByChannel[channelId].findIndex((p) => p.id === postId);
      if (idx !== -1) {
        const post = this.postsByChannel[channelId][idx];

        // update internal state
        const newReactions = { ...(post.reactions ?? {}) };
        newReactions[emoji] = (newReactions[emoji] || 0) + 1;

        this.postsByChannel[channelId][idx] = {
          ...post,
          reactions: newReactions,
        };

        // return a copy
        return { ...this.postsByChannel[channelId][idx], reactions: { ...newReactions } };
      }
    }

    throw new Error(`Post with id "${postId}" not found`);
  }

  // helper to simulate latency (remove in production)
  private sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }
}
