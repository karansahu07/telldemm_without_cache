// import { Component, OnInit } from '@angular/core';

// @Component({
//   selector: 'app-channel-feed',
//   templateUrl: './channel-feed.page.html',
//   styleUrls: ['./channel-feed.page.scss'],
// })
// export class ChannelFeedPage implements OnInit {

//   constructor() { }

//   ngOnInit() {
//   }

// }

// src/app/pages/channel-feed/channel-feed.page.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PostService } from '../services/post';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

interface ReactionMap {
  [emoji: string]: number;
}

export interface Post {
  id: string;
  title: string;
  body: string;
  image?: string;
  author?: string;
  reactions?: ReactionMap;
}

@Component({
  selector: 'app-channel-feed',
  templateUrl: './channel-feed.page.html',
  styleUrls: ['./channel-feed.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule,FormsModule],
})
export class ChannelFeedPage implements OnInit {
  channelId!: string | null;
  posts: Post[] = []; // <- explicit type fixes the error

  constructor(private route: ActivatedRoute, private postService: PostService) {}

  async ngOnInit() {
    this.channelId = this.route.snapshot.paramMap.get('id');
    if (!this.channelId) {
      // handle missing id (navigate away, show error, etc.)
      return;
    }
    // Ensure postService.getPostsForChannel returns Promise<Post[]>
    this.posts = await this.postService.getPostsForChannel(this.channelId);
  }

  async react(post: Post, emoji: string) {
    // call service (ensure it returns Promise<void> or similar)
    await this.postService.addReaction(post.id, emoji);

    // update local UI optimistically
    post.reactions = post.reactions || {};
    post.reactions[emoji] = (post.reactions[emoji] || 0) + 1;
  }
}

