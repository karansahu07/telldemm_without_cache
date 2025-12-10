// src/app/pages/channels/channel-feed/channel-feed.page.ts
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, ActionSheetController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ChannelService, Channel } from '../services/channel';
import { forkJoin, firstValueFrom } from 'rxjs';
import { PostService } from '../services/post';
import { EmojiPickerModalComponent } from 'src/app/components/emoji-picker-modal/emoji-picker-modal.component';
import { AuthService } from 'src/app/auth/auth.service';

interface ReactionMap {
  [emoji: string]: number;
}

interface UserReaction {
  emoji: string;
  timestamp: number;
}

// export interface Post {
//   id: string;
//   body: string;
//   image?: string;
//   media_id?: string;
//   author?: string;
//   reactions?: ReactionMap;
//   user_reactions?: { [userId: string]: UserReaction };
//   timestamp?: number;
//   verified?: boolean;
//   isSent?: boolean;
// }

export interface Post {
  id: string;
  body: string;
  image?: string;
  media_id?: string;
  created_by: number;  // User ID who created the post
  user_reactions?: { [userId: string]: UserReaction };
  timestamp?: number;
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
  uploadProgress: number = 0;
  isUploading: boolean = false;
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

  // Cache for media URLs
  private mediaCache: Map<string, string> = new Map();

  // Current user ID (get from auth service)
  // private currentUserId: number = 52;
  // private currentUserId!: any;
  currentUserId!: any;
  canCreatePost: boolean = false;  // ADD THIS

  constructor(
    private route: ActivatedRoute,
    private postService: PostService,
    private channelService: ChannelService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private modalController: ModalController,
    private actionSheetController: ActionSheetController,
    private authService: AuthService
  ) {
    this.currentUserId = this.authService.authData?.userId || 0;  // ADD THIS
    // this.currentUserId = "76";  // ADD THIS

  }
  isOnline: boolean = true;
  ngOnInit() {
    this.channelId = this.route.snapshot.queryParamMap.get('channelId') || '0';
    if (!this.channelId) return;

    this.fetchChannelDetails();

    this.postService.getPosts(this.channelId).subscribe((rawPosts) => {
      this.resolveMediaUrls(rawPosts).then((resolvedPosts) => {
        this.posts = resolvedPosts;
        this.cdr.detectChanges();
      });
    });


    // Monitor connection status
    this.postService.getConnectionStatus().subscribe(isConnected => {
      this.isOnline = isConnected;
      console.log('Connection status:', isConnected ? 'Online' : 'Offline');
      this.cdr.detectChanges();
    });
  }

  // ============================
  // REACTION MANAGEMENT
  // ============================

  async openReactionPicker(post: Post) {
    const modal = await this.modalController.create({
      component: EmojiPickerModalComponent,
      cssClass: 'emoji-picker-modal'
    });

    await modal.present();
    const result = await modal.onWillDismiss();

    if (result?.data?.emoji) {
      await this.addOrUpdateReaction(post, result.data.emoji);
    }
  }

  // Add or update reaction (one per user)
  async addOrUpdateReaction(post: Post, emoji: string) {
    if (!this.channelId) return;

    await this.postService.addOrUpdateReaction(
      this.channelId,
      post.id,
      emoji,
      this.currentUserId
    );

    this.showReactionPopup = false;
  }

  // Show all reactions modal/page
  async showAllReactions(post: Post) {
    // TODO: Implement a modal showing all users who reacted
    // For now, show action sheet with basic info
    const reactions = this.getAggregatedReactions(post);
    const totalReactions = Object.values(reactions).reduce((sum, count) => sum + count, 0);

    const actionSheet = await this.actionSheetController.create({
      header: `${totalReactions} Reaction${totalReactions !== 1 ? 's' : ''}`,
      subHeader: 'Show all reactions',
      buttons: [
        ...Object.entries(reactions).map(([emoji, count]) => ({
          text: `${emoji} ${count} ${count === 1 ? 'person' : 'people'}`,
          icon: 'people-outline',
          handler: () => {
            // Navigate to detailed reactions page
            console.log('Show users for reaction:', emoji);
          }
        })),
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
  }

  // Show action sheet for reaction management
  async showReactionActionSheet(post: Post, emoji: string) {
    const currentUserReaction = await this.postService.getUserReaction(
      this.channelId!,
      post.id,
      this.currentUserId
    );

    const isMyReaction = currentUserReaction === emoji;

    const actionSheet = await this.actionSheetController.create({
      header: 'Manage Reaction',
      buttons: [
        {
          text: isMyReaction ? 'Remove Reaction' : 'React with ' + emoji,
          icon: isMyReaction ? 'trash-outline' : 'add-circle-outline',
          handler: async () => {
            if (isMyReaction) {
              await this.removeReaction(post);
            } else {
              await this.addOrUpdateReaction(post, emoji);
            }
          }
        },
        {
          text: 'See all reactions',
          icon: 'people-outline',
          handler: () => {
            this.showAllReactions(post);
          }
        },
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
  }

  // Remove reaction
  async removeReaction(post: Post) {
    if (!this.channelId) return;
    await this.postService.removeReaction(this.channelId, post.id, this.currentUserId);
  }

  // Get aggregated reactions for display
  getAggregatedReactions(post: Post): ReactionMap {
    return this.postService.aggregateReactions(post.user_reactions || null);
  }

  // Check if current user has reacted
  async hasUserReacted(post: Post): Promise<boolean> {
    if (!this.channelId) return false;
    const reaction = await this.postService.getUserReaction(this.channelId, post.id, this.currentUserId);
    return reaction !== null;
  }

  // ============================
  // FORWARD FUNCTIONALITY
  // ============================

  async forwardPost(post: Post) {
    const actionSheet = await this.actionSheetController.create({
      header: 'Forward to',
      buttons: [
        {
          text: 'Forward to another channel',
          icon: 'paper-plane-outline',
          handler: () => {
            // Navigate to channel selector
            console.log('Forward to channel');
          }
        },
        {
          text: 'Share outside app',
          icon: 'share-outline',
          handler: () => {
            // Use Share API
             console.log('Share to channel');
            // this.sharePost(post);
          }
        },
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
  }

  async sharePost(post: Post) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: this.channel?.channel_name || 'Channel Post',
          text: post.body,
          url: post.image || ''
        });
      } catch (err) {
        console.log('Share cancelled or failed:', err);
      }
    }
  }

  // ============================
  // EXISTING METHODS
  // ============================

  onHeaderClick() {
    if (this.channel && this.channel.channel_id) {
      this.router.navigate(['/channel-detail'], {
        queryParams: { channelId: this.channel.channel_id }
      });
    }
  }

  private fetchChannelDetails() {
    if (!this.channelId) return;
    this.channelService.getChannel(Number(this.channelId)).subscribe({
      next: (response) => {
        if (response.status && response.channel) {
          this.channel = response.channel;
          console.log("channel createdby", this.channel.created_by);//channel createdby 52
          // Check if current user is channel creator
          this.canCreatePost = this.channel.created_by == this.currentUserId;

           console.log('Channel created by:', this.channel.created_by);
        console.log('Current user:', this.currentUserId);
        console.log('Can create post:', this.canCreatePost);
          this.isMuted = false;
          this.cdr.detectChanges();
        }
      },
      error: (error) => {
        console.error('Failed to fetch channel details:', error);
      }
    });
  }

  async toggleMute() {
    this.isMuted = !this.isMuted;
    this.cdr.detectChanges();
  }

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

  async testAddPost() {
    if (!this.channelId) return;
    try {
      await this.postService.createPost(this.channelId, 'This is a test post', undefined, this.currentUserId);
    } catch (error) {
      console.error('Test post failed:', error);
    }
  }

  selectMedia() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // fileInput.accept = 'image/*,video/*';
    fileInput.accept = 'image/*';
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

  clearMedia() {
    this.selectedImage = null;
    this.selectedFile = undefined;
    this.newMessage = '';
  }

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

  react(post: Post, emoji: string) {
    this.addOrUpdateReaction(post, emoji);
  }

  async onDoubleTap(post: Post) {
    const now = Date.now();
    if (now - this.lastTapTime < 300) {
      await Haptics.impact({ style: ImpactStyle.Light });
      await this.addOrUpdateReaction(post, '❤️');
    }
    this.lastTapTime = now;
  }

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
        this.currentUserId,
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
    this.newMessage = '';
    this.selectedImage = null;
    this.selectedFile = undefined;
  }

  isImage(file: File): boolean {
    return file && file.type.startsWith('image/');
  }

  getUserInitial(userId: number): string {
    // You can fetch from user service or use channel name
    return this.channel?.channel_name?.[0] || 'U';
  }

  getUserName(userId: number): string {
    // You can fetch from user service or use channel name
    return this.channel?.channel_name || 'Channel Admin';
  }
}