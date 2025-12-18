import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { Category, Channel, ChannelService } from '../services/channel';

@Component({
  selector: 'app-channel-all',
  templateUrl: './channel-all.page.html',
  styleUrls: ['./channel-all.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ChannelAllPage implements OnInit {

   categories: Category[] = [];
  activeCategoryId: number | 'all' | 'uncategorized' = 'all';

  // channels pagination for active category
  channels: any[] = [];
  pageSize = 10;
  offset = 0;
  hasMore = true;
  isLoading = false;

  placeholderAvatar = 'assets/img/channel-placeholder.png';

  constructor(
    private route: ActivatedRoute,
    private channelService: ChannelService,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(q => {
      // if route passed a categoryId, set activeCategoryId accordingly
      if (q && q['categoryId']) {
        this.activeCategoryId = Number(q['categoryId']);
      } else if (q && q['categoryName'] && q['categoryName'].toLowerCase() === 'uncategorized') {
        this.activeCategoryId = 'uncategorized';
      } else {
        this.activeCategoryId = 'all';
      }

      // load categories (for segment) then load channels
      this.loadCategories().then(() => {
        // if categoryId is present but not in categories, it will still work (we query backend by id)
        this.resetAndLoad();
      });
    });
  }

  async loadCategories() {
    try {
      const res = await firstValueFrom(this.channelService.getAllCategories());
      this.categories = (res && (res as any).categories) ? (res as any).categories : [];
    } catch (err) {
      this.categories = [];
    }
  }

  async resetAndLoad() {
    this.channels = [];
    this.offset = 0;
    this.hasMore = true;
    await this.loadPage();
  }

  async loadPage(event?: any) {
    if (!this.hasMore) {
      if (event) event.target.complete();
      return;
    }
    this.isLoading = true;
    try {
      const params: any = { limit: this.pageSize, offset: this.offset };
      if (this.activeCategoryId !== 'all' && this.activeCategoryId !== 'uncategorized') {
        params.category_id = Number(this.activeCategoryId);
      }
      if (this.activeCategoryId === 'uncategorized') {
        // If backend supports a way to query uncategorized (category_id null), you may need a special param.
        // Fallback: request all and filter client-side by missing category_id.
        delete params.category_id;
      }

      const res = await firstValueFrom(this.channelService.listChannels(params));
      const backendChannels = (res && Array.isArray(res.channels)) ? res.channels as Channel[] : [];

      // if uncategorized requested, filter those with no category_id
      const filtered = (this.activeCategoryId === 'uncategorized')
        ? backendChannels.filter(c => !c.category_id)
        : backendChannels;

      const mapped = filtered.map(c => ({
        id: `c${c.channel_id}`,
        name: c.channel_name || 'Unnamed Channel',
        followers: (c as any).followers_count != null ? String((c as any).followers_count) : '0',
        avatar: c.channel_dp || null,
        verified: !!(c as any).is_verified,
        following: false,
        _meta: c
      }));

      // append
      this.channels = this.channels.concat(mapped);
      // advance offset: backend might respond with fewer than requested items
      const got = mapped.length;
      if (got < this.pageSize) {
        this.hasMore = false;
      } else {
        this.offset += this.pageSize;
      }
    } catch (err) {
      console.error(err);
      this.presentToast('Failed to load channels');
    } finally {
      this.isLoading = false;
      if (event && event.target) event.target.complete();
    }
  }

  async loadMore(event: any) {
    await this.loadPage(event);
  }

  async refresh(event: any) {
    this.resetAndLoad();
    if (event && event.target) event.target.complete();
  }

  onSegmentChange(ev: any) {
    const v = ev.detail ? ev.detail.value : ev;
    this.activeCategoryId = (v === 'all' || v === 'uncategorized') ? v : Number(v);
    this.resetAndLoad();
  }

  toggleFollow(ch: any) {
    ch.following = !ch.following;
  }

  async presentToast(message: string, duration = 2000) {
    const t = await this.toastCtrl.create({ message, duration, position: 'bottom' });
    await t.present();
  }

}
