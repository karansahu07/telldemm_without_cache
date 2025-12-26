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
import { ChannelPouchDbService } from 'src/app/pages/channels/services/pouch-db';
// import { ChannelPouchDbService } from 'src/app/services/channel-pouch-db.service';

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

  constructor(
    private popoverCtrl: PopoverController,
    private router: Router,
    private channelService: ChannelService,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private modalCtrl: ModalController,
    private channelFirebase: ChannelFirebaseSyncService,
    private pouchDb: ChannelPouchDbService
  ) { }

  ngOnInit() {
    // Setup will happen in ionViewWillEnter
  }

  /* =========================
     LIFECYCLE - OFFLINE-FIRST STRATEGY
     ========================= */

  async ionViewWillEnter() {
    // 🔹 STEP 1: Load from PouchDB IMMEDIATELY (instant UI)
    await this.loadFromCache();

    // 🔹 STEP 2: Setup Firebase listeners (background sync)
    this.listenFromFirebase();

    // 🔹 STEP 3: Sync from backend (background refresh)
    this.syncFromBackend();
  }

  ionViewWillLeave() {
    this.cleanupFirebaseListeners();
  }

  ngOnDestroy() {
    this.cleanupFirebaseListeners();
  }

  /* =========================
     OFFLINE-FIRST DATA LOADING
     ========================= */

  /**
   * 🔹 Load from PouchDB cache FIRST (instant)
   */
  private async loadFromCache() {
    console.log('📱 Loading channels from PouchDB cache...');

    try {
      const [cachedMyChannels, cachedDiscoverChannels] = await Promise.all([
        this.pouchDb.getMyChannels(this.userId),
        this.pouchDb.getDiscoverChannels(this.userId)
      ]);

      if (cachedMyChannels.length > 0) {
        this.myChannels = cachedMyChannels;
        this.followedChannelIds = new Set(
          cachedMyChannels.map(c => c.channel_id)
        );
        console.log(`✅ Loaded ${cachedMyChannels.length} my channels from cache`);
      }

      if (cachedDiscoverChannels.length > 0) {
        this.publicChannels = cachedDiscoverChannels;
        this.updateFilteredChannels();
        console.log(`✅ Loaded ${cachedDiscoverChannels.length} discover channels from cache`);
      }

      if (cachedMyChannels.length === 0 && cachedDiscoverChannels.length === 0) {
        console.log('📭 No cached data, showing loading state');
        this.isLoadingChannels = true;
      }

    } catch (error) {
      console.error('❌ Failed to load from cache:', error);
      this.isLoadingChannels = true;
    }
  }

  /**
   * 🔥 Setup Firebase listeners (auto-updates UI when data changes)
   */
  private listenFromFirebase() {
    // Firebase listeners automatically cache to PouchDB
    this.channelFirebase.listenMyChannels(this.userId, channels => {
      console.log('🔥 Firebase update: My Channels');
      this.myChannels = channels;
      this.followedChannelIds = new Set(
        channels.map(c => c.channel_id)
      );
      this.updateFilteredChannels();
      this.isLoadingChannels = false;
    });

    this.channelFirebase.listenDiscoverChannels(this.userId, channels => {
      console.log('🔥 Firebase update: Discover Channels');
      this.publicChannels = channels;
      this.updateFilteredChannels();
      this.isLoadingChannels = false;
    });
  }

  /**
   * 🌐 Sync from backend API (background refresh)
   */
  private syncFromBackend() {
    if (!navigator.onLine) {
      console.log('📴 Offline: Skipping backend sync');
      return;
    }

    console.log('🌐 Syncing from backend...');
    this.syncMyChannelsFromBackend();
    this.syncDiscoverChannelsFromBackend();
  }

  private syncMyChannelsFromBackend() {
    this.channelService
      .getUserChannels(this.userId, { role: 'all' })
      .subscribe({
        next: (res: any) => {
          if (res?.status && Array.isArray(res.channels)) {
            console.log(`✅ Backend sync: ${res.channels.length} my channels`);
            // 🔥 Update Firebase (which auto-updates PouchDB)
            this.channelFirebase.syncMyChannels(
              this.userId,
              res.channels
            );
          }
        },
        error: (err) => {
          console.log('📴 Backend sync failed (offline or error):', err.message);
          // Ignore - we have cached data
        }
      });
  }

  private syncDiscoverChannelsFromBackend() {
    this.channelService
      .listChannels({ limit: 50 })
      .subscribe({
        next: (res: any) => {
          if (res?.status && Array.isArray(res.channels)) {
            console.log(`✅ Backend sync: ${res.channels.length} discover channels`);
            // 🔥 Update Firebase (which auto-updates PouchDB)
            this.channelFirebase.syncDiscoverChannels(
              this.userId,
              res.channels
            );
          }
        },
        error: (err) => {
          console.log('📴 Backend sync failed (offline or error):', err.message);
          // Ignore - we have cached data
        }
      });
  }

  /* =========================
     MANUAL REFRESH
     ========================= */

  async reload() {
    console.log('🔄 Manual reload triggered');
    
    // Show loading
    this.isLoadingChannels = true;

    // Load from cache first
    await this.loadFromCache();

    // Then sync from backend
    this.syncFromBackend();

    // Hide loading after brief delay
    setTimeout(() => {
      this.isLoadingChannels = false;
    }, 500);
  }

  /* =========================
     FOLLOW / UNFOLLOW (Optimistic Updates)
     ========================= */

  private updateFilteredChannels() {
    this.filteredChannels = this.publicChannels.filter(
      ch => !this.followedChannelIds.has(ch.channel_id)
    );
  }

  isFollowing(channel: Channel): boolean {
    return this.followedChannelIds.has(channel.channel_id);
  }

  onFollowClick(ev: Event, channel: Channel) {
    ev.stopPropagation();
    this.toggleFollow(channel);
  }

  toggleFollow(channel: Channel) {
    const wasFollowing = this.isFollowing(channel);

    // 1️⃣ Optimistic UI update
    if (wasFollowing) {
      // Remove from my channels
      this.myChannels = this.myChannels.filter(
        ch => ch.channel_id !== channel.channel_id
      );
      this.followedChannelIds.delete(channel.channel_id);

      // Add to discover
      if (!this.publicChannels.find(ch => ch.channel_id === channel.channel_id)) {
        this.publicChannels.push(channel);
      }
    } else {
      // Add to my channels
      this.myChannels.push(channel);
      this.followedChannelIds.add(channel.channel_id);

      // Remove from discover
      this.publicChannels = this.publicChannels.filter(
        ch => ch.channel_id !== channel.channel_id
      );
    }

    this.updateFilteredChannels();

    // 2️⃣ Update Firebase + PouchDB (with offline queue)
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

    // 3️⃣ Backend confirmation
    const req$ = wasFollowing
      ? this.channelService.unfollowChannel(channel.channel_id, this.userId)
      : this.channelService.followChannel(channel.channel_id, this.userId);

    req$.subscribe({
      next: () => {
        console.log(`✅ Backend confirmed ${wasFollowing ? 'unfollow' : 'follow'}`);
        this.presentToast(
          wasFollowing 
            ? `Unfollowed ${channel.channel_name}` 
            : `Following ${channel.channel_name}`
        );
      },
      error: (err) => {
        console.error('❌ Backend operation failed, reverting:', err);
        
        // 4️⃣ Revert optimistic update on failure
        this.revertOptimisticUpdate(channel, wasFollowing);

        // 5️⃣ Revert Firebase
        if (wasFollowing) {
          this.channelFirebase.followChannel(this.userId, channel);
        } else {
          this.channelFirebase.unfollowChannel(
            this.userId,
            channel.channel_id
          );
        }

        this.presentToast(
          `Failed to ${wasFollowing ? 'unfollow' : 'follow'} channel. ${navigator.onLine ? 'Try again.' : 'Will retry when online.'}`
        );
      }
    });
  }

  private revertOptimisticUpdate(channel: Channel, wasFollowing: boolean) {
    if (wasFollowing) {
      // Was following, put it back in my channels
      this.myChannels.push(channel);
      this.followedChannelIds.add(channel.channel_id);
      this.publicChannels = this.publicChannels.filter(
        ch => ch.channel_id !== channel.channel_id
      );
    } else {
      // Was not following, remove from my channels
      this.myChannels = this.myChannels.filter(
        ch => ch.channel_id !== channel.channel_id
      );
      this.followedChannelIds.delete(channel.channel_id);
      if (!this.publicChannels.find(ch => ch.channel_id === channel.channel_id)) {
        this.publicChannels.push(channel);
      }
    }

    this.updateFilteredChannels();
  }

  /* =========================
     NAVIGATION & UI
     ========================= */

  openChat(channel: Channel) {
    this.router.navigate(['/channel-feed'], {
      queryParams: { channelId: channel.channel_id }
    });
  }

  goToChannels() {
    this.router.navigate(['/channels']);
  }

  opendummy() {
    this.router.navigate(['/channel-feed'], {
      queryParams: { channelId: 33 }
    });
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
      duration: 2000,
      position: 'bottom'
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
      // Reload from backend
      this.syncFromBackend();
    }
  }

  private cleanupFirebaseListeners() {
    // Firebase listeners are cleaned up by the service's ngOnDestroy
  }
}