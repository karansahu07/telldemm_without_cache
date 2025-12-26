import { Component, OnInit } from '@angular/core';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RegionFilterModalComponent } from '../modals/region-filter-modal/region-filter-modal.component';
import { AddChannelModalComponent } from '../modals/add-channel-modal/add-channel-modal.component';
import { ChannelService, Category, Region, Channel } from '../services/channel';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'src/app/auth/auth.service';
// import { ChannelPouchDbService } from 'src/app/services/channel-pouch-db.service';
import { ChannelFirebaseSyncService } from '../services/firebasesyncchannel';
import { ChannelPouchDbService } from '../services/pouch-db';

interface GroupedCategory {
  id: number | 'uncategorized';
  name: string;
  channels: any[];
}

interface UIChannel {
  id: string;
  name: string;
  followers: number;
  followersFormatted: string;
  avatar: string | null;
  verified: boolean;
  following: boolean;
  _meta: any;
}

@Component({
  selector: 'app-channels',
  templateUrl: './channels.page.html',
  styleUrls: ['./channels.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ChannelsPage implements OnInit {
  isLoading = false;

  allChannels: UIChannel[] = [];
  categories: Category[] = [];
  regions: Region[] = [];

  userId: any = this.authService.authData?.userId || '';

  loadingChannelId: string | null = null;
  private followedChannelIds = new Set<string>();

  // Category paging
  private loadedCategoryIds = new Set<number | 'uncategorized'>();
  private categoryChannelIds = new Set<string>();

  allGroupedCategories: GroupedCategory[] = [];
  pagedGroupedCategories: GroupedCategory[] = [];
  categoriesPageSize = 10;
  currentCategoryPage = 0;
  hasMoreCategories = true;

  // Filters
  selectedCategoryId: number | 'all' = 'all';
  selectedRegionId: number | 'all' = 'all';

  placeholderAvatar = 'assets/channel/channel-placeholder.svg';

  // Category Full-View state
  categoryFullViewActive = false;
  activeCategoryId: number | 'uncategorized' | 'all' = 'all';
  activeCategoryName = '';
  categoryChannels: UIChannel[] = [];
  categoryPageSize = 10;
  categoryOffset = 0;
  hasMoreCategoryChannels = true;

  selectedCategoryName?: string | null = null;
  selectedRegionName?: string | null = null;

  constructor(
    private modalCtrl: ModalController,
    private router: Router,
    private channelService: ChannelService,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private pouchDb: ChannelPouchDbService,
    private channelFirebase: ChannelFirebaseSyncService
  ) { }

  /* =========================
     LIFECYCLE - OFFLINE-FIRST
     ========================= */

  async ngOnInit() {
    // 🔹 STEP 1: Load from cache FIRST (instant)
    await this.loadFromCache();

    // 🔹 STEP 2: Load metadata (categories/regions)
    await this.loadMetadata();

    // 🔹 STEP 3: Setup Firebase listeners
    this.setupFirebaseListeners();

    // 🔹 STEP 4: Load from backend (background sync)
    await this.loadChannels();
  }

  async ionViewWillEnter() {
    // Reload from cache when returning to page
    await this.loadFromCache();
  }

  /* =========================
     OFFLINE-FIRST LOADING
     ========================= */

  /**
   * 🔹 Load from PouchDB cache FIRST (instant)
   */
  private async loadFromCache() {
    console.log('📱 Loading channels from PouchDB cache...');

    try {
      const [cachedDiscoverChannels, cachedMyChannels] = await Promise.all([
        this.pouchDb.getDiscoverChannels(this.userId),
        this.pouchDb.getMyChannels(this.userId)
      ]);

      // Build followed IDs set
      if (cachedMyChannels.length > 0) {
        this.followedChannelIds = new Set(
          cachedMyChannels.map(c => `c${c.channel_id}`)
        );
        console.log(`✅ Loaded ${cachedMyChannels.length} followed channels from cache`);
      }

      // Convert discover channels to UI format
      if (cachedDiscoverChannels.length > 0) {
        const mapped: UIChannel[] = cachedDiscoverChannels.map((c: any) => {
          const rawFollowers = c.followers_count ?? c.follower_count ?? c.followers ?? 0;
          const followersNum = Number(rawFollowers) || 0;
          const channelId = `c${c.channel_id}`;

          return {
            id: channelId,
            name: c.channel_name,
            followers: followersNum,
            followersFormatted: this.formatFollowers(followersNum),
            avatar: c.channel_dp || null,
            verified: !!c.is_verified,
            following: this.followedChannelIds.has(channelId),
            _meta: c
          } as UIChannel;
        });

        this.allChannels = mapped;
        this.buildAllGroupedCategories(mapped);

        // Reset paging
        this.currentCategoryPage = 0;
        this.loadedCategoryIds.clear();
        this.pagedGroupedCategories = [];
        this.hasMoreCategories = true;
        this.loadNextCategoryPage();

        console.log(`✅ Loaded ${mapped.length} discover channels from cache`);
      }

      if (cachedDiscoverChannels.length === 0) {
        console.log('📭 No cached channels, will load from backend');
        this.isLoading = true;
      }

    } catch (error) {
      console.error('❌ Failed to load from cache:', error);
      this.isLoading = true;
    }
  }

  /**
   * 🔥 Setup Firebase listeners for real-time updates
   */
  private setupFirebaseListeners() {
    // Listen to my channels (for followed state)
    this.channelFirebase.listenMyChannels(this.userId, channels => {
      console.log('🔥 Firebase update: My Channels (followed state)');
      this.followedChannelIds = new Set(
        channels.map(c => `c${c.channel_id}`)
      );
      
      // Update following state in all UI channels
      this.updateFollowingStateInAllChannels();
    });

    // Listen to discover channels
    this.channelFirebase.listenDiscoverChannels(this.userId, channels => {
      console.log('🔥 Firebase update: Discover Channels');
      
      // Convert to UI format
      const mapped: UIChannel[] = channels.map((c: any) => {
        const rawFollowers = c.followers_count ?? c.follower_count ?? c.followers ?? 0;
        const followersNum = Number(rawFollowers) || 0;
        const channelId = `c${c.channel_id}`;

        return {
          id: channelId,
          name: c.channel_name,
          followers: followersNum,
          followersFormatted: this.formatFollowers(followersNum),
          avatar: c.channel_dp || null,
          verified: !!c.is_verified,
          following: this.followedChannelIds.has(channelId),
          _meta: c
        } as UIChannel;
      });

      // Only update if we have new data
      if (mapped.length > 0) {
        this.allChannels = mapped;
        this.buildAllGroupedCategories(mapped);
        this.resetPaging();
        this.isLoading = false;
      }
    });
  }

  /**
   * Update following state across all channel lists
   */
  private updateFollowingStateInAllChannels() {
    // Update in all channels
    this.allChannels.forEach(ch => {
      ch.following = this.followedChannelIds.has(ch.id);
    });

    // Update in grouped categories
    this.allGroupedCategories.forEach(group => {
      group.channels.forEach(ch => {
        ch.following = this.followedChannelIds.has(ch.id);
      });
    });

    this.pagedGroupedCategories.forEach(group => {
      group.channels.forEach(ch => {
        ch.following = this.followedChannelIds.has(ch.id);
      });
    });

    // Update in full view
    this.categoryChannels.forEach(ch => {
      ch.following = this.followedChannelIds.has(ch.id);
    });
  }

  /**
   * Load metadata (categories & regions)
   */
  async loadMetadata(): Promise<void> {
    try {
      const [catsRes, regsRes] = await Promise.all([
        firstValueFrom(this.channelService.getAllCategories()),
        firstValueFrom(this.channelService.getAllRegions())
      ]);

      this.categories = (catsRes && (catsRes as any).categories) ? (catsRes as any).categories : [];
      this.regions = (regsRes && (regsRes as any).regions) ? (regsRes as any).regions : [];
    } catch (err) {
      console.warn('Failed to load metadata:', err);
      this.categories = [];
      this.regions = [];
    }
  }

  /**
   * Load channels from backend (background sync)
   */
  async loadChannels(event?: any) {
    try {
      if (!event) {
        this.isLoading = true;
      }

      const params: any = {
        page: 1,
        limit: 50
      };

      // Category filter
      if (this.selectedCategoryId !== 'all') {
        const catObj = this.categories.find(c => c.id == this.selectedCategoryId);
        if (catObj) params.category = catObj.category_name;
      }

      // Region filter
      if (this.selectedRegionId !== 'all') {
        const regionObj = this.regions.find(r => r.region_id == this.selectedRegionId);
        if (regionObj) params.region = regionObj.region_name;
      }

      const res = await firstValueFrom(this.channelService.listChannels(params));
      const backendChannels = Array.isArray(res.channels) ? res.channels : [];

      console.log(`🌐 Backend: Loaded ${backendChannels.length} channels`);

      // Filter out owned and followed channels
      const filtered = backendChannels.filter((c: any) => {
        const channelId = `c${c.channel_id}`;
        const isOwned = c.created_by === this.userId;
        const isFollowed = this.followedChannelIds.has(channelId);
        return !isOwned && !isFollowed;
      });

      // 🔥 Sync to Firebase (which auto-updates PouchDB)
      await this.channelFirebase.syncDiscoverChannels(
        this.userId,
        filtered
      );

      // Convert to UI format
      const mapped: UIChannel[] = filtered.map((c: any) => {
        const rawFollowers = c.followers_count ?? c.follower_count ?? c.followers ?? 0;
        const followersNum = Number(rawFollowers) || 0;
        const channelId = `c${c.channel_id}`;

        return {
          id: channelId,
          name: c.channel_name,
          followers: followersNum,
          followersFormatted: this.formatFollowers(followersNum),
          avatar: c.channel_dp || null,
          verified: !!c.is_verified,
          following: false,
          _meta: c
        } as UIChannel;
      });

      this.allChannels = mapped;
      this.buildAllGroupedCategories(mapped);
      this.resetPaging();

    } catch (err) {
      console.error('❌ Load channels error:', err);
      
      if (!event) {
        // Only show toast if not a pull-to-refresh
        await this.presentToast('Could not load channels. Using cached data.');
      }
    } finally {
      this.isLoading = false;
      if (event?.target) event.target.complete();
    }
  }

  /**
   * Load followed channels in background
   */
  private async loadMyFollowedChannels() {
    if (!navigator.onLine) {
      console.log('📴 Offline: Skipping followed channels sync');
      return;
    }

    try {
      const res = await firstValueFrom(
        this.channelService.getUserChannels(this.userId, { role: 'all' })
      );
      
      if (res?.status && Array.isArray(res.channels)) {
        console.log(`✅ Backend sync: ${res.channels.length} followed channels`);
        
        // Update Firebase (which updates PouchDB)
        await this.channelFirebase.syncMyChannels(
          this.userId,
          res.channels
        );
      }
    } catch (err) {
      console.warn('📴 Could not sync followed channels:', err);
    }
  }

  /* =========================
     FOLLOW / UNFOLLOW
     ========================= */

  async toggleFollow(channel: UIChannel) {
    if (this.loadingChannelId === channel.id) return;

    const wasFollowing = channel.following;
    const channelId = channel._meta.channel_id;

    // 1️⃣ Optimistic UI update
    channel.following = !wasFollowing;
    channel.followers += wasFollowing ? -1 : 1;
    channel.followersFormatted = this.formatFollowers(channel.followers);

    if (wasFollowing) {
      this.followedChannelIds.delete(channel.id);
    } else {
      this.followedChannelIds.add(channel.id);
    }

    this.updateChannelInAllLists(channel.id, {
      following: !wasFollowing,
      followers: channel.followers,
      followersFormatted: channel.followersFormatted
    });

    this.loadingChannelId = channel.id;

    // Haptics
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) { /* web = no haptics */ }

    // 2️⃣ Update Firebase + PouchDB (with offline queue)
    if (wasFollowing) {
      await this.channelFirebase.unfollowChannel(
        this.userId,
        channelId
      );
    } else {
      await this.channelFirebase.followChannel(
        this.userId,
        channel._meta
      );
    }

    // 3️⃣ Backend confirmation
    try {
      await firstValueFrom(
        this.channelService.setFollow(channelId, !wasFollowing, this.userId)
      );
      
      console.log(`✅ Backend confirmed ${wasFollowing ? 'unfollow' : 'follow'}`);
      this.presentToast(
        !wasFollowing ? 'Now following' : 'Unfollowed',
        800
      );

      // If followed, remove from explore views
      if (!wasFollowing) {
        this.removeChannelFromExploreViews(channel.id);
      }

    } catch (err) {
      console.error('❌ Backend operation failed:', err);

      // 4️⃣ Revert optimistic update
      channel.following = wasFollowing;
      channel.followers += wasFollowing ? 1 : -1;
      channel.followersFormatted = this.formatFollowers(channel.followers);

      if (wasFollowing) {
        this.followedChannelIds.add(channel.id);
      } else {
        this.followedChannelIds.delete(channel.id);
      }

      this.updateChannelInAllLists(channel.id, {
        following: wasFollowing,
        followers: channel.followers,
        followersFormatted: channel.followersFormatted
      });

      // 5️⃣ Revert Firebase
      if (wasFollowing) {
        await this.channelFirebase.followChannel(this.userId, channel._meta);
      } else {
        await this.channelFirebase.unfollowChannel(this.userId, channelId);
      }

      this.presentToast(
        `Failed to ${wasFollowing ? 'unfollow' : 'follow'}. ${
          navigator.onLine ? 'Try again.' : 'Will retry when online.'
        }`
      );
    } finally {
      this.loadingChannelId = null;
    }
  }

  private removeChannelFromExploreViews(channelId: string) {
    // Remove from main grouped categories
    this.allGroupedCategories.forEach(group => {
      group.channels = group.channels.filter(ch => ch.id !== channelId);
    });
    this.pagedGroupedCategories.forEach(group => {
      group.channels = group.channels.filter(ch => ch.id !== channelId);
    });

    // Remove from full category view
    this.categoryChannels = this.categoryChannels.filter(ch => ch.id !== channelId);
  }

  private updateChannelInAllLists(channelId: string, updates: Partial<UIChannel>) {
    // Update in main allChannels
    const inMain = this.allChannels.find(c => c.id === channelId);
    if (inMain) Object.assign(inMain, updates);

    // Update in grouped categories
    for (const group of this.allGroupedCategories) {
      const ch = group.channels.find(c => c.id === channelId);
      if (ch) Object.assign(ch, updates);
    }

    // Update in paged view
    for (const group of this.pagedGroupedCategories) {
      const ch = group.channels.find(c => c.id === channelId);
      if (ch) Object.assign(ch, updates);
    }

    // Update in full category view
    const inFull = this.categoryChannels.find(c => c.id === channelId);
    if (inFull) Object.assign(inFull, updates);
  }

  /* =========================
     CATEGORY & PAGING LOGIC
     ========================= */

  private buildAllGroupedCategories(channels: UIChannel[]) {
    const groupsMap = new Map<number | 'uncategorized', GroupedCategory>();
    
    for (const cat of this.categories) {
      groupsMap.set(cat.id, { id: cat.id, name: cat.category_name, channels: [] });
    }

    for (const ch of channels) {
      const catId = ch._meta?.category_id;
      const key = (catId != null && groupsMap.has(Number(catId))) 
        ? Number(catId) 
        : 'uncategorized';

      if (!groupsMap.has(key)) {
        groupsMap.set(key, { 
          id: key, 
          name: key === 'uncategorized' ? 'Uncategorized' : 'Unknown', 
          channels: [] 
        });
      }

      groupsMap.get(key)!.channels.push(ch);
    }

    const grouped: GroupedCategory[] = [];
    for (const g of groupsMap.values()) {
      if (g.channels && g.channels.length) {
        grouped.push({ 
          id: g.id, 
          name: g.name, 
          channels: g.channels.slice(0, 4) 
        });
      }
    }

    // Ensure uncategorized last
    this.allGroupedCategories = grouped.filter(g => g.id !== 'uncategorized');
    const unc = grouped.find(g => g.id === 'uncategorized');
    if (unc) this.allGroupedCategories.push(unc);
  }

  private resetPaging() {
    this.currentCategoryPage = 0;
    this.loadedCategoryIds.clear();
    this.pagedGroupedCategories = [];
    this.hasMoreCategories = true;
    this.loadNextCategoryPage();
  }

  private loadNextCategoryPage() {
    const start = this.currentCategoryPage * this.categoriesPageSize;
    const end = start + this.categoriesPageSize;
    const nextBatch = this.allGroupedCategories.slice(start, end);

    const newBatch = nextBatch.filter(g => !this.loadedCategoryIds.has(g.id));

    if (newBatch.length) {
      newBatch.forEach(g => this.loadedCategoryIds.add(g.id));
      this.pagedGroupedCategories = this.pagedGroupedCategories.concat(newBatch);
      this.currentCategoryPage++;

      if (this.pagedGroupedCategories.length >= this.allGroupedCategories.length) {
        this.hasMoreCategories = false;
      }
    } else {
      this.hasMoreCategories = false;
    }
  }

  loadMoreCategories(event: any) {
    setTimeout(() => {
      this.loadNextCategoryPage();
      if (event?.target) {
        event.target.complete();
        if (!this.hasMoreCategories) event.target.disabled = true;
      }
    }, 200);
  }

  onCategorySelected(ev: any) {
    const v = ev.detail ? ev.detail.value : ev;
    this.selectedCategoryId = (v === 'all') ? 'all' : Number(v);
    this.currentCategoryPage = 0;
    this.hasMoreCategories = true;
    this.loadChannels();
  }

  /* =========================
     CATEGORY FULL VIEW
     ========================= */

  openCategoryFullView(categoryId: number | 'uncategorized', categoryName?: string) {
    this.categoryFullViewActive = true;
    this.activeCategoryId = categoryId;
    this.activeCategoryName = categoryName ?? (
      categoryId === 'uncategorized' ? 'Uncategorized' : 'Category'
    );

    this.categoryChannels = [];
    this.categoryOffset = 0;
    this.hasMoreCategoryChannels = true;
    this.categoryChannelIds.clear();

    this.loadCategoryPage();
  }

  closeCategoryFullView() {
    this.categoryFullViewActive = false;
    this.activeCategoryId = 'all';
    this.activeCategoryName = '';
    this.categoryChannels = [];
  }

  async loadCategoryPage(event?: any) {
    if (!this.hasMoreCategoryChannels) {
      if (event?.target) {
        event.target.complete();
        event.target.disabled = true;
      }
      return;
    }

    try {
      const pageToRequest = this.categoryOffset + 1;

      const params: any = {
        page: pageToRequest,
        limit: this.categoryPageSize
      };

      if (this.activeCategoryId !== 'all' && this.activeCategoryId !== 'uncategorized') {
        params.category = this.activeCategoryName;
      }

      if (this.selectedRegionId !== 'all') {
        const regionObj = this.regions.find(r => r.region_id == this.selectedRegionId);
        if (regionObj) params.region = regionObj.region_name;
      }

      const res = await firstValueFrom(this.channelService.listChannels(params));
      const backendChannels = Array.isArray(res.channels) ? res.channels : [];

      let filtered = backendChannels.filter((c: any) => {
        const channelId = `c${c.channel_id}`;
        const isOwned = c.created_by === this.userId;
        const isFollowed = this.followedChannelIds.has(channelId);

        const matchesCategory = this.activeCategoryId === 'uncategorized'
          ? !c.category_name
          : true;

        return matchesCategory && !isOwned && !isFollowed;
      });

      const mapped: UIChannel[] = filtered.map((c: any) => {
        const rawFollowers = c.followers_count ?? c.follower_count ?? c.followers ?? 0;
        const followersNum = Number(rawFollowers) || 0;
        const channelId = `c${c.channel_id}`;

        return {
          id: channelId,
          name: c.channel_name,
          followers: followersNum,
          followersFormatted: this.formatFollowers(followersNum),
          avatar: c.channel_dp || null,
          verified: !!c.is_verified,
          following: this.followedChannelIds.has(channelId),
          _meta: c
        };
      });

      // Dedupe
      const newOnes = mapped.filter(m => !this.categoryChannelIds.has(m.id));
      newOnes.forEach(n => this.categoryChannelIds.add(n.id));
      this.categoryChannels = [...this.categoryChannels, ...newOnes];

      if (backendChannels.length < this.categoryPageSize) {
        this.hasMoreCategoryChannels = false;
      } else {
        this.categoryOffset += 1;
      }

    } catch (err) {
      console.error('❌ Full Category Page Error:', err);
      await this.presentToast('Could not load category channels.');
    } finally {
      if (event?.target) {
        event.target.complete();
        if (!this.hasMoreCategoryChannels) event.target.disabled = true;
      }
    }
  }

  loadMoreCategoryChannels(event: any) {
    setTimeout(() => {
      this.loadCategoryPage(event);
    }, 150);
  }

  /* =========================
     FILTERS & MODALS
     ========================= */

  async openRegionFilter() {
    const modal = await this.modalCtrl.create({
      component: RegionFilterModalComponent,
      componentProps: {
        regions: this.regions ?? [],
        categories: this.categories ?? [],
      }
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();

    if (!data) return;

    this.applyRegionSelection(
      data.selectedRegionId ?? null, 
      data.selectedRegionName ?? null
    );
  }

  private applyRegionSelection(regionId: number | null, regionName: string | null) {
    if (regionId == null) {
      this.selectedRegionId = 'all';
      this.selectedRegionName = null;
    } else {
      this.selectedRegionId = regionId;
      this.selectedRegionName = regionName ?? null;
    }
    this.loadChannels();
  }

  clearRegionFilter() {
    this.selectedRegionId = 'all';
    this.selectedRegionName = null;
    this.loadChannels();
  }

  async openAddChannelModal() {
    const modal = await this.modalCtrl.create({
      component: AddChannelModalComponent
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      this.loadChannels();
    }
  }

  /* =========================
     NAVIGATION & UTILITIES
     ========================= */

  async openChannelDetail(channel: UIChannel) {
    const channelId = channel._meta.channel_id;
    
    this.router.navigate(['/channel-feed'], { 
      queryParams: { channelId: channelId } 
    });
    
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) { /* No haptics on web */ }
  }

  isOwner(channel: UIChannel): boolean {
    return channel._meta?.created_by === this.userId;
  }

  private formatFollowers(n: number): string {
    if (!n || n <= 0) return '0';
    if (n < 1000) return `${n}`;
    if (n < 1_000_000) {
      const num = Math.round((n / 1000) * 10) / 10;
      return `${num}`.replace(/\.0$/, '') + 'k';
    }
    const num = Math.round((n / 1_000_000) * 10) / 10;
    return `${num}`.replace(/\.0$/, '') + 'M';
  }

  trackByChannel(index: number, item: UIChannel) {
    return item.id;
  }

  async presentToast(message: string, duration = 2000) {
    const t = await this.toastCtrl.create({ 
      message, 
      duration, 
      position: 'bottom' 
    });
    await t.present();
  }
}