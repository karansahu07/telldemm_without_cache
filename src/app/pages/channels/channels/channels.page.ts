import { Component, OnInit } from '@angular/core';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RegionFilterModalComponent } from '../modals/region-filter-modal/region-filter-modal.component';
import { AddChannelModalComponent } from '../modals/add-channel-modal/add-channel-modal.component';
import { ChannelService, Category, Region, Channel } from '../services/channel';
import { firstValueFrom } from 'rxjs';

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

  // for category paging (main page)
  private loadedCategoryIds = new Set<number | 'uncategorized'>();

  // for category-full-view channel dedupe
  private categoryChannelIds = new Set<string>();

  allGroupedCategories: GroupedCategory[] = [];
  pagedGroupedCategories: GroupedCategory[] = [];
  categoriesPageSize = 10;
  currentCategoryPage = 0;
  hasMoreCategories = true;

  // filter segment
  selectedCategoryId: number | 'all' = 'all';
  selectedRegionId: number | 'all' = 'all';

  // placeholder
  placeholderAvatar = 'assets/channel/channel-placeholder.svg';

  // Category Full-View state (for See all in-place)
  categoryFullViewActive = false;
  activeCategoryId: number | 'uncategorized' | 'all' = 'all';
  activeCategoryName = '';
  categoryChannels: UIChannel[] = [];
  categoryPageSize = 10;
  categoryOffset = 0; // page index (0-based)
  hasMoreCategoryChannels = true;

  selectedCategoryName?: string | null = null;
  selectedRegionName?: string | null = null;

  constructor(
    private modalCtrl: ModalController,
    private router: Router,
    private channelService: ChannelService,
    private toastCtrl: ToastController
  ) { }

  async ngOnInit() {
    await this.loadMetadata(); // ensure categories & regions are loaded before channels
    await this.loadChannels();
  }

  /**
   * Load categories & regions together and wait for both to complete.
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
      console.warn('Failed to load metadata', err);
      this.categories = [];
      this.regions = [];
    }
  }

  /** Load all channels (used for compact main page grouping) */
  async loadChannels(event?: any) {
    try {
      this.isLoading = true;

      const params: any = {
        page: 1,
        limit: 50 // fetch many to build homepage categories
      };

      // category filter by NAME
      if (this.selectedCategoryId !== 'all') {
        const catObj = this.categories.find(c => c.id == this.selectedCategoryId);
        if (catObj) params.category = catObj.category_name;
      }

      // region filter by NAME
      if (this.selectedRegionId !== 'all') {
        const regionObj = this.regions.find(r => r.region_id == this.selectedRegionId);
        if (regionObj) params.region = regionObj.region_name;
      }

      const res = await firstValueFrom(this.channelService.listChannels(params));
      const backendChannels = Array.isArray(res.channels) ? res.channels : [];

      const mapped: UIChannel[] = backendChannels.map((c: any) => {
        const rawFollowers = (c as any).follower_count ?? (c as any).followers ?? 0; // default to 0, not 20000
        const followersNum = Number(rawFollowers) || 0;

        return {
          id: `c${c.channel_id}`,
          name: c.channel_name,
          followers: followersNum,
          followersFormatted: this.formatFollowers(followersNum),
          avatar: c.channel_dp || null,
          verified: !!c.is_verified,
          // following: !!c.is_following ?? false,
          following: Boolean(c.is_following),

          _meta: c
        } as UIChannel;
      });

      this.allChannels = mapped;

      // build categories for main page (first 4 each)
      this.buildAllGroupedCategories(mapped);

      // reset paging
      this.currentCategoryPage = 0;
      this.loadedCategoryIds.clear();
      this.pagedGroupedCategories = [];
      this.hasMoreCategories = true;
      this.loadNextCategoryPage();

    } catch (err) {
      console.error('Load channels error', err);
      await this.presentToast('Could not load channels. Pull to retry.');
    } finally {
      this.isLoading = false;
      if (event?.target) event.target.complete();
    }
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

  private buildAllGroupedCategories(channels: UIChannel[]) {
    const groupsMap = new Map<number | 'uncategorized', GroupedCategory>();
    for (const cat of this.categories) {
      groupsMap.set(cat.id, { id: cat.id, name: cat.category_name, channels: [] });
    }

    for (const ch of channels) {
      const catId = ch._meta?.category_id;
      const key = (catId != null && groupsMap.has(Number(catId))) ? Number(catId) : 'uncategorized';

      if (!groupsMap.has(key)) {
        groupsMap.set(key, { id: key, name: key === 'uncategorized' ? 'Uncategorized' : 'Unknown', channels: [] });
      }

      groupsMap.get(key)!.channels.push(ch);
    }

    const grouped: GroupedCategory[] = [];
    for (const g of groupsMap.values()) {
      if (g.channels && g.channels.length) grouped.push({ id: g.id, name: g.name, channels: g.channels.slice(0, 4) });
    }

    // ensure uncategorized last
    this.allGroupedCategories = grouped.filter(g => g.id !== 'uncategorized');
    const unc = grouped.find(g => g.id === 'uncategorized');
    if (unc) this.allGroupedCategories.push(unc);
  }

  private loadNextCategoryPage() {
    const start = this.currentCategoryPage * this.categoriesPageSize;
    const end = start + this.categoriesPageSize;
    const nextBatch = this.allGroupedCategories.slice(start, end);

    // filter out any groups already loaded (safety)
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
    // small delay to allow spinner show; keep short
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
    // reset main paging and reload channels with new filter
    this.currentCategoryPage = 0;
    this.hasMoreCategories = true;
    this.loadChannels();
  }

  /** Optimistic follow/unfollow with API fallback */
  async toggleFollow(channel: UIChannel) {
    const prev = channel.following;
    channel.following = !prev; // optimistic

    try {
      // attempt backend call if available. Implement setFollow(channelId, follow) in ChannelService
      if (this.channelService.setFollow) {
        await firstValueFrom(this.channelService.setFollow(channel._meta.channel_id, channel.following));
      }
      await this.presentToast(channel.following ? 'Following' : 'Unfollowed', 900);
    } catch (err) {
      channel.following = prev; // revert
      console.error('Follow toggle failed', err);
      await this.presentToast('Could not update follow. Try again.');
    }
  }

  async openAddChannelModal() {
    const modal = await this.modalCtrl.create({
      component: AddChannelModalComponent
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) this.loadChannels(); // only reload if created
  }

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

    this.applyRegionSelection(data.selectedRegionId ?? null, data.selectedRegionName ?? null);
  }

  private applyRegionSelection(regionId: number | null, regionName: string | null) {
    if (regionId == null) {
      this.selectedRegionId = 'all';
      this.selectedRegionName = null;
    } else {
      this.selectedRegionId = regionId;
      this.selectedRegionName = regionName ?? null;
    }
    // reload channels using new region filter
    this.loadChannels();
  }

  clearRegionFilter() {
    this.selectedRegionId = 'all';
    this.selectedRegionName = null;
    this.loadChannels();
  }

  /** ========== CATEGORY FULL VIEW HANDLERS ========== */
  openCategoryFullView(categoryId: number | 'uncategorized', categoryName?: string) {
    this.categoryFullViewActive = true;
    this.activeCategoryId = categoryId;
    this.activeCategoryName = categoryName ?? (categoryId === 'uncategorized' ? 'Uncategorized' : 'Category');

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

      let filtered = backendChannels;
      if (this.activeCategoryId === 'uncategorized') {
        filtered = backendChannels.filter((c: any) => !c.category_name);
      }

      const mapped: UIChannel[] = filtered.map((c: any) => {
        const rawFollowers = (c as any).follower_count ?? (c as any).followers ?? 0;
        const followersNum = Number(rawFollowers) || 0;
        return {
          id: `c${c.channel_id}`,
          name: c.channel_name,
          followers: followersNum,
          followersFormatted: this.formatFollowers(followersNum),
          avatar: c.channel_dp || null,
          verified: !!c.is_verified,
          // following: !!c.is_following ?? false,
          following: Boolean(c.is_following),
          _meta: c
        };
      });

      // dedupe using channel id
      const newOnes = mapped.filter(m => !this.categoryChannelIds.has(m.id));
      newOnes.forEach(n => this.categoryChannelIds.add(n.id));
      this.categoryChannels = [...this.categoryChannels, ...newOnes];

      if (backendChannels.length < this.categoryPageSize) {
        this.hasMoreCategoryChannels = false;
      } else {
        this.categoryOffset += 1; // move to next PAGE
      }

    } catch (err) {
      console.error('Full Category Page Error:', err);
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

  trackByChannel(index: number, item: UIChannel) {
    return item.id;
  }

  async presentToast(message: string, duration = 2000) {
    const t = await this.toastCtrl.create({ message, duration, position: 'bottom' });
    await t.present();
  }
}
