// src/app/pages/channels/channel-feed/channel-feed.page.ts
import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, ActionSheetController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ChannelService, Channel } from '../services/channel';
import { forkJoin, firstValueFrom, Subscription } from 'rxjs';
import { PostService } from '../services/post';
import { EmojiPickerModalComponent } from 'src/app/components/emoji-picker-modal/emoji-picker-modal.component';
import { AuthService } from 'src/app/auth/auth.service';
import { ChannelPouchDbService } from '../services/pouch-db';
import { FileStorageService } from '../services/file-storage';
// import { PostPouchDbService } from '../services/post-pouch-db.service';

interface ReactionMap {
  [emoji: string]: number;
}

interface UserReaction {
  emoji: string;
  timestamp: number;
}

export interface Post {
  id: string;
  body: string;
  image?: string;
  media_id?: string;
  created_by: number;
  user_reactions?: { [userId: string]: UserReaction };
  timestamp?: number;
  pendingImageId?:string;
  isPending?: boolean; // For optimistic posts
}

@Component({
  selector: 'app-channel-feed',
  templateUrl: './channel-feed.page.html',
  styleUrls: ['./channel-feed.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ChannelFeedPage implements OnInit, OnDestroy {
  channelId!: string | null;
  channel: Channel | null = null;
  posts: Post[] = [];
  newMessage: string = '';
  selectedImage: string | null = null;
  selectedFile: File | undefined = undefined;
  uploadProgress: number = 0;
  isUploading: boolean = false;
  isMuted: boolean = false;
  isOnline: boolean = true;

  // Track Blob URLs for cleanup
  private blobURLs: Set<string> = new Set();
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
  private postsSub?: Subscription;
  private connectionSub?: Subscription;

  // Cache for media URLs
  private mediaCache: Map<string, string> = new Map();

  currentUserId!: any;
  canCreatePost: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private postService: PostService,
    private channelService: ChannelService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private modalController: ModalController,
    private actionSheetController: ActionSheetController,
    private authService: AuthService,
    private postPouchDb: ChannelPouchDbService,
    private fileStorage: FileStorageService  // ✅ Add this
  ) {
    this.currentUserId = this.authService.authData?.userId || 0;
  }

  /* =========================
     LIFECYCLE - OFFLINE-FIRST
     ========================= */

  ngOnInit() {
    // Setup will happen in ionViewWillEnter
  }

  async ionViewWillEnter() {
    this.channelId = this.route.snapshot.queryParamMap.get('channelId') || '0';
    if (!this.channelId) return;

    // 1️⃣ Fetch channel details
    await this.fetchChannelDetails();

    // 2️⃣ Load cached media URLs first
    await this.loadCachedMediaUrls();

    // 3️⃣ Subscribe to posts (loads from cache immediately)
    this.subscribeToPosts();

    // 4️⃣ Monitor connection status
    this.subscribeToConnection();
  }

  ionViewWillLeave() {
    this.cleanup();
  }

  ngOnDestroy() {
     // ✅ IMPORTANT: Revoke all Blob URLs to free memory
    this.revokeBlobURLs();
    this.cleanup();
  }


   /**
   * Revoke all Blob URLs to prevent memory leaks
   */
  private revokeBlobURLs() {
    this.blobURLs.forEach(url => {
      URL.revokeObjectURL(url);
    });
    this.blobURLs.clear();
    console.log('🧹 Revoked all Blob URLs');
  }

  private cleanup() {
    if (this.postsSub) {
      this.postsSub.unsubscribe();
      this.postsSub = undefined;
    }

    if (this.connectionSub) {
      this.connectionSub.unsubscribe();
      this.connectionSub = undefined;
    }

    if (this.channelId) {
      this.postService.cleanupPostsListener(this.channelId);
    }
  }

  /* =========================
     DATA LOADING
     ========================= */

  // private subscribeToPosts() {
  //   if (!this.channelId) return;

  //   this.postsSub = this.postService
  //     .getPosts(this.channelId)
  //     .subscribe(async (rawPosts) => {
  //       console.log(`📱 Received ${rawPosts.length} posts`);

  //       // Resolve media URLs (from cache or API)
  //       const resolvedPosts = await this.resolveMediaUrls(rawPosts);
        
  //       this.posts = resolvedPosts;
  //       this.cdr.detectChanges();
  //     });
  // }

  // In channel-feed.page.ts

private subscribeToPosts() {
  if (!this.channelId) return;

  this.postsSub = this.postService
    .getPosts(this.channelId)
    .subscribe(async (rawPosts) => {
      console.log(`📱 Received ${rawPosts.length} posts`);

      if (rawPosts.length === 0 && !this.isOnline) {
        // Show "No cached posts" message
        console.log('📴 Offline with no cached posts');
      }

      // Resolve media URLs (from cache or API)
      const resolvedPosts = await this.resolveMediaUrls(rawPosts);
      
      this.posts = resolvedPosts;
      this.cdr.detectChanges();
    });
}


// In channel-feed.page.ts

async debugCacheStatus() {
  if (!this.channelId) return;
  
  console.log('=== CACHE DEBUG ===');
  
  // Check if posts are in cache
  const cached = await this.postPouchDb.getPosts(this.channelId);
  console.log('Cached posts:', cached.length);
  console.log('Cached data:', cached);
  
  // Check DB stats
  const stats = await this.postPouchDb.getStats();
  console.log('DB stats:', stats);
  
  // Full DB dump
  await this.postPouchDb.debugDump();
}

  private subscribeToConnection() {
    this.connectionSub = this.postService
      .getConnectionStatus()
      .subscribe(isConnected => {
        this.isOnline = isConnected;
        console.log(`Connection: ${isConnected ? '🟢 Online' : '📴 Offline'}`);
        this.cdr.detectChanges();
      });
  }

  private async fetchChannelDetails() {
    if (!this.channelId) return;

    // 1️⃣ Try to load from PouchDB cache first (instant)
    const cachedChannel = await this.postPouchDb.getChannel(Number(this.channelId));
    if (cachedChannel) {
      console.log('📱 Loaded channel from cache');
      this.channel = cachedChannel;
      this.canCreatePost = this.channel.created_by == this.currentUserId;
      this.isMuted = false;
      this.cdr.detectChanges();
    }

    // 2️⃣ Then fetch from backend (background refresh)
    try {
      const response = await firstValueFrom(
        this.channelService.getChannel(Number(this.channelId))
      );

      if (response.status && response.channel) {
        console.log('🌐 Loaded channel from backend');
        this.channel = response.channel;
        this.canCreatePost = this.channel.created_by == this.currentUserId;
        this.isMuted = false;

        // 3️⃣ Cache to PouchDB for next time
        await this.postPouchDb.saveChannel(this.channel);
        
        this.cdr.detectChanges();
      }
    } catch (error) {
      console.error('❌ Failed to fetch channel details from backend:', error);
      
      // If we have cached data, we're good
      if (cachedChannel) {
        console.log('📴 Using cached channel data (backend unavailable)');
      } else {
        console.error('❌ No cached channel data available');
      }
    }
  }

   dumpDbToConsole() {
    this.postPouchDb.consoleDumpAll();
  }

  /* =========================
     MEDIA URL RESOLUTION
     ========================= */

  /**
   * Load media URLs from PouchDB cache
   * Pre-populates mediaCache for faster media display
   */
  private async loadCachedMediaUrls() {
    if (!this.channelId) return;

    console.log('📱 Loading cached media URLs...');

    try {
      // Get all posts from cache
      const cachedPosts = await this.postPouchDb.getPosts(this.channelId);
      
      // Extract unique media IDs
      const mediaIds = cachedPosts
        .filter(p => p.media_id && p.media_id !== 'pending_upload')
        .map(p => p.media_id!);

      // Remove duplicates
      const uniqueMediaIds = [...new Set(mediaIds)];

      if (uniqueMediaIds.length === 0) {
        console.log('📱 No media IDs found in cache');
        return;
      }

      // Load URLs in parallel for better performance
      const urlPromises = uniqueMediaIds.map(id => 
        this.postPouchDb.getMediaUrl(id)
      );
      const urls = await Promise.all(urlPromises);

      let loadedCount = 0;
      urls.forEach((url, index) => {
        if (url) {
          this.mediaCache.set(uniqueMediaIds[index], url);
          loadedCount++;
        }
      });

      console.log(`📱 Loaded ${loadedCount}/${uniqueMediaIds.length} media URLs from cache`);

    } catch (error) {
      console.error('❌ Failed to load cached media URLs:', error);
    }
  }

  /* =========================
     MEDIA URL RESOLUTION - UPDATED
     ========================= */

  /**
   * Resolve media URLs (including pending Blob URLs from IndexedDB)
   */
  private async resolveMediaUrls(rawPosts: Post[]): Promise<Post[]> {
    const resolvedPosts: Post[] = [];

    for (const post of rawPosts) {
      let resolvedPost = { ...post };

      // 1️⃣ Check if this is a pending post with file in IndexedDB
      if (post.isPending && post.pendingImageId) {
        try {
          const blobUrl = await this.fileStorage.getFileURL(post.pendingImageId);
          
          if (blobUrl) {
            resolvedPost.image = blobUrl;
            this.blobURLs.add(blobUrl); // Track for cleanup
            console.log(`📱 Using Blob URL from IndexedDB: ${post.pendingImageId}`);
          } else {
            console.warn(`⚠️ File not found in IndexedDB: ${post.pendingImageId}`);
          }
        } catch (error) {
          console.error('❌ Failed to get Blob URL from IndexedDB:', error);
        }
      }
      // 2️⃣ Check if already in memory cache
      else if (post.media_id && this.mediaCache.has(post.media_id)) {
        resolvedPost.image = this.mediaCache.get(post.media_id);
      }
      // 3️⃣ Try PouchDB cache for server URLs
      else if (post.media_id && post.media_id !== 'pending_upload') {
        const cachedUrl = await this.postPouchDb.getMediaUrl(post.media_id);
        
        if (cachedUrl) {
          this.mediaCache.set(post.media_id, cachedUrl);
          resolvedPost.image = cachedUrl;
          console.log(`📱 Using cached server URL: ${post.media_id}`);
        }
        // 4️⃣ Fetch from API if online and not cached
        else if (this.isOnline) {
          try {
            const response = await this.postService.getFreshMediaUrl(post.media_id);
            
            if (response?.downloadUrl) {
              this.mediaCache.set(post.media_id, response.downloadUrl);
              resolvedPost.image = response.downloadUrl;
              console.log(`🌐 Fetched server URL: ${post.media_id}`);
            }
          } catch (err) {
            console.error('❌ Failed to fetch media URL:', err);
          }
        } else {
          console.log(`📴 Offline: Cannot fetch media URL for ${post.media_id}`);
        }
      }

      resolvedPosts.push(resolvedPost);
    }

    return resolvedPosts;
  }

  /* =========================
     SEND POST
     ========================= */

/* =========================
     SEND POST - NO CHANGES NEEDED
     ========================= */

  async sendPost() {
    if (!this.channelId) return;
    if (!this.newMessage && !this.selectedFile) return;

    this.isUploading = true;
    this.uploadProgress = 0;

    try {
      // PostService handles IndexedDB storage automatically
      await this.postService.createPost(
        this.channelId,
        this.newMessage,
        this.selectedFile,
        this.currentUserId,
        (progress: number) => {
          this.uploadProgress = progress;
          this.cdr.detectChanges();
        }
      );

      console.log('✅ Post sent successfully');

    } catch (error) {
      console.error('❌ Post creation failed:', error);
      
      if (!this.isOnline) {
        console.log('📴 Post will be sent when back online');
      }
    } finally {
      this.isUploading = false;
      this.uploadProgress = 0;
      this.newMessage = '';
      this.selectedImage = null;
      this.selectedFile = undefined;
      this.cdr.detectChanges();
    }
  }


   /* =========================
     DEBUG & UTILITY METHODS
     ========================= */

  /**
   * Debug: Check storage status
   */
  async debugStorageStatus() {
    console.log('=== STORAGE DEBUG ===');
    
    // Check IndexedDB file storage
    const fileUsage = await this.fileStorage.getStorageUsage();
    console.log('📊 IndexedDB Files:', fileUsage);
    
    // Check PouchDB cache
    const cachedPosts = await this.postPouchDb.getPosts(this.channelId!);
    console.log('📱 Cached posts:', cachedPosts.length);
    
    // Check queue
    const queueStatus = await this.postService.getQueueStatus();
    console.log('📝 Queue status:', queueStatus);
    
    // Check full storage status
    const storageStatus = await this.postService.getStorageStatus();
    console.log('💾 Full storage status:', storageStatus);
  }

  /**
   * Debug: List all files in IndexedDB
   */
  async debugListFiles() {
    const files = await this.fileStorage.getAllFiles();
    console.log('📂 Files in IndexedDB:', files);
    
    files.forEach(file => {
      console.log(`  - ${file.id}: ${file.fileName} (${this.formatBytes(file.fileSize)})`);
    });
  }

    /**
   * Cleanup old data
   */
  async cleanupOldData() {
    try {
      const result = await this.postService.cleanupOldData(7);
      console.log(`✅ Cleaned up ${result.deletedFiles} old files`);
      
      // Reload posts to reflect changes
      this.subscribeToPosts();
    } catch (error) {
      console.error('❌ Failed to cleanup old data:', error);
    }
  }

  /**
   * Clear all offline data (for testing)
   */
  async clearAllOfflineData() {
    try {
      await this.postService.clearAllOfflineData();
      console.log('✅ Cleared all offline data');
      
      // Revoke Blob URLs
      this.revokeBlobURLs();
      
      // Reload
      this.posts = [];
      this.cdr.detectChanges();
    } catch (error) {
      console.error('❌ Failed to clear offline data:', error);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /* =========================
     REACTIONS
     ========================= */

  async react(post: Post, emoji: string) {
    await this.addOrUpdateReaction(post, emoji);
  }

  async addOrUpdateReaction(post: Post, emoji: string) {
    if (!this.channelId) return;

    try {
      await this.postService.addOrUpdateReaction(
        this.channelId,
        post.id,
        emoji,
        this.currentUserId
      );

      this.showReactionPopup = false;
    } catch (error) {
      console.error('❌ Failed to add reaction:', error);
    }
  }

  async removeReaction(post: Post) {
    if (!this.channelId) return;

    try {
      await this.postService.removeReaction(
        this.channelId,
        post.id,
        this.currentUserId
      );
    } catch (error) {
      console.error('❌ Failed to remove reaction:', error);
    }
  }

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

  async showAllReactions(post: Post) {
    const reactions = this.getAggregatedReactions(post);
    const totalReactions = Object.values(reactions).reduce((sum, count) => sum + count, 0);

    const actionSheet = await this.actionSheetController.create({
      header: `${totalReactions} Reaction${totalReactions !== 1 ? 's' : ''}`,
      buttons: [
        ...Object.entries(reactions).map(([emoji, count]) => ({
          text: `${emoji} ${count} ${count === 1 ? 'person' : 'people'}`,
          icon: 'people-outline',
          handler: () => {
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

  getAggregatedReactions(post: Post): ReactionMap {
    return this.postService.aggregateReactions(post.user_reactions || null);
  }

  async hasUserReacted(post: Post): Promise<boolean> {
    if (!this.channelId) return false;
    const reaction = await this.postService.getUserReaction(
      this.channelId,
      post.id,
      this.currentUserId
    );
    return reaction !== null;
  }

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

  /* =========================
     TOUCH INTERACTIONS
     ========================= */

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

  async onDoubleTap(post: Post) {
    const now = Date.now();
    if (now - this.lastTapTime < 300) {
      await Haptics.impact({ style: ImpactStyle.Light });
      await this.addOrUpdateReaction(post, '❤️');
    }
    this.lastTapTime = now;
  }

  /* =========================
     MEDIA SELECTION
     ========================= */

  selectMedia() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (event: any) => {
      const file = event.target.files[0];
      if (!file) return;
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        this.selectedImage = reader.result as string;
        this.cdr.detectChanges();
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

  isImage(file: File): boolean {
    return file && file.type.startsWith('image/');
  }

  /* =========================
     FORWARD & OTHER ACTIONS
     ========================= */

  async forwardPost(post: Post) {
    const actionSheet = await this.actionSheetController.create({
      header: 'Forward to',
      buttons: [
        {
          text: 'Forward to another channel',
          icon: 'paper-plane-outline',
          handler: () => {
            console.log('Forward to channel');
          }
        },
        {
          text: 'Share outside app',
          icon: 'share-outline',
          handler: () => {
            this.sharePost(post);
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

  /* =========================
     MULTI-SELECT
     ========================= */

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

  /* =========================
     UI HELPERS
     ========================= */

  async toggleMute() {
    this.isMuted = !this.isMuted;
    this.cdr.detectChanges();


  }

  async onHeaderClick() {
    if (this.channel && this.channel.channel_id) {
      this.router.navigate(['/channel-detail'], {
        queryParams: { channelId: this.channel.channel_id }
      });
    }
  }

  getUserInitial(userId: number): string {
    return this.channel?.channel_name?.[0] || 'U';
  }

  getUserName(userId: number): string {
    return this.channel?.channel_name || 'Channel Admin';
  }
}