// src/app/pages/channels/channel-feed/channel-feed.page.ts
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
// import { PostService } from '../../services/post'; // Adjusted path assuming services is at ../../services
import { ChannelService, Channel } from '../services/channel'; // Import Channel from service
import { forkJoin, firstValueFrom } from 'rxjs';
import { PostService } from '../services/post';

interface ReactionMap {
  [emoji: string]: number;
}

export interface Post {
  id: string;
  body: string;
  image?: string;
  media_id?: string;
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
  channel: Channel | null = null;
  posts: Post[] = [];
  newMessage: string = '';
  selectedImage: string | null = null;
  selectedFile: File | undefined = undefined;
  // Upload progress
  uploadProgress: number = 0;
  isUploading: boolean = false;
  // ⭐ NEW: Mute state
  isMuted: boolean = false;
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
  // Cache for media URLs (media_id -> downloadUrl)
  private mediaCache: Map<string, string> = new Map();

  constructor(
    private route: ActivatedRoute,
    private postService: PostService,
    private channelService: ChannelService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}

  ngOnInit() {
 // Updated to fetch from query param 'channelId' instead of route param 'id'
    this.channelId = this.route.snapshot.queryParamMap.get('channelId') || '0';
    if (!this.channelId) return;

    // Fetch channel details via service
    this.fetchChannelDetails();

    // Listen to real-time posts
    this.postService.getPosts(this.channelId).subscribe((rawPosts) => {
      this.resolveMediaUrls(rawPosts).then((resolvedPosts) => {
        this.posts = resolvedPosts;
        this.cdr.detectChanges();
      });
    });
  }


  // ⭐ NEW: On header click, navigate to channel detail page
  onHeaderClick() {
    if (this.channel && this.channel.channel_id) {
      this.router.navigate(['/channel-detail'], { queryParams: { channelId: this.channel.channel_id } });
    }
  }

  // Fetch channel details via service
  private fetchChannelDetails() {
    if (!this.channelId) return;
    this.channelService.getChannel(Number(this.channelId)).subscribe({
      next: (response) => {
        if (response.status && response.channel) {
          this.channel = response.channel;
          // ⭐ NEW: Initialize mute state (assume false or fetch from channel if available)
          this.isMuted = false; // Or this.channel?.is_muted || false if added to interface
          this.cdr.detectChanges();
        }
      },
      error: (error) => {
        console.error('Failed to fetch channel details:', error);
      }
    });
  }

  // ⭐ NEW: Toggle mute/unmute notifications
  async toggleMute() {
    
      this.isMuted = !this.isMuted;
      this.cdr.detectChanges();
   
  }

  // Resolve media URLs for posts (with caching)
  private async resolveMediaUrls(rawPosts: Post[]): Promise<Post[]> {
    const postsWithMedia = rawPosts.filter(p => p.media_id && !this.mediaCache.has(p.media_id));
    const unresolvedMediaIds = postsWithMedia.map(p => p.media_id!);

    if (unresolvedMediaIds.length > 0) {
      const urlObservables = unresolvedMediaIds.map(id =>
        this.postService.getFreshMediaUrl(id)
      );

      let responses: any[] = [];
      try {
        responses = await firstValueFrom(forkJoin(urlObservables));
      } catch (err) {
        console.error('Failed to resolve some media URLs:', err);
        responses = [];
      }

      responses.forEach((res, index) => {
        if (res && res.downloadUrl) {
          this.mediaCache.set(unresolvedMediaIds[index], res.downloadUrl);
        }
      });
    }

    return rawPosts.map(p => ({
      ...p,
      image: p.media_id ? this.mediaCache.get(p.media_id) : undefined
    }));
  }

  // TEST POST (unchanged, no media)
  async testAddPost() {
    if (!this.channelId) return;
    try {
      await this.postService.createPost(this.channelId, 'This is a test post', undefined, 52);
    } catch (error) {
      console.error('Test post failed:', error);
    }
  }

  // Media Picker (unchanged)
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

  // CLEAR MEDIA PREVIEW (unchanged)
  clearMedia() {
    this.selectedImage = null;
    this.selectedFile = undefined;
    this.newMessage = '';
  }

  // LONG PRESS → OPEN REACTION POPUP (unchanged)
  onTouchStart(ev: TouchEvent, post: Post) {
    this.isLongPress = false;
    const touch = ev.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.longPressTimer = setTimeout(() => {
      this.isLongPress = true;
      this.openReactionPopup(ev, post);
    }, 500);
  }

  onTouchMove(ev: TouchEvent) {
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
    if (!this.isLongPress) {
      this.onDoubleTap(post);
    }
    this.isLongPress = false;
  }

  async openReactionPopup(ev: TouchEvent, post: Post) {
    ev.preventDefault();
    this.activePost = post;
    const target = ev.target as HTMLElement;
    const postBubble = target.closest('.post-bubble') as HTMLElement;
   
    if (postBubble) {
      const rect = postBubble.getBoundingClientRect();
     
      this.popupX = rect.left + (rect.width / 2) - 140;
     
      this.popupY = rect.top - 70;
     
      if (this.popupX < 10) this.popupX = 10;
      if (this.popupX + 280 > window.innerWidth) {
        this.popupX = window.innerWidth - 290;
      }
      if (this.popupY < 10) this.popupY = rect.bottom + 10;
    }
    this.showReactionPopup = true;
    await Haptics.impact({ style: ImpactStyle.Medium });
  }

  closePopup() {
    this.showReactionPopup = false;
  }

  // ADD REACTION (unchanged)
  react(post: Post, emoji: string) {
    if (!this.channelId) return;
    this.postService.addReaction(this.channelId, post.id, emoji);
    this.showReactionPopup = false;
  }

  // DOUBLE TAP → ❤️ LIKE (unchanged)
  async onDoubleTap(post: Post) {
    const now = Date.now();
    if (now - this.lastTapTime < 300) {
      await Haptics.impact({ style: ImpactStyle.Light });
      this.react(post, '❤️');
    }
    this.lastTapTime = now;
  }

  // MULTI SELECT (unchanged)
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

  // SEND POST (unchanged)
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

  // Helper to check if selected file is an image (for conditional rendering)
  isImage(file: File): boolean {
    return file && file.type.startsWith('image/');
  }
}