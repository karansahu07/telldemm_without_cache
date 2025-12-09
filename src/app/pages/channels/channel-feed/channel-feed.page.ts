// src/app/pages/channel-feed/channel-feed.page.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PostService } from '../services/post';

interface ReactionMap {
  [emoji: string]: number;
}

export interface Post {
  id: string;
  body: string;
  image?: string;
  author?: string;
  reactions?: ReactionMap;
  timestamp?: number;
  verified?: boolean;
  isSent?: boolean;
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
  selectedFile: File | undefined = undefined;
  // Upload progress
  uploadProgress: number = 0;
  isUploading: boolean = false;

  // Reaction popup
  showReactionPopup: boolean = false;
  popupX = 0;
  popupY = 0;
  activePost!: Post;

  // Double tap
  lastTapTime: number = 0;

  // Multi-select
  selectionMode: boolean = false;
  selectedPosts: Set<string> = new Set();

  // Long press detection
  private longPressTimer: any;
  private isLongPress: boolean = false;
  private touchStartX: number = 0;
  private touchStartY: number = 0;

  constructor(private route: ActivatedRoute, private postService: PostService) {}

  ngOnInit() {
    this.channelId = '28';
    if (!this.channelId) return;

    this.postService.getPosts(this.channelId).subscribe((data) => {
      this.posts = data;
    });
  }

  // ---------------------------
  // ⭐ TEST POST (updated for new service signature)
  // ---------------------------
  async testAddPost() {
    if (!this.channelId) return;

    try {
      await this.postService.createPost(this.channelId, 'This is a test post', undefined, 52);
    } catch (error) {
      console.error('Test post failed:', error);
    }
  }

  // ---------------------------
  // ⭐ Media Picker (updated to store File)
  // ---------------------------
  selectMedia() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,video/*';

    fileInput.onchange = (event: any) => {
      const file = event.target.files[0];
      if (!file) return;

      this.selectedFile = file;

      const reader = new FileReader();
      reader.onload = () => {
        this.selectedImage = reader.result as string;
      };
      reader.readAsDataURL(file);
    };

    fileInput.click();
  }

  // ---------------------------
  // ⭐ CLEAR MEDIA PREVIEW
  // ---------------------------
  clearMedia() {
    this.selectedImage = null;
    this.selectedFile = undefined;
  }

  // ----------------------------------------
  // ⭐ LONG PRESS → OPEN REACTION POPUP
  // ----------------------------------------
  onTouchStart(ev: TouchEvent, post: Post) {
    this.isLongPress = false;
    const touch = ev.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;

    // Start long press timer
    this.longPressTimer = setTimeout(() => {
      this.isLongPress = true;
      this.openReactionPopup(ev, post);
    }, 500); // 500ms for long press
  }

  onTouchMove(ev: TouchEvent) {
    // Cancel long press if finger moves too much
    const touch = ev.touches[0];
    const deltaX = Math.abs(touch.clientX - this.touchStartX);
    const deltaY = Math.abs(touch.clientY - this.touchStartY);

    if (deltaX > 10 || deltaY > 10) {
      clearTimeout(this.longPressTimer);
      this.isLongPress = false;
    }
  }

  onTouchEnd(post: Post) {
    clearTimeout(this.longPressTimer);

    // If it wasn't a long press, handle as tap/double-tap
    if (!this.isLongPress) {
      this.onDoubleTap(post);
    }

    this.isLongPress = false;
  }

  async openReactionPopup(ev: TouchEvent, post: Post) {
    ev.preventDefault();
    this.activePost = post;

    // Get the post bubble element
    const target = ev.target as HTMLElement;
    const postBubble = target.closest('.post-bubble') as HTMLElement;
    
    if (postBubble) {
      const rect = postBubble.getBoundingClientRect();
      
      // Center popup horizontally on the bubble
      this.popupX = rect.left + (rect.width / 2) - 140; // 140 is half of popup width (~280px)
      
      // Position above the bubble
      this.popupY = rect.top - 70; // 70px above the bubble
      
      // Keep popup within viewport bounds
      if (this.popupX < 10) this.popupX = 10;
      if (this.popupX + 280 > window.innerWidth) {
        this.popupX = window.innerWidth - 290;
      }
      if (this.popupY < 10) this.popupY = rect.bottom + 10; // Show below if no space above
    }

    this.showReactionPopup = true;
    await Haptics.impact({ style: ImpactStyle.Medium });
  }

  closePopup() {
    this.showReactionPopup = false;
  }

  // ----------------------------------------
  // ⭐ ADD REACTION
  // ----------------------------------------
  react(post: Post, emoji: string) {
    if (!this.channelId) return;
    this.postService.addReaction(this.channelId, post.id, emoji);
    this.showReactionPopup = false;
  }

  // ----------------------------------------
  // ⭐ DOUBLE TAP → ❤️ LIKE
  // ----------------------------------------
  async onDoubleTap(post: Post) {
    const now = Date.now();
    if (now - this.lastTapTime < 300) {
      await Haptics.impact({ style: ImpactStyle.Light });
      this.react(post, '❤️');
    }
    this.lastTapTime = now;
  }

  // ----------------------------------------
  // ⭐ MULTI SELECT
  // ----------------------------------------
  enableSelectMode(post: Post) {
    this.selectionMode = true;
    this.selectedPosts.add(post.id);
  }

  toggleSelect(post: Post) {
    if (this.selectedPosts.has(post.id)) {
      this.selectedPosts.delete(post.id);
      if (this.selectedPosts.size === 0) this.selectionMode = false;
    } else {
      this.selectedPosts.add(post.id);
    }
  }

  // ----------------------------------------
  // ⭐ SEND POST (updated to use new service with upload handling)
  // ----------------------------------------
  async sendPost() {
    if (!this.channelId) return;
    if (!this.newMessage && !this.selectedFile) return;

    this.isUploading = true;
    this.uploadProgress = 0;

    try {
      await this.postService.createPost(
        this.channelId,
        this.newMessage,
        this.selectedFile,
        52,
        (progress: number) => {
          this.uploadProgress = progress;
        }
      );
    } catch (error) {
      console.error('Post creation failed:', error);
      // Optionally show alert to user
      return;
    } finally {
      this.isUploading = false;
      this.uploadProgress = 0;
    }

    // Clear form
    this.newMessage = '';
    this.selectedImage = null;
    this.selectedFile = undefined;
  }
}