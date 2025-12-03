import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, PopoverController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { MenuPopoverComponent } from '../../components/menu-popover/menu-popover.component';
import { register } from 'swiper/element/bundle';
import { FooterTabsComponent } from 'src/app/components/footer-tabs/footer-tabs.component';
import { Channel, ChannelService } from 'src/app/pages/channels/services/channel';
import { AuthService } from 'src/app/auth/auth.service';
import { AddChannelModalComponent } from 'src/app/pages/channels/modals/add-channel-modal/add-channel-modal.component';

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
  isLoadingChannels = false;
  loadingChannelId: number | null = null;
  isRotated = false;

  myChannels: Channel[] = [];
  publicChannels: Channel[] = [];

  // Source of truth: Set of channel IDs user is following
  private followedChannelIds = new Set<number>();

  userId: any = this.authService.authData?.userId || '';; // Replace with real auth user ID later

  constructor(
    private popoverCtrl: PopoverController,
    private router: Router,
    private channelService: ChannelService,
    private toastCtrl: ToastController,
    private authService:AuthService,
    private modalCtrl: ModalController
  ) {}

  ngOnInit() {
    this.loadUserChannels(this.userId);
    this.loadPublicChannels();
  }

  loadUserChannels(userId: number | string) {
    this.isLoadingChannels = true;
    this.channelService.getUserChannels(userId, { role: 'all' }).subscribe({
      next: (res: any) => {
        this.isLoadingChannels = false;
        if (res?.status && Array.isArray(res.channels)) {
          this.myChannels = res.channels;
          this.followedChannelIds = new Set(this.myChannels.map(ch => ch.channel_id));
        } else {
          this.myChannels = [];
        }
      },
      error: () => {
        this.isLoadingChannels = false;
        this.presentToast('Failed to load your channels');
      }
    });
  }

  loadPublicChannels() {
    this.isLoadingChannels = true;
    this.channelService.listChannels({ limit: 50 }).subscribe({
      next: (res: any) => {
        this.isLoadingChannels = false;
        if (res?.status && Array.isArray(res.channels)) {
          this.publicChannels = res.channels;
        } else {
          this.publicChannels = [];
        }
      },
      error: () => {
        this.isLoadingChannels = false;
        this.presentToast('Failed to load discover channels');
      }
    });
  }

  // --- Follow Status ---
  isFollowing(channel: Channel): boolean {
    return this.followedChannelIds.has(channel.channel_id);
  }

  get filteredchannels(): Channel[] {
    return this.publicChannels.filter(ch => !this.followedChannelIds.has(ch.channel_id));
  }

  // --- Follow/Unfollow with Loading & Optimistic Update ---
  onFollowClick(ev: Event, channel: Channel) {
    ev.stopPropagation();
    this.toggleFollow(channel);
  }

toggleFollow(channel: Channel) {
  if (this.loadingChannelId !== null) return;

  const channelId = channel.channel_id;
  const wasFollowing = this.isFollowing(channel);
  this.loadingChannelId = channelId;

  // ───── 1. Optimistic Update (Instant UI) ─────
  const delta = wasFollowing ? -1 : 1;

  // Update the channel that was clicked
  channel.followers_count = (channel.followers_count ?? 0) + delta;

  // Update the SAME channel in the OTHER list (critical!)
  if (wasFollowing) {
    // Unfollowing → update discovery list version
    const discoveryMatch = this.publicChannels.find(ch => ch.channel_id === channelId);
    if (discoveryMatch) discoveryMatch.followers_count! += delta;
  } else {
    // Following → update myChannels version (if exists)
    const myMatch = this.myChannels.find(ch => ch.channel_id === channelId);
    if (myMatch) myMatch.followers_count! += delta;
  }

  // Update follow state
  if (wasFollowing) {
    this.followedChannelIds.delete(channelId);
  } else {
    this.followedChannelIds.add(channelId);
  }

  // ───── 2. API Call ─────
  const action$ = wasFollowing
    ? this.channelService.unfollowChannel(channelId, this.userId)
    : this.channelService.followChannel(channelId, this.userId);

  action$.subscribe({
    next: (res: any) => {
      this.loadingChannelId = null;

      if (!res?.status) {
        // Revert everything on failure
        const revertDelta = wasFollowing ? 1 : -1;
        channel.followers_count! += revertDelta;

        if (wasFollowing) {
          const discoveryMatch = this.publicChannels.find(ch => ch.channel_id === channelId);
          if (discoveryMatch) discoveryMatch.followers_count! += revertDelta;
        } else {
          const myMatch = this.myChannels.find(ch => ch.channel_id === channelId);
          if (myMatch) myMatch.followers_count! += revertDelta;
        }

        if (wasFollowing) this.followedChannelIds.add(channelId);
        else this.followedChannelIds.delete(channelId);

        this.presentToast(res?.message || 'Failed. Try again');
      } else {
        // Success → move channel between lists
        if (!wasFollowing) {
          // Now following → add to My Channels
          if (!this.myChannels.find(ch => ch.channel_id === channelId)) {
            this.myChannels.unshift({ ...channel });
          }
        } else {
          // Unfollowed → remove from My Channels
          this.myChannels = this.myChannels.filter(ch => ch.channel_id !== channelId);
        }
      }
    },
    error: () => {
      this.loadingChannelId = null;
      // Revert all changes
      const revertDelta = wasFollowing ? 1 : -1;
      channel.followers_count! += revertDelta;

      const discoveryMatch = this.publicChannels.find(ch => ch.channel_id === channelId);
      if (discoveryMatch) discoveryMatch.followers_count! += revertDelta;

      const myMatch = this.myChannels.find(ch => ch.channel_id === channelId);
      if (myMatch) myMatch.followers_count! += revertDelta;

      if (wasFollowing) this.followedChannelIds.add(channelId);
      else this.followedChannelIds.delete(channelId);

      this.presentToast('No internet');
    }
  });
}

  private revert(channel: Channel, wasFollowing: boolean) {
    const delta = wasFollowing ? 1 : -1;
    if (wasFollowing) {
      this.followedChannelIds.add(channel.channel_id);
    } else {
      this.followedChannelIds.delete(channel.channel_id);
    }
    channel.followers_count! += delta;
  }

  // --- Navigation & UI ---
  openChat(channel: Channel) {
    this.router.navigate(['/channel-detail'], { queryParams: { channelId: channel.channel_id } });
  }

  goToChannels() {
    this.router.navigate(['/channels']);
  }

  async presentPopover(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();
  }

  async presentToast(msg: string) {
    const toast = await this.toastCtrl.create({ message: msg, duration: 2000 });
    await toast.present();
  }

  get totalUnreadUpdates(): number {
    return 0; // Update if you have real unread logic
  }

  async openAddChannelModal() {
      const modal = await this.modalCtrl.create({
        component: AddChannelModalComponent
      });
      await modal.present();
  
      const { data } = await modal.onDidDismiss();
      if (data) this.loadUserChannels(this.userId); // only reload if created
    }
}