// src/app/settings/chats/theme/theme.page.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastController, IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { ThemeService, ChatTheme } from 'src/app/services/theme';

const PRESET_BUBBLES = [
  { me: '#d6ba80', other: '#FFFFFF' },
  { me: '#DCF8C6', other: '#FFFFFF' },
  { me: '#00A884', other: '#EDEDED' },
  { me: '#E1FFC7', other: '#F0F0F0' },
  { me: '#CDE7FF', other: '#FFFFFF' },
  { me: '#FFD6A5', other: '#FFF' },
];

const PRESET_GRADIENTS = [
  { id: 'g1', css: 'linear-gradient(135deg,#84fab0 0%,#8fd3f4 100%)' },
  { id: 'g2', css: 'linear-gradient(135deg,#f6d365 0%,#fda085 100%)' },
  { id: 'g3', css: 'linear-gradient(135deg,#a1c4fd 0%,#c2e9fb 100%)' },
  { id: 'g4', css: 'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)' },
];

const PRESET_WALLS = [
  { id: 'wp9', url: 'assets/wallpaper/chat_bg.jpg' },
  { id: 'wp1', url: 'assets/wallpaper/wp1.jpg' },
  { id: 'wp2', url: 'assets/wallpaper/wp2.jpg' },
  { id: 'wp3', url: 'assets/wallpaper/wp3.jpg' },
  { id: 'wp4', url: 'assets/wallpaper/wp4.jpg' },
  { id: 'wp5', url: 'assets/wallpaper/wp5.jpg' },
  { id: 'wp6', url: 'assets/wallpaper/wp6.jpg' },
  { id: 'wp7', url: 'assets/wallpaper/wp7.jpg' },
  { id: 'wp8', url: 'assets/wallpaper/wp8.jpg' },
];

@Component({
  selector: 'app-theme',
  templateUrl: './theme.page.html',
  styleUrls: ['./theme.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemePage implements OnInit {
  @ViewChild('preview', { static: true }) previewRef!: ElementRef;

  theme: ChatTheme;
  bubblePresets = PRESET_BUBBLES;
  gradients = PRESET_GRADIENTS;
  wallpapers = PRESET_WALLS;
  savedPresets: ChatTheme[] = [];

  constructor(
    private themeSvc: ThemeService,
    private toastCtrl: ToastController,
    private cdr: ChangeDetectorRef
  ) {
    this.theme = this.themeSvc.load();
  }

  ngOnInit() {
    // Apply theme immediately without loading spinner
    this.themeSvc.apply(this.theme);
  }

  pickBubble(me: string, other?: string) {
    this.theme.meBubble = me;
    if (other) this.theme.otherBubble = other;
    this.theme.bubbleTextColorMe = this.themeSvc.pickTextColor(me);
    this.theme.bubbleTextColorOther = this.themeSvc.pickTextColor(this.theme.otherBubble);
    this.livePreview();
  }

  pickGradient(css: string) {
    this.theme.backgroundType = 'gradient';
    this.theme.backgroundValue = css;
    this.livePreview();
  }

  pickWallpaper(url: string) {
    this.theme.backgroundType = 'wallpaper';
    this.theme.backgroundValue = url;
    this.livePreview();
  }

  pickSolid(hex: string) {
    this.theme.backgroundType = 'solid';
    this.theme.backgroundValue = hex;
    this.livePreview();
  }

  onColorChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target?.value) {
      this.pickSolid(target.value);
    }
  }

  onFilePicked(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.theme.backgroundType = 'custom';
      this.theme.backgroundValue = reader.result as string;
      this.livePreview();
    };
    reader.readAsDataURL(file);
  }

  // Simplified live preview without heavy animations
  livePreview() {
    this.themeSvc.apply(this.theme);
    this.cdr.markForCheck();
  }

  async saveTheme() {
    this.theme.bubbleTextColorMe = this.themeSvc.pickTextColor(this.theme.meBubble);
    this.theme.bubbleTextColorOther = this.themeSvc.pickTextColor(this.theme.otherBubble);
    this.themeSvc.save(this.theme);
    
    const t = await this.toastCtrl.create({
      message: 'Theme saved',
      duration: 1200,
      position: 'bottom',
      color: 'success'
    });
    await t.present();
  }

  surpriseMe() {
    this.theme = this.themeSvc.randomTheme();
    this.livePreview();
  }

  savePreset() {
    this.savedPresets.unshift({ ...this.theme });
    if (this.savedPresets.length > 8) this.savedPresets.pop();
    this.cdr.markForCheck();
  }

  previewFullScreen() {
    const el = document.createElement('div');
    el.className = 'full-wall-preview';
    el.innerHTML = `<div class="close">✕</div>`;
    el.style.background =
      this.theme.backgroundType === 'solid'
        ? this.theme.backgroundValue
        : this.theme.backgroundType === 'gradient'
        ? this.theme.backgroundValue
        : `url("${this.theme.backgroundValue}") center/cover no-repeat`;
    el.onclick = () => document.body.removeChild(el);
    document.body.appendChild(el);
  }

  // TrackBy functions for optimal performance
  trackByIndex(index: number): number {
    return index;
  }

  trackByGradient(index: number, item: any): string {
    return item.id;
  }

  trackByWallpaper(index: number, item: any): string {
    return item.id;
  }
}