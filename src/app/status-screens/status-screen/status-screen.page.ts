import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, PopoverController, LoadingController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { MenuPopoverComponent } from '../../components/menu-popover/menu-popover.component';
import { register } from 'swiper/element/bundle';
import { FooterTabsComponent } from 'src/app/components/footer-tabs/footer-tabs.component';
import { Channel, ChannelService } from 'src/app/pages/channels/services/channel';
register();

@Component({
  selector: 'app-status-screen',
  templateUrl: './status-screen.page.html',
  styleUrls: ['./status-screen.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FooterTabsComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class StatusScreenPage implements OnInit {
  // UI state
  isLoadingChannels = false;

  // Data stores
  myChannels: Channel[] = [];      // channels returned by GET /channels/user/:userId
  publicChannels: Channel[] = [];  // discovery / public channels

  followedMap: Record<number, boolean> = {}; // channel_id -> isFollowing
  selectedFilter = 'all';
  isRotated = false;

  // demo chats kept as-is
  chatList = [
    { name: 'Bob', message: 'How are you?', unread: true, time: '11:00 AM', unreadCount: 0, group: false },
    { name: 'Alice', message: 'Hello', unread: false, time: '10:00 AM', unreadCount: 0, group: false },
  ];

  slideOpts = {
    slidesPerView: 'auto',
    spaceBetween: 5
  };

  // Replace with real authenticated user id when available
  userId: number = 76;

  constructor(
    private popoverCtrl: PopoverController,
    private router: Router,
    private channelService: ChannelService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.loadUserChannels(this.userId);
    this.loadPublicChannels();
  }

  /* -------------------------
     Load user's channels (admin + follower)
  --------------------------*/
  loadUserChannels(userId: number | string, page = 1, limit = 50): void {
    this.isLoadingChannels = true;

    this.channelService.getUserChannels(userId, { role: 'all', page, limit }).subscribe({
      next: (res: any) => {
        this.isLoadingChannels = false;
        if (res && res.status && Array.isArray(res.channels)) {
          this.myChannels = res.channels;
          // mark them as followed/owned in the followedMap
          this.myChannels.forEach((ch: Channel) => {
            // if backend returns is_following or role_id, use that; otherwise assume true for returned user channels
            const isFollowing = !!((ch as any).is_following) || !!ch.role_id || true;
            this.followedMap[ch.channel_id] = isFollowing;
          });
        } else {
          this.myChannels = [];
          this.presentToast(res?.message || 'No channels found for this user');
        }
      },
      error: (err: any) => {
        this.isLoadingChannels = false;
        console.error('getUserChannels error', err);
        this.presentToast(err?.message || 'Error loading user channels');
      }
    });
  }

  /* -------------------------
     Load public channels for discovery
  --------------------------*/
  loadPublicChannels(page = 1, limit = 20): void {
    this.isLoadingChannels = true;

    this.channelService.listChannels({ page, limit }).subscribe({
      next: (res: any) => {
        this.isLoadingChannels = false;
        if (res && res.status && Array.isArray(res.channels)) {
          this.publicChannels = res.channels;
          // merge any is_following flags into followedMap if available
          this.publicChannels.forEach((ch: Channel) => {
            if ((ch as any).is_following) {
              this.followedMap[ch.channel_id] = true;
            } else if (this.followedMap[ch.channel_id] === undefined) {
              this.followedMap[ch.channel_id] = false;
            }
          });
        } else {
          this.publicChannels = [];
        }
      },
      error: (err: any) => {
        this.isLoadingChannels = false;
        console.error('listChannels error', err);
        this.presentToast(err?.message || 'Error loading channels');
      }
    });
  }

  /* -------------------------
     Follow / Unfollow helpers
  --------------------------*/
  isFollowing(channel: Channel): boolean {
    return !!this.followedMap[channel.channel_id];
  }

  onFollowClick(ev: Event, channel: Channel): void {
    ev.stopPropagation();
    this.toggleFollow(channel);
  }

  toggleFollow(channel: Channel): void {
    if (this.isFollowing(channel)) {
      this.unfollow(channel);
    } else {
      this.follow(channel);
    }
  }

  follow(channel: Channel): void {
    // optimistic UI
    this.followedMap[channel.channel_id] = true;
    if (typeof channel.followers_count === 'number') {
      channel.followers_count = (channel.followers_count || 0) + 1;
    }

    this.channelService.followChannel(channel.channel_id, this.userId).subscribe({
      next: (res: any) => {
        if (!res || !res.status) {
          // revert if backend indicates failure
          this.followedMap[channel.channel_id] = false;
          if (typeof channel.followers_count === 'number') {
            channel.followers_count = Math.max(0, (channel.followers_count || 1) - 1);
          }
          this.presentToast(res?.message || 'Failed to follow');
        } else {
          this.presentToast('Followed channel');
          // refresh user's channels
          this.loadUserChannels(this.userId);
        }
      },
      error: (err: any) => {
        console.error('Follow error', err);
        // revert
        this.followedMap[channel.channel_id] = false;
        if (typeof channel.followers_count === 'number') {
          channel.followers_count = Math.max(0, (channel.followers_count || 1) - 1);
        }
        this.presentToast(err?.message || 'Error following channel');
      }
    });
  }

  unfollow(channel: Channel): void {
    // optimistic UI
    this.followedMap[channel.channel_id] = false;
    if (typeof channel.followers_count === 'number') {
      channel.followers_count = Math.max(0, (channel.followers_count || 1) - 1);
    }

    this.channelService.unfollowChannel(channel.channel_id, this.userId).subscribe({
      next: (res: any) => {
        if (!res || !res.status) {
          // revert if backend indicates failure
          this.followedMap[channel.channel_id] = true;
          if (typeof channel.followers_count === 'number') {
            channel.followers_count = (channel.followers_count || 0) + 1;
          }
          this.presentToast(res?.message || 'Failed to unfollow');
        } else {
          this.presentToast('Unfollowed channel');
          // refresh user's channels
          this.loadUserChannels(this.userId);
        }
      },
      error: (err: any) => {
        console.error('Unfollow error', err);
        // revert
        this.followedMap[channel.channel_id] = true;
        if (typeof channel.followers_count === 'number') {
          channel.followers_count = (channel.followers_count || 0) + 1;
        }
        this.presentToast(err?.message || 'Error unfollowing channel');
      }
    });
  }

  /* -------------------------
     Filters / UI helpers
  --------------------------*/
  get filteredchannels(): Channel[] {
    // show publicChannels for discovery, apply filters if needed
    if (this.selectedFilter === 'read') {
      return this.publicChannels.filter(c => !((c as any).unread));
    } else if (this.selectedFilter === 'unread') {
      return this.publicChannels.filter(c => !!((c as any).unread));
    } else if (this.selectedFilter === 'groups') {
      return this.publicChannels.filter(c => !!((c as any).group));
    } else {
      return this.publicChannels;
    }
  }

  setFilter(filter: string): void {
    this.selectedFilter = filter;
  }

  get filteredChats() {
    if (this.selectedFilter === 'read') {
      return this.chatList.filter(chat => !chat.unread);
    } else if (this.selectedFilter === 'unread') {
      return this.chatList.filter(chat => chat.unread);
    } else if (this.selectedFilter === 'groups') {
      return this.chatList.filter(chat => chat.group);
    } else {
      return this.chatList; // 'all'
    }
  }

  get totalUnreadUpdates(): number {
    return this.chatList.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
  }

  openChat(chat: any): void {
    this.router.navigate(['/chatting-screen']);
  }

  async presentPopover(ev: any): Promise<void> {
    const popover = await this.popoverCtrl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();
  }

  toggleIcon(): void {
    this.isRotated = !this.isRotated;
  }

  goToChannels(): void {
    this.router.navigate(['/channels']);
  }

  /* -------------------------
     small helpers
  --------------------------*/
  async presentToast(msg: string): Promise<void> {
    const t = await this.toastCtrl.create({ message: msg, duration: 2000 });
    await t.present();
  }
}
