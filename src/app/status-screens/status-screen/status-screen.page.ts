import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, PopoverController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { MenuPopoverComponent } from '../../components/menu-popover/menu-popover.component';
import { register } from 'swiper/element/bundle';
import { FooterTabsComponent } from 'src/app/components/footer-tabs/footer-tabs.component';
import { Channel, ChannelService } from 'src/app/pages/channels/services/channel';
import { AuthService } from 'src/app/auth/auth.service';
import { AddChannelModalComponent } from 'src/app/pages/channels/modals/add-channel-modal/add-channel-modal.component';
import { ChannelPouchDbService } from 'src/app/pages/channels/services/pouch-db';
import { ChannelUiStateService } from 'src/app/pages/channels/services/channel-ui-state';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Subscription, interval } from 'rxjs';

register();

@Component({
  selector: 'app-status-screen',
  templateUrl: './status-screen.page.html',
  styleUrls: ['./status-screen.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FooterTabsComponent, ScrollingModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatusScreenPage implements OnInit, OnDestroy {
  isLoadingChannels = false;
  loadingChannelId: number | null = null;
  isRotated = false;

  myChannels: Channel[] = [];
  publicChannels: Channel[] = [];
  filteredChannels: Channel[] = [];

  private followedChannelIds = new Set<number>();
  userId: any = this.authService.authData?.userId || '';

  // 🚀 Batch update mechanism
  private updateScheduled = false;
  private pendingUpdates: (() => void)[] = [];

  // Polling subscription for real-time-ish updates
  private pollSubscription?: Subscription;

  constructor(
    private popoverCtrl: PopoverController,
    private router: Router,
    private channelService: ChannelService,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private modalCtrl: ModalController,
    private pouchDb: ChannelPouchDbService,
    private channelUiState: ChannelUiStateService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) { }

  ngOnInit() {
    this.channelUiState.isLoading$.subscribe(v => {
      this.isLoadingChannels = v;
      this.cdr.markForCheck();
    });
  }

  /* =========================
     BATCH UPDATE MECHANISM
     ========================= */

  private scheduleUpdate(updateFn: () => void) {
    this.pendingUpdates.push(updateFn);

    if (!this.updateScheduled) {
      this.updateScheduled = true;
      
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          this.ngZone.run(() => {
            this.pendingUpdates.forEach(fn => fn());
            this.pendingUpdates = [];
            this.updateScheduled = false;
            this.cdr.detectChanges();
          });
        });
      });
    }
  }

  /* =========================
     LIFECYCLE - SIMPLIFIED OFFLINE-FIRST
     ========================= */

  async ionViewWillEnter() {
    if (!this.channelUiState.hasLoadedOnce()) {
      this.channelUiState.startInitialLoad();
    }

    // Load from cache immediately
    await this.loadFromCache();

    this.channelUiState.finishInitialLoad();

    // Start background sync
    this.syncFromBackend();
    
    // Start polling for updates (every 30 seconds when online)
    this.startPolling();
    
    this.cdr.reattach();
  }

  ionViewWillLeave() {
    this.stopPolling();
    this.cdr.detach();
  }

  ngOnDestroy() {
    this.stopPolling();
    this.cdr.detach();
  }

  /* =========================
     POLLING FOR UPDATES
     ========================= */

  private startPolling() {
    // Poll every 30 seconds if online
    this.pollSubscription = interval(30000).subscribe(() => {
      if (navigator.onLine) {
        console.log('🔄 Polling for updates...');
        this.syncFromBackend();
      }
    });
  }

  private stopPolling() {
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
      this.pollSubscription = undefined;
    }
  }

  /* =========================
     OFFLINE-FIRST DATA LOADING
     ========================= */

  private firstLoadDone = false;

  private async loadFromCache() {
    // Load data outside Angular zone for better performance
    const [cachedMyChannels, cachedDiscoverChannels] = await this.ngZone.runOutsideAngular(async () => {
      return await Promise.all([
        this.pouchDb.getMyChannels(this.userId),
        this.pouchDb.getDiscoverChannels(this.userId)
      ]);
    });

    // Update UI in batches
    this.scheduleUpdate(() => {
      if (this.myChannels.length === 0 && cachedMyChannels.length > 0) {
        this.myChannels = cachedMyChannels;
        this.followedChannelIds = new Set(cachedMyChannels.map(c => c.channel_id));
      }

      if (this.publicChannels.length === 0 && cachedDiscoverChannels.length > 0) {
        this.publicChannels = cachedDiscoverChannels;
      }
    });

    this.updateFilteredChannelsInPlace();
    this.firstLoadDone = true;
  }

  trackByChannelId(index: number, channel: Channel) {
    return channel.channel_id;
  }

  /* =========================
     IN-PLACE ARRAY PATCHING
     ========================= */

  private patchChannelsInPlace(target: Channel[], incoming: Channel[]) {
    this.scheduleUpdate(() => {
      const incomingMap = new Map(incoming.map(c => [c.channel_id, c]));
      const incomingIds = new Set(incoming.map(c => c.channel_id));

      // Update existing items in-place
      for (let i = 0; i < target.length; i++) {
        const existingChannel = target[i];
        const incomingChannel = incomingMap.get(existingChannel.channel_id);
        
        if (incomingChannel) {
          Object.assign(existingChannel, incomingChannel);
        }
      }

      // Remove items not in incoming
      for (let i = target.length - 1; i >= 0; i--) {
        if (!incomingIds.has(target[i].channel_id)) {
          target.splice(i, 1);
        }
      }

      // Add new items
      const existingIds = new Set(target.map(c => c.channel_id));
      for (const channel of incoming) {
        if (!existingIds.has(channel.channel_id)) {
          target.push(channel);
        }
      }
    });
  }

  /* =========================
     BACKEND SYNC (Direct)
     ========================= */

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
        next: async (res: any) => {
          if (res?.status && Array.isArray(res.channels)) {
            console.log(`✅ Backend sync: ${res.channels.length} my channels`);
            
            // Update UI immediately
            this.patchChannelsInPlace(this.myChannels, res.channels);
            
            // Update followed IDs
            this.scheduleUpdate(() => {
              this.followedChannelIds = new Set(res.channels.map((c: Channel) => c.channel_id));
            });
            
            this.updateFilteredChannelsInPlace();
            
            // Save to PouchDB for offline access
            await this.pouchDb.saveMyChannels(this.userId, res.channels);
          }
        },
        error: (err) => {
          console.log('📴 Backend sync failed (offline or error):', err.message);
        }
      });
  }

  private syncDiscoverChannelsFromBackend() {
    this.channelService
      .listChannels({ limit: 50 })
      .subscribe({
        next: async (res: any) => {
          if (res?.status && Array.isArray(res.channels)) {
            console.log(`✅ Backend sync: ${res.channels.length} discover channels`);
            
            // Update UI immediately
            this.patchChannelsInPlace(this.publicChannels, res.channels);
            this.updateFilteredChannelsInPlace();
            
            // Save to PouchDB for offline access
            await this.pouchDb.saveDiscoverChannels(this.userId, res.channels);
          }
        },
        error: (err) => {
          console.log('📴 Backend sync failed (offline or error):', err.message);
        }
      });
  }

  /* =========================
     MANUAL REFRESH
     ========================= */

  async reload() {
    await this.loadFromCache();
    this.syncFromBackend();
  }

  /* =========================
     FILTERED CHANNELS UPDATE
     ========================= */

  private updateFilteredChannelsInPlace() {
    this.scheduleUpdate(() => {
      const shouldBeFiltered = this.publicChannels.filter(
        ch => !this.followedChannelIds.has(ch.channel_id)
      );

      const shouldBeFilteredIds = new Set(shouldBeFiltered.map(c => c.channel_id));

      // Remove channels that shouldn't be there
      for (let i = this.filteredChannels.length - 1; i >= 0; i--) {
        if (!shouldBeFilteredIds.has(this.filteredChannels[i].channel_id)) {
          this.filteredChannels.splice(i, 1);
        }
      }

      // Add new channels
      const existingIds = new Set(this.filteredChannels.map(c => c.channel_id));
      for (const channel of shouldBeFiltered) {
        if (!existingIds.has(channel.channel_id)) {
          this.filteredChannels.push(channel);
        }
      }

      // Update existing channels
      const channelMap = new Map(shouldBeFiltered.map(c => [c.channel_id, c]));
      for (const filtered of this.filteredChannels) {
        const updated = channelMap.get(filtered.channel_id);
        if (updated) {
          Object.assign(filtered, updated);
        }
      }
    });
  }

  /* =========================
     FOLLOW / UNFOLLOW (Optimistic)
     ========================= */

  isFollowing(channel: Channel): boolean {
    return this.followedChannelIds.has(channel.channel_id);
  }

  onFollowClick(ev: Event, channel: Channel) {
    ev.stopPropagation();
    this.toggleFollow(channel);
  }

  async toggleFollow(channel: Channel) {
    const wasFollowing = this.isFollowing(channel);

    // 1️⃣ Optimistic UI update
    if (wasFollowing) {
      const idx = this.myChannels.findIndex(ch => ch.channel_id === channel.channel_id);
      if (idx !== -1) {
        this.myChannels.splice(idx, 1);
      }
      this.followedChannelIds.delete(channel.channel_id);

      if (!this.publicChannels.find(ch => ch.channel_id === channel.channel_id)) {
        this.publicChannels.push(channel);
      }
    } else {
      this.myChannels.push(channel);
      this.followedChannelIds.add(channel.channel_id);

      const idx = this.publicChannels.findIndex(ch => ch.channel_id === channel.channel_id);
      if (idx !== -1) {
        this.publicChannels.splice(idx, 1);
      }
    }

    this.updateFilteredChannelsInPlace();

    // 2️⃣ Update PouchDB immediately
    if (wasFollowing) {
      await this.pouchDb.saveMyChannels(
        this.userId, 
        this.myChannels
      );
      await this.pouchDb.saveDiscoverChannels(
        this.userId, 
        this.publicChannels
      );
    } else {
      await this.pouchDb.saveMyChannels(
        this.userId, 
        this.myChannels
      );
      await this.pouchDb.saveDiscoverChannels(
        this.userId, 
        this.publicChannels
      );
    }

    // 3️⃣ Queue action if offline
    if (!navigator.onLine) {
      await this.pouchDb.enqueueAction({
        type: wasFollowing ? 'channel_unfollow' : 'channel_follow',
        channelId: String(channel.channel_id),
        data: { 
          userId: this.userId, 
          channel: wasFollowing ? undefined : channel,
          channelId: wasFollowing ? channel.channel_id : undefined
        },
        timestamp: Date.now()
      });
      
      this.presentToast(
        `${wasFollowing ? 'Unfollowed' : 'Following'} ${channel.channel_name} (will sync when online)`
      );
      return;
    }

    // 4️⃣ Backend confirmation
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
      error: async (err) => {
        console.error('❌ Backend operation failed, reverting:', err);

        // 5️⃣ Revert optimistic update
        this.revertOptimisticUpdate(channel, wasFollowing);

        // Queue for retry
        await this.pouchDb.enqueueAction({
          type: wasFollowing ? 'channel_unfollow' : 'channel_follow',
          channelId: String(channel.channel_id),
          data: { 
            userId: this.userId, 
            channel: wasFollowing ? undefined : channel,
            channelId: wasFollowing ? channel.channel_id : undefined
          },
          timestamp: Date.now()
        });

        this.presentToast(
          `Failed to ${wasFollowing ? 'unfollow' : 'follow'} channel. Will retry.`
        );
      }
    });
  }

  private revertOptimisticUpdate(channel: Channel, wasFollowing: boolean) {
    if (wasFollowing) {
      this.myChannels.push(channel);
      this.followedChannelIds.add(channel.channel_id);
      
      const idx = this.publicChannels.findIndex(ch => ch.channel_id === channel.channel_id);
      if (idx !== -1) {
        this.publicChannels.splice(idx, 1);
      }
    } else {
      const idx = this.myChannels.findIndex(ch => ch.channel_id === channel.channel_id);
      if (idx !== -1) {
        this.myChannels.splice(idx, 1);
      }
      this.followedChannelIds.delete(channel.channel_id);
      
      if (!this.publicChannels.find(ch => ch.channel_id === channel.channel_id)) {
        this.publicChannels.push(channel);
      }
    }

    this.updateFilteredChannelsInPlace();
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
    return 0;
  }

  async openAddChannelModal() {
    const modal = await this.modalCtrl.create({
      component: AddChannelModalComponent
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      this.syncFromBackend();
    }
  }
}