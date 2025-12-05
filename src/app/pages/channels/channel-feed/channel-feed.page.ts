// src/app/pages/channel-feed/channel-feed.page.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { PostService } from '../services/post';

interface ReactionMap {
  [emoji: string]: number;
}

export interface Post {
  id: string;
  title?: string;
  body: string;
  image?: string;
  author?: string;
  reactions?: ReactionMap;
  timestamp?: number;
  verified?: boolean;
  isSent?: boolean; // true for sent (right), false for received (left)
}

@Component({
  selector: 'app-channel-feed',
  templateUrl: './channel-feed.page.html',
  styleUrls: ['./channel-feed.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ChannelFeedPage implements OnInit {
  channelId!: string | null;
  posts: Post[] = [];

  newMessage: string = '';
  selectedImage: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private postService: PostService
  ) {}

  ngOnInit() {
    // later you can read from route: this.route.snapshot.paramMap.get('channelId')
    this.channelId = '28';

    if (!this.channelId) return;

    this.postService.getPosts(this.channelId).subscribe((data) => {
      this.posts = data;
    });
  }

  // Optional: if you wire reactions to UI later
  async react(post: Post, emoji: string) {
    if (!this.channelId) return;
    await this.postService.addReaction(this.channelId, post.id, emoji);
  }

  /** Format numeric timestamp → HH:MM (like 09:21) */
  formatTime(ts?: number): string {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  testAddPost() {
    if (!this.channelId) return;

    console.log('clicked');
    this.postService.createPost(this.channelId, {
      author: 'Volunteer Events',
      body: 'This is a test message',
      image:
        'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=600',
      verified: true,
      isSent: false,
    });
  }

  selectMedia() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = (event: any) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        this.selectedImage = reader.result as string;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  sendPost() {
    if (!this.channelId) return;
    if (!this.newMessage && !this.selectedImage) return;

    const postData = {
      body: this.newMessage,
      image: this.selectedImage,
      author: 'Volunteer Events',
      verified: true,
      isSent: true,
      // ❌ no need to send timestamp here; service will set Date.now()
    };

    this.postService.createPost(this.channelId, postData);

    // Reset UI
    this.newMessage = '';
    this.selectedImage = null;
  }
}
