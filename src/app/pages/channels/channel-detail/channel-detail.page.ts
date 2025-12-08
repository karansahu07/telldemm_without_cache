import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { IonicModule, ToastController, ActionSheetController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ChannelService, Channel, ChannelDetails } from 'src/app/pages/channels/services/channel';
import { AuthService } from 'src/app/auth/auth.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';

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

  // Whether we are showing only preview (first 6) or full list
  showAllFollowers = false;

  // Media slider
  mediaItems: any[] = [];

  // Stats
  stats = {
    posts: 0,
    followers: 0,
    engagement: 0
  };

  // Followers pagination
  followersPage = 1;
  followersLimit = 60; // page size from backend
  hasMoreFollowers = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private channelService: ChannelService,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    private firebaseChatService:FirebaseChatService
  ) {
    this.userId = this.authService.authData?.userId || '';
  }

  ngOnInit() {
    // this.initializeApp();
  }

  ionViewDidEnter() {
    this.initializeApp();
  }

  initializeApp() {
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

  // Toggle between grid and list view
  toggleFollowersView(mode: 'grid' | 'list') {
    this.followersViewMode = mode;
    localStorage.setItem('followers_view_mode', mode);
  }

  loadChannelDetails() {
    this.isLoadingChannel = true;
    this.errorMessage = null;

    this.channelService.getChannelDetails(this.channelId!).subscribe({
      next: (res) => {
        this.isLoadingChannel = false;
        if (res?.status && res.channel) {
          this.channel = res.channel;
          console.log('channels all', this.channel);

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

          // Media items
          this.generateMediaItems();

          // Load extra UI data
          this.loadFollowStatus();
          this.loadChannelPosts();

          // If current user is the owner/creator, auto-load followers preview
          if (this.isChannelOwner()) {
            this.loadFollowers(true); // reset & load first page (preview uses first 6)
          }
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
    this.mediaItems = [
      { type: 'image', url: this.channel?.channel_dp || 'assets/images/user.jfif' }
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
    const muteKey = `channel_mute_${this.channelId}`;
    this.isMuted = localStorage.getItem(muteKey) === 'true';
  }

  loadChannelPosts() {
    // Placeholder: Fetch posts for the channel
    this.channelPosts = [];
  }

  /**
   * Check if current user is channel owner/creator
   * Uses role_id === 1 OR created_by / creator_id match
   */
  isChannelOwner(): boolean {
    if (!this.channel || !this.userId) return false;

    // If API sends role_id for current user
    if (typeof (this.channel as any).role_id === 'number') {
      if ((this.channel as any).role_id === 1) {
        return true; // 1 = Owner
      }
    }

    // Fallback: compare created_by / creator_id
    const createdBy = (this.channel as any).created_by || (this.channel as any).creator_id;
    if (createdBy != null) {
      return String(createdBy) === String(this.userId);
    }

    return false;
  }

  /**
   * Toggle follow state.
   * - If not owner & not following -> follow directly
   * - If not owner & already following -> show confirm alert before unfollow
   */
  toggleFollow() {
    if (!this.channel || this.isLoading || !this.userId) return;

    // Owner should never see this, but just in case
    if (this.isChannelOwner()) {
      return;
    }

    if (this.isFollowing) {
      // Already following -> confirm unfollow
      this.confirmUnfollow();
    } else {
      // Not following -> follow
      this.updateFollowStatus(false);
    }
  }

  /**
   * Perform follow / unfollow API call
   * @param isCurrentlyFollowing true if user is currently following (do unfollow), false to follow
   */
  private updateFollowStatus(isCurrentlyFollowing: boolean) {
    if (!this.channel || !this.userId) return;

    this.isLoading = true;

    const action$ = isCurrentlyFollowing
      ? this.channelService.unfollowChannel(this.channel.channel_id, this.userId)
      : this.channelService.followChannel(this.channel.channel_id, this.userId);

    action$.subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (res?.status) {
          // Toggle local state
          this.isFollowing = !isCurrentlyFollowing;

          // Update followers count
          const diff = this.isFollowing ? 1 : -1;
          this.channel!.followers_count = (this.channel!.followers_count || 0) + diff;
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

  /**
   * Confirm before unfollowing the channel
   */
  private async confirmUnfollow() {
    const alert = await this.alertCtrl.create({
      header: 'Unfollow Channel',
      message: 'Are you sure you want to unfollow this channel?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Unfollow',
          role: 'destructive',
          handler: () => {
            this.updateFollowStatus(true);
          }
        }
      ]
    });

    await alert.present();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    const muteKey = `channel_mute_${this.channelId}`;
    localStorage.setItem(muteKey, this.isMuted.toString());
    this.presentToast(this.isMuted ? 'Notifications muted' : 'Notifications enabled');
  }

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
   * Followers API with pagination.
   * - reset = true: clear list and start from page 1 (used on first load / refresh)
   * - Uses this.followersPage & this.followersLimit
   */
  loadFollowers(reset: boolean = false) {
    if (!this.channelId) return;

    // If not a reset and we already know there are no more pages → stop
    if (!reset && !this.hasMoreFollowers) {
      return;
    }

    if (reset) {
      this.followersPage = 1;
      this.followers = [];
      this.hasMoreFollowers = true;
      this.showAllFollowers = false; // go back to preview mode
    }

    this.isLoadingFollowers = true;

    const page = this.followersPage;
    const limit = this.followersLimit;

    this.channelService.getChannelFollowers(this.channelId, { page, limit })
      .subscribe({
        next: (res: any) => {
          this.isLoadingFollowers = false;

          if (res?.status && Array.isArray(res.followers)) {
            // Append new page to existing list
            this.followers = [...this.followers, ...res.followers];

            // If received less than limit → we've reached the end
            if (res.followers.length < limit) {
              this.hasMoreFollowers = false;
            }
          } else {
            this.hasMoreFollowers = false;
          }
        },
        error: () => {
          this.isLoadingFollowers = false;
          this.presentToast('Failed to load followers');
        }
      });
  }

  /**
   * Handles "View All Followers" / "Load more" button:
   * - First click turns on full list mode (showAllFollowers = true)
   * - Subsequent clicks load next page if hasMoreFollowers is true
   */
  viewAllFollowers() {
    // First click: just toggle to "show all" mode
    if (!this.showAllFollowers) {
      this.showAllFollowers = true;
      return;
    }

    // Already in "all" mode → load next page if available
    if (this.hasMoreFollowers && !this.isLoadingFollowers) {
      this.followersPage++;
      this.loadFollowers();
    }
  }

   /**
   * View individual follower profile
   */
viewFollowerProfile(userId: string) {
   this.presentToast(`wip`);
  // this.router.navigate(['/profile-screen'], {
  //   queryParams: { receiverId: userId }
  // });
}

 async messageUser(user: any) {
 this.presentToast(`wip`);
  // const userID = user.user_id;
 
  // await this.firebaseChatService.openChat(
  //     { receiver: { userId: userID } },
  //     true
  //   );
 
  // this.router.navigate(['/chatting-screen'], {
  //   queryParams: { receiverId: user.user_id }
  // });
}


//  async messageMember(member: any) {
//     const senderId = this.authService.authData?.userId || '';
//     const receiverId = member.user_id;

//     if (!senderId || !receiverId) {
//       alert('Missing sender or receiver ID');
//       return;
//     }

//     // const roomId = senderId < receiverId ? `${senderId}_${receiverId}` : `${receiverId}_${senderId}`;
//     // const receiverPhone = member.phone_number || member.phone;

//     // await this.firebaseChatService.openChat(chat);

//     await this.firebaseChatService.openChat(
//       { receiver: { userId: receiverId } },
//       true
//     );

//     this.router.navigate(['/chatting-screen'], {
//       queryParams: {
//         receiverId: receiverId,
//       }
//     });
//   }
  async openFollowerActions(user: any) {
  const actionSheet = await this.actionSheetCtrl.create({
    header: user?.name || 'Follower',
    buttons: [
      {
        text: 'View user',
        icon: 'person-circle',
        handler: () => {
          this.viewFollowerProfile(user.user_id);
        }
      },
      {
        text: 'Message user',
        icon: 'chatbubbles',
        handler: () => {
          this.messageUser(user);
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




  // Placeholder for future extra actions
  moreFollowerActions(user: any) {
    // You can open another action sheet / modal later
    this.presentToast(`More options for ${user?.name || 'user'} (WIP)`);
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
