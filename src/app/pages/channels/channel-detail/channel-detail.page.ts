import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ChannelService, Channel, ChannelDetails } from 'src/app/pages/channels/services/channel';
import { AuthService } from 'src/app/auth/auth.service';
import { ToastController, ActionSheetController, AlertController } from '@ionic/angular';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

@Component({
  selector: 'app-channel-detail',
  templateUrl: './channel-detail.page.html',
  styleUrls: ['./channel-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ChannelDetailPage implements OnInit {
  channelId: number | null = null;
  channel: ChannelDetails | null = null;
  channelPosts: any[] = [];
  isLoading = false;
  isLoadingChannel = true;
  errorMessage: string | null = null;
  isFollowing = false;
  isMuted = false;
  userId: any;
  formattedCreatedAt: string = '';
  followers: any[] = [];
  isLoadingFollowers = false;

  // View mode for followers section
  followersViewMode: 'grid' | 'list' = 'grid';

  /**
   * Toggle between grid and list view
   */
  toggleFollowersView(mode: 'grid' | 'list') {
    this.followersViewMode = mode;
    // Optionally save preference to localStorage
    localStorage.setItem('followers_view_mode', mode);
  }

  // Media slider
  mediaItems: any[] = [];

  // Stats
  stats = {
    posts: 0,
    followers: 0,
    engagement: 0
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private channelService: ChannelService,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController
  ) {
    this.userId = this.authService.authData?.userId || '';
  }

  ngOnInit() {
    this.channelId = this.route.snapshot.queryParams['channelId']
      ? Number(this.route.snapshot.queryParams['channelId'])
      : null;

    if (this.channelId) {
      this.loadChannelDetails();
      this.loadMuteStatus();
    } else {
      this.errorMessage = 'Invalid channel ID';
      this.isLoadingChannel = false;
    }

    // Load saved view preference
    const savedViewMode = localStorage.getItem('followers_view_mode') as 'grid' | 'list';
    if (savedViewMode) {
      this.followersViewMode = savedViewMode;
    }
  }

  loadChannelDetails() {
    this.isLoadingChannel = true;
    this.errorMessage = null;

    this.channelService.getChannelDetails(this.channelId!).subscribe({
      next: (res) => {
        this.isLoadingChannel = false;

        if (res?.status && res.channel) {
          this.channel = res.channel;
          console.log("channels all", this.channel);

          // Format date
          if (this.channel?.created_at) {
            const date = new Date(this.channel.created_at);
            this.formattedCreatedAt = date.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            });
          }

          // Set stats
          this.stats.followers = this.channel.followers_count || 0;
          this.stats.posts = this.channelPosts.length;

          // Generate mock media items (replace with real data)
          this.generateMediaItems();

          // Load extra UI data
          this.loadFollowStatus();
          this.loadChannelPosts();
        } else {
          this.errorMessage = 'Channel not found';
        }
      },
      error: () => {
        this.isLoadingChannel = false;
        this.errorMessage = 'Failed to load channel details';
      }
    });
  }

  generateMediaItems() {
    // Mock media items - replace with actual channel media
    this.mediaItems = [
      { type: 'image', url: this.channel?.channel_dp || 'assets/images/user.jfif' },
      // { type: 'image', url: 'https://picsum.photos/400/300?random=1' },
      // { type: 'image', url: 'https://picsum.photos/400/300?random=2' },
      // { type: 'image', url: 'https://picsum.photos/400/300?random=3' }
    ];
  }

  loadFollowStatus() {
    if (!this.userId || !this.channelId) {
      this.isFollowing = false;
      return;
    }

    this.channelService.getUserFollowerChannels(this.userId, { limit: 100 }).subscribe({
      next: (res: any) => {
        if (res?.status && Array.isArray(res.channels)) {
          this.isFollowing = res.channels.some((ch: Channel) => ch.channel_id === this.channelId);
        }
      },
      error: () => {
        console.error('Failed to load follow status');
        this.isFollowing = false;
      }
    });
  }

  loadMuteStatus() {
    // Load mute status from local storage or backend
    const muteKey = `channel_mute_${this.channelId}`;
    this.isMuted = localStorage.getItem(muteKey) === 'true';
  }

  loadChannelPosts() {
    // Placeholder: Fetch posts for the channel
    this.channelPosts = [];
  }

  toggleFollow() {
    if (!this.channel || this.isLoading || !this.userId) return;

    this.isLoading = true;
    const action$ = this.isFollowing
      ? this.channelService.unfollowChannel(this.channel.channel_id, this.userId)
      : this.channelService.followChannel(this.channel.channel_id, this.userId);

    action$.subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (res?.status) {
          this.isFollowing = !this.isFollowing;
          this.channel!.followers_count = (this.channel!.followers_count || 0) + (this.isFollowing ? 1 : -1);
          this.stats.followers = this.channel!.followers_count;
          this.presentToast(this.isFollowing ? 'Following!' : 'Unfollowed');
        } else {
          this.presentToast('Failed to update follow status');
        }
      },
      error: () => {
        this.isLoading = false;
        this.presentToast('Network error');
      }
    });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    const muteKey = `channel_mute_${this.channelId}`;
    localStorage.setItem(muteKey, this.isMuted.toString());
    this.presentToast(this.isMuted ? 'Notifications muted' : 'Notifications enabled');
  }

  // Add these methods to your ChannelDetailPage class

  /**
   * Get human-readable role name from role_id
   */
  getRoleName(roleId: number): string {
    const roleMap: { [key: number]: string } = {
      1: 'Owner',
      2: 'Follower',
      3: 'Admin',
      
      // Add more role mappings as needed
    };
    return roleMap[roleId] || 'Member';
  }

  /**
   * View all followers in a modal or separate page
   */
  async viewAllFollowers() {
    // Option 1: Navigate to a dedicated followers page
    this.router.navigate(['/channel-followers'], {
      queryParams: { channelId: this.channelId }
    });

    // Option 2: Show in a modal (uncomment if preferred)
    /*
    const modal = await this.modalCtrl.create({
      component: FollowersModalComponent,
      componentProps: {
        channelId: this.channelId,
        followers: this.followers
      }
    });
    await modal.present();
    */
  }

  /**
   * View individual follower profile
   */
  viewFollowerProfile(userId: string) {
    this.router.navigate(['/profile'], {
      queryParams: { userId }
    });
  }

  /**
   * Enhanced loadFollowers with pagination support
   */
  loadFollowers(showAll: boolean = false) {
    if (!this.channelId) return;

    this.isLoadingFollowers = true;
    const limit = showAll ? 100 : 6; // Show 6 in preview, 100 when viewing all

    this.channelService.getChannelFollowers(this.channelId, { page: 1, limit })
      .subscribe({
        next: (res: any) => {
          this.isLoadingFollowers = false;
          if (res?.status && Array.isArray(res.followers)) {
            this.followers = res.followers;
          } else {
            this.followers = [];
          }
        },
        error: () => {
          this.isLoadingFollowers = false;
          this.presentToast("Failed to load followers");
        }
      });
  }


  async presentChannelOptions() {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Channel Options',
      buttons: [
        {
          text: this.isMuted ? 'Unmute Notifications' : 'Mute Notifications',
          icon: this.isMuted ? 'notifications' : 'notifications-off',
          handler: () => {
            this.toggleMute();
          }
        },
        {
          text: 'Share Channel',
          icon: 'share-social',
          handler: () => {
            this.shareChannel();
          }
        },
        {
          text: 'Report Channel',
          icon: 'flag',
          role: 'destructive',
          handler: () => {
            this.reportChannel();
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

  shareChannel() {

    this.presentToast('wip...');

    return;
    // Implement share functionality
    if (navigator.share) {
      navigator.share({
        title: this.channel?.channel_name,
        // text: this.channel?.description,
        url: window.location.href
      }).catch(() => {
        this.presentToast('Could not share channel');
      });
    } else {
      this.presentToast('Sharing not supported');
    }
  }

  async reportChannel() {
    const alert = await this.alertCtrl.create({
      header: 'Report Channel',
      message: 'Are you sure you want to report this channel?',
      inputs: [
        {
          name: 'reason',
          type: 'textarea',
          placeholder: 'Reason for reporting...'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Report',
          role: 'destructive',
          handler: (data) => {
            if (data.reason) {
              // Send report to backend
              this.presentToast('Channel reported');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  viewAllMedia() {
    // Navigate to media gallery
    this.presentToast('Opening media gallery...');
  }

  openPost(post: any) {
    console.log('Opening post:', post);
  }

  async presentToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }
}