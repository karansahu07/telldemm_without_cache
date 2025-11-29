import { Injectable } from '@angular/core';

const THEME_KEY = 'settings.chatTheme';

export type BackgroundType = 'solid' | 'gradient' | 'wallpaper' | 'custom';

export interface ChatTheme {
  meBubble: string;
  otherBubble: string;
  bubbleTextColorMe?: string;
  bubbleTextColorOther?: string;
  backgroundType: BackgroundType;
  backgroundValue: string; // hex, gradient css, or image url/dataURL
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  // readonly default: ChatTheme = {
  //   meBubble: '#f5afaf',
  //   otherBubble: '#FFFFFF',
  //   bubbleTextColorMe: '#000000',
  //   bubbleTextColorOther: '#000000',
  //   backgroundType: 'solid',
  //   backgroundValue: '#685f5fff',
  // };

  // readonly default: ChatTheme = {
  //   meBubble: '#d6ba80',  // Light gold tint matching SCSS --chat-bubble-sent
  //   otherBubble: '#ffffff',  // Matches SCSS --chat-bubble-received
  //   bubbleTextColorMe: '#303030',  // Explicit match to SCSS --chat-bubble-text
  //   bubbleTextColorOther: '#303030',  // Explicit match to SCSS --chat-bubble-text
  //   backgroundType: 'solid',
  //   backgroundValue: '#ffffff',  // Light background to align with Ionic light theme
  // };

  readonly default: ChatTheme = {
    meBubble: '#d6ba80',
    otherBubble: '#ffffff',
    bubbleTextColorMe: '#000000',
    bubbleTextColorOther: '#000000',
    backgroundType: 'wallpaper',
    backgroundValue: 'assets/wallpaper/chat_bg.jpg',
  };

  constructor() { }

  /* ---------------- Persistence ---------------- */

  load(): ChatTheme {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (!raw) return { ...this.default };
      const parsed = JSON.parse(raw) as Partial<ChatTheme>;
      return { ...this.default, ...(parsed || {}) };
    } catch (e) {
      console.warn('ThemeService: failed to load theme, using default', e);
      return { ...this.default };
    }
  }

  save(theme: ChatTheme) {
    try {
      const t = { ...theme, updatedAt: new Date().toISOString() };
      localStorage.setItem(THEME_KEY, JSON.stringify(t));
      // apply immediately to reflect change
      this.apply(t);
    } catch (e) {
      console.warn('ThemeService: failed to save theme', e);
    }
  }

  reset() {
    try {
      localStorage.removeItem(THEME_KEY);
    } catch (e) {
      console.warn('ThemeService: failed to remove theme', e);
    }
    this.apply(this.default);
  }

  /* ---------------- Utilities ---------------- */

  /**
   * Pick readable text color (#000000 or #FFFFFF) for a given hex background.
   * Uses relative luminance approximation.
   */
  // pickTextColor(hex: string): '#000000' | '#FFFFFF' {
  //   try {
  //     const h = this.normalizeHex(hex);
  //     const r = parseInt(h.substr(0, 2), 16);
  //     const g = parseInt(h.substr(2, 2), 16);
  //     const b = parseInt(h.substr(4, 2), 16);

  //     // convert to linear-light per sRGB luminance formula
  //     const [rs, gs, bs] = [r, g, b].map((c) => {
  //       const s = c / 255;
  //       return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  //     });

  //     const luminance = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  //     // threshold tuned to prefer black for lighter backgrounds
  //     return luminance > 0.6 ? '#000000' : '#FFFFFF';
  //   } catch {
  //     return '#000000';
  //   }
  // }

  /**
 * Pick readable text color (#000000 or #FFFFFF) for a given hex background.
 * Uses relative luminance approximation.
 */
  pickTextColor(hex: string): '#000000' | '#FFFFFF' {
    try {
      const h = this.normalizeHex(hex);
      const r = parseInt(h.substr(0, 2), 16);
      const g = parseInt(h.substr(2, 2), 16);
      const b = parseInt(h.substr(4, 2), 16);

      // convert to linear-light per sRGB luminance formula
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });

      const luminance = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      // Threshold tuned to prefer black for lighter backgrounds (now checks both meBubble and otherBubble effectively)
      return luminance > 0.5 ? '#000000' : '#FFFFFF';  // Lowered from 0.6 to 0.5 for better handling of mid-light colors like #d6ba80
    } catch {
      return '#000000';
    }
  }

  /** Ensure hex is 6-char and lowercase without # */
  private normalizeHex(hex: string): string {
    if (!hex) return 'ffffff';
    let h = hex.trim().replace('#', '');
    if (h.length === 3) {
      h = h.split('').map((c) => c + c).join('');
    }
    if (h.length !== 6) {
      // fallback
      return 'ffffff';
    }
    return h.toLowerCase();
  }

  /** quick gradient CSS helper */
  gradientCss(a: string, b: string, deg = 135) {
    return `linear-gradient(${deg}deg, ${a} 0%, ${b} 100%)`;
  }

  /* ---------------- Apply / Theming ---------------- */

  /**
   * Apply theme: sets CSS variables on :root
   * Variables used by styles:
   * --chat-bubble-me
   * --chat-bubble-other
   * --chat-bubble-text-me
   * --chat-bubble-text-other
   * --chat-bg
   * --chat-bg-image
   */
  apply(theme?: ChatTheme) {
    const t = theme || this.load();
    const root = document.documentElement;

    // bubble colors & text
    root.style.setProperty('--chat-bubble-me', t.meBubble || this.default.meBubble);
    root.style.setProperty('--chat-bubble-other', t.otherBubble || this.default.otherBubble);

    // ensure text color exists (auto-pick fallback)
    const textMe = t.bubbleTextColorMe || this.pickTextColor(t.meBubble || this.default.meBubble);
    const textOther = t.bubbleTextColorOther || this.pickTextColor(t.otherBubble || this.default.otherBubble);
    root.style.setProperty('--chat-bubble-text-me', textMe);
    root.style.setProperty('--chat-bubble-text-other', textOther);

    // background
    if (t.backgroundType === 'solid') {
      root.style.setProperty('--chat-bg', t.backgroundValue || this.default.backgroundValue);
      root.style.setProperty('--chat-bg-image', t.backgroundValue);
    } else if (t.backgroundType === 'gradient') {
      // gradients can't be in background-color so set bg to transparent and image to gradient
      root.style.setProperty('--chat-bg', 'transparent');
      // store gradient as bg-image
      root.style.setProperty('--chat-bg-image', t.backgroundValue || 'none');
    } else {
      // wallpaper or custom (image URL or dataURL)
      root.style.setProperty('--chat-bg', 'transparent');
      // wrap in url(...) if not already gradient-like
      if (t.backgroundValue && /^url\(/i.test(t.backgroundValue) === false && t.backgroundValue.startsWith('data:') === false) {
        // assume plain url -> wrap
        root.style.setProperty('--chat-bg-image', `url("${t.backgroundValue}")`);
      } else {
        root.style.setProperty('--chat-bg-image', t.backgroundValue || 'none');
      }
    }
  }

  /**
   * Apply theme with a subtle overlay transition to smooth visual change.
   * duration in ms.
   */
  applyWithTransition(theme?: ChatTheme, duration = 300) {
    try {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '9999';
      overlay.style.pointerEvents = 'none';
      overlay.style.transition = `background ${duration}ms ease`;
      overlay.style.background = 'rgba(0,0,0,0)';
      document.body.appendChild(overlay);

      // kick off CSS change on next frame so transition runs
      requestAnimationFrame(() => {
        overlay.style.background = 'rgba(0,0,0,0.02)';
        setTimeout(() => {
          this.apply(theme);
          // fade out overlay
          overlay.style.background = 'rgba(0,0,0,0)';
          setTimeout(() => {
            if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
          }, duration);
        }, Math.max(80, duration / 2));
      });
    } catch (e) {
      // fallback to direct apply
      console.warn('ThemeService.applyWithTransition failed, falling back to apply()', e);
      this.apply(theme);
    }
  }

  /* ---------------- Convenience / Extras ---------------- */

  /** generate a random theme (useful for "surprise me") */
  randomTheme(): ChatTheme {
    const randHex = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    const me = randHex();
    const other = randHex();
    const useGradient = Math.random() > 0.45;
    const bg = useGradient ? this.gradientCss(randHex(), randHex()) : randHex();

    return {
      meBubble: me,
      otherBubble: other,
      bubbleTextColorMe: this.pickTextColor(me),
      bubbleTextColorOther: this.pickTextColor(other),
      backgroundType: (useGradient ? 'gradient' : 'solid') as BackgroundType,
      backgroundValue: bg,
    };
  }
}

