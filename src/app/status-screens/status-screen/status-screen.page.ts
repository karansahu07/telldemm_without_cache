import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, PopoverController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { MenuPopoverComponent } from '../../components/menu-popover/menu-popover.component';
import { register } from 'swiper/element/bundle';
import { FooterTabsComponent } from 'src/app/components/footer-tabs/footer-tabs.component';
import { Channel, ChannelService } from 'src/app/pages/channels/services/channel';
import { AuthService } from 'src/app/auth/auth.service';
import { AddChannelModalComponent } from 'src/app/pages/channels/modals/add-channel-modal/add-channel-modal.component';
import { ChannelFirebaseSyncService } from 'src/app/pages/channels/services/firebasesyncchannel';

register();

@Component({
  selector: 'app-status-screen',
  templateUrl: './status-screen.page.html',
  styleUrls: ['./status-screen.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FooterTabsComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class StatusScreenPage implements OnInit, OnDestroy {
  isLoadingChannels = false;
  loadingChannelId: number | null = null;
  isRotated = false;

  myChannels: Channel[] = [];
  publicChannels: Channel[] = [];
  filteredChannels: Channel[] = [];

  // Source of truth: Set of channel IDs user is following
  private followedChannelIds = new Set<number>();

  userId: any = this.authService.authData?.userId || '';

  private firebaseListeners: any[] = [];

  constructor(
    private popoverCtrl: PopoverController,
    private router: Router,
    private channelService: ChannelService,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private modalCtrl: ModalController,
    private channelFirebase: ChannelFirebaseSyncService
  ) { }

  ngOnInit() {
    // Initial setup in ionViewDidEnter
  }

  ionViewWillEnter() {
    this.listenFromFirebase();   // UI data
    this.syncFromBackend();      // background refresh
  }

  ionViewWillLeave() {
    this.cleanupFirebaseListeners();
  }


  private listenFromFirebase() {

    this.channelFirebase.listenMyChannels(this.userId, channels => {
      this.myChannels = channels;
      this.followedChannelIds = new Set(
        channels.map(c => c.channel_id)
      );
      this.updateFilteredChannels();
    });

    this.channelFirebase.listenDiscoverChannels(this.userId, channels => {
      this.publicChannels = channels;
      this.updateFilteredChannels();
    });

  }


  ngOnDestroy() {
    this.cleanupFirebaseListeners();
  }

  private setupFirebaseListeners() {
    // 🔥 Listen to My Channels with full data (offline-first)
    this.channelFirebase.listenMyChannels(this.userId, (channels) => {
      console.log('📱 Firebase My Channels:', channels);
      this.myChannels = channels;
      this.followedChannelIds = new Set(channels.map(ch => ch.channel_id));
      this.updateFilteredChannels();
    });

    // 🔥 Listen to Discover Channels with full data (offline-first)
    this.channelFirebase.listenDiscoverChannels(this.userId, (channels) => {
      console.log('📱 Firebase Discover Channels:', channels);
      this.publicChannels = channels;
      this.updateFilteredChannels();
    });
  }

  private cleanupFirebaseListeners() {
    // Firebase listeners are cleaned up by the service's ngOnDestroy
    // But we can add additional cleanup here if needed
  }

  private refreshFromBackend() {
    // 🌐 Backend refresh (updates cache in background)
    this.loadUserChannels(this.userId);
    this.loadPublicChannels();
  }

  private syncFromBackend() {
    this.syncMyChannelsFromBackend();
    this.syncDiscoverChannelsFromBackend();
  }

  private syncMyChannelsFromBackend() {
    this.channelService
      .getUserChannels(this.userId, { role: 'all' })
      .subscribe({
        next: (res: any) => {
          if (res?.status && Array.isArray(res.channels)) {
            // 🔥 ONLY update Firebase
            this.channelFirebase.syncMyChannels(
              this.userId,
              res.channels
            );
          }
        },
        error: () => {
          // offline → ignore
        }
      });
  }

  private syncDiscoverChannelsFromBackend() {
    this.channelService
      .listChannels({ limit: 50 })
      .subscribe({
        next: (res: any) => {
          if (res?.status && Array.isArray(res.channels)) {
            // 🔥 ONLY update Firebase
            this.channelFirebase.syncDiscoverChannels(
              this.userId,
              res.channels
            );
          }
        },
        error: () => { }
      });
  }

  loadUserChannels(userId: number | string) {
    this.isLoadingChannels = true;
    this.channelService.getUserChannels(userId, { role: 'all' }).subscribe({
      next: (res: any) => {
        this.isLoadingChannels = false;

        if (res?.status && Array.isArray(res.channels)) {
          console.log('🌐 Backend My Channels:', res.channels);

          // Update local state
          // this.myChannels = res.channels;

          this.followedChannelIds = new Set(this.myChannels.map(ch => ch.channel_id));

          // 🔥 Sync to Firebase (updates cache)
          this.channelFirebase.syncMyChannels(this.userId, this.myChannels);
        } else {
          this.myChannels = [];
        }
      },
      error: (err) => {
        this.isLoadingChannels = false;
        console.error('❌ Failed to load channels from backend:', err);
        // Don't show error toast - we have cached data
        // this.presentToast('Failed to load your channels');
      }
    });
  }

  loadPublicChannels() {
    this.isLoadingChannels = true;
    this.channelService.listChannels({ limit: 50 }).subscribe({
      next: (res: any) => {
        this.isLoadingChannels = false;

        if (res?.status && Array.isArray(res.channels)) {
          console.log('🌐 Backend Public Channels:', res.channels);

          this.publicChannels = res.channels;
          this.updateFilteredChannels();
        } else {
          this.publicChannels = [];
        }
      },
      error: (err) => {
        this.isLoadingChannels = false;
        console.error('❌ Failed to load public channels from backend:', err);
        // Don't show error toast - we have cached data
        // this.presentToast('Failed to load discover channels');
      }
    });
  }

  private updateFilteredChannels() {
    this.filteredChannels = this.publicChannels.filter(
      ch => !this.followedChannelIds.has(ch.channel_id)
    );

    // 🔥 Sync discover list to Firebase
    this.channelFirebase.syncDiscoverChannels(
      this.userId,
      this.filteredChannels
    );
  }

  // --- Follow Status ---
  isFollowing(channel: Channel): boolean {
    return this.followedChannelIds.has(channel.channel_id);
  }

  // --- Follow/Unfollow with Loading & Optimistic Update ---
  onFollowClick(ev: Event, channel: Channel) {
    ev.stopPropagation();
    this.toggleFollow(channel);
  }

  toggleFollow(channel: Channel) {
    const wasFollowing = this.isFollowing(channel);

    // 1️⃣ Optimistic Firebase update
    if (wasFollowing) {
      this.channelFirebase.unfollowChannel(
        this.userId,
        channel.channel_id
      );
    } else {
      this.channelFirebase.followChannel(
        this.userId,
        channel
      );
    }

    // 2️⃣ Backend confirmation
    const req$ = wasFollowing
      ? this.channelService.unfollowChannel(channel.channel_id, this.userId)
      : this.channelService.followChannel(channel.channel_id, this.userId);

    req$.subscribe({
      error: () => {
        // 3️⃣ Revert Firebase on failure
        if (wasFollowing) {
          this.channelFirebase.followChannel(this.userId, channel);
        } else {
          this.channelFirebase.unfollowChannel(
            this.userId,
            channel.channel_id
          );
        }
      }
    });
  }




  private revertOptimisticUpdate(channel: Channel, channelId: number, wasFollowing: boolean) {
    const revertDelta = wasFollowing ? 1 : -1;

    channel.followers_count! += revertDelta;

    if (wasFollowing) {
      const discoveryMatch = this.publicChannels.find(ch => ch.channel_id === channelId);
      if (discoveryMatch) discoveryMatch.followers_count! += revertDelta;
    } else {
      const myMatch = this.myChannels.find(ch => ch.channel_id === channelId);
      if (myMatch) myMatch.followers_count! += revertDelta;
    }

    if (wasFollowing) {
      this.followedChannelIds.add(channelId);
    } else {
      this.followedChannelIds.delete(channelId);
    }
  }

  // --- Navigation & UI ---
  openChat(channel: Channel) {
    this.router.navigate(['/channel-feed'], {
      queryParams: { channelId: channel.channel_id }
    });
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
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000
    });
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
    if (data) {
      this.refreshFromBackend(); // Reload from backend
    }
  }
}