// ========================================
// 📄 chats.page.ts - UPDATED with i18n for Consent Dialogs
// ========================================
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

const STORAGE_KEY = 'settings.chats';
// const TRANSLATION_CONSENT_KEY = 'translation.consent';

type FontSize = 'small' | 'medium' | 'large';

interface ChatsSettings {
  enterToSend: boolean;
  mediaVisibility: boolean;
  keepArchived: boolean;
  fontSize: FontSize;
  voiceTranscriptsEnabled: boolean;
  translationEnabled: boolean; // ✅ NEW
}

@Component({
  selector: 'app-chats',
  templateUrl: './chats.page.html',
  styleUrls: ['./chats.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class ChatsPage implements OnInit {
  enterToSend = false;
  mediaVisibility = true;
  keepArchived = true;
  fontSize: FontSize = 'medium';
  voiceTranscriptsEnabled = false;
  translationEnabled = false; // ✅ NEW
  preview = 'assets/wallpaper-preview.jpg';
  lastBackup: string | null = null;

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController, // ✅ NEW: For consent dialog
    private translate: TranslateService
  ) {}

  // consent storage key
  readonly TRANSLATION_CONSENT_KEY = 'translationConsent'; // values: 'granted' | 'denied'

  ngOnInit(): void {
    this.loadSettings();
    this.loadLastBackup();
  }

  /* ---------- Navigation ---------- */
  openTheme() {
    this.router.navigate(['settings', 'chats', 'theme']);
  }

  openChatTheme() {
    this.router.navigateByUrl('theme');
  }

  openFontSize() {
    this.router.navigate(['settings', 'chats', 'font-size']);
  }

  openChatBackup() {
    this.router.navigate(['settings', 'chats', 'backup']);
  }

  openTransferChats() {
    this.router.navigate(['settings', 'chats', 'transfer']);
  }

  openChatHistory() {
    this.router.navigate(['settings', 'chats', 'history']);
  }

  /* ---------- Toggle handlers (with i18n toasts) ---------- */
  async toggleEnterToSend() {
    this.enterToSend = !this.enterToSend;
    this.saveSettings();
    await this.showToast(
      this.translate.instant(
        this.enterToSend ? 'chats.toasts.enter.enabled' : 'chats.toasts.enter.disabled'
      )
    );
  }

  async toggleMediaVisibility() {
    this.mediaVisibility = !this.mediaVisibility;
    this.saveSettings();
    await this.showToast(
      this.translate.instant(
        this.mediaVisibility ? 'chats.toasts.media.on' : 'chats.toasts.media.off'
      )
    );
  }

  async toggleKeepArchived() {
    this.keepArchived = !this.keepArchived;
    this.saveSettings();
    await this.showToast(
      this.translate.instant(
        this.keepArchived ? 'chats.toasts.archived.enabled' : 'chats.toasts.archived.disabled'
      )
    );
  }

  async toggleVoiceMessageTranscripts() {
    this.voiceTranscriptsEnabled = !this.voiceTranscriptsEnabled;
    this.saveSettings();
    await this.showToast(
      this.translate.instant(
        this.voiceTranscriptsEnabled ? 'chats.toasts.transcripts.enabled' : 'chats.toasts.transcripts.disabled'
      )
    );
  }

  // ========================================
  // ✅ FIXED: Translation Toggle Handler (Uses Event to Detect Direction)
  // ========================================
  async onTranslationToggle(event: any) {
    const newValue = event.detail.checked; // This is the intended new state after toggle
    const previousValue = !newValue; // Since it's a toggle, previous is the opposite

    if (!newValue) {
      // Turning OFF: No consent needed, just disable and remove consent key
      this.translationEnabled = false;
      localStorage.removeItem(this.TRANSLATION_CONSENT_KEY);

      this.saveSettings();
      await this.showToast(this.translate.instant('chats.toasts.translation.disabled'));
      return;
    }

    // Turning ON: Check consent
    const hasConsent = localStorage.getItem(this.TRANSLATION_CONSENT_KEY) === 'granted';
   
    if (!hasConsent) {
      const userConsent = await this.showTranslationConsentDialog();
      if (!userConsent) {
        // User declined: Revert to previous state (OFF)
        this.translationEnabled = false;
        await this.showToast(this.translate.instant('chats.toasts.translation.consentDeclined'));
        return;
      }
      // User accepted: Save consent
      // localStorage.setItem(this.TRANSLATION_CONSENT_KEY, 'true');
    }

    // Enable translation
    this.translationEnabled = true;
    this.saveSettings();
    await this.showToast(this.translate.instant('chats.toasts.translation.enabled'));
  }

  // ========================================
  // ✅ UPDATED: Consent Dialog (with i18n)
  // ========================================
  async showTranslationConsentDialog(): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertCtrl.create({
        header: this.translate.instant('chats.dialogs.translationConsent.header'),
        message: this.translate.instant('chats.dialogs.translationConsent.message'),
        backdropDismiss: false,
        buttons: [
          {
            text: this.translate.instant('chats.dialogs.translationConsent.decline'),
            role: 'cancel',
            cssClass: 'alert-button-cancel',
            handler: () => {
              try {
                localStorage.setItem(this.TRANSLATION_CONSENT_KEY, 'denied');
              } catch {}
              resolve(false);
            }
          },
          {
            text: this.translate.instant('chats.dialogs.translationConsent.accept'),
            cssClass: 'alert-button-confirm',
            handler: () => {
              try {
                localStorage.setItem(this.TRANSLATION_CONSENT_KEY, 'granted');
              } catch {}
              resolve(true);
            },
          }
        ]
      });
      await alert.present();
    });
  }

  // ========================================
  // ✅ UPDATED: Reset Translation Consent (with i18n)
  // ========================================
  async resetTranslationConsent() {
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('chats.dialogs.resetTranslationConsent.header'),
      message: this.translate.instant('chats.dialogs.resetTranslationConsent.message'),
      buttons: [
        {
          text: this.translate.instant('common.cancel'),
          role: 'cancel'
        },
        {
          text: this.translate.instant('common.reset'),
          cssClass: 'alert-button-danger',
          handler: () => {
            localStorage.removeItem(this.TRANSLATION_CONSENT_KEY);
            this.translationEnabled = false;
            this.saveSettings();
            this.showToast(this.translate.instant('chats.toasts.translation.consentReset'));
          }
        }
      ]
    });
    await alert.present();
  }

  /* ---------- Persistence ---------- */
  loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s: Partial<ChatsSettings> = JSON.parse(raw);
      if (typeof s.enterToSend === 'boolean') this.enterToSend = s.enterToSend;
      if (typeof s.mediaVisibility === 'boolean') this.mediaVisibility = s.mediaVisibility;
      if (typeof s.keepArchived === 'boolean') this.keepArchived = s.keepArchived;
      if (s.fontSize === 'small' || s.fontSize === 'medium' || s.fontSize === 'large') this.fontSize = s.fontSize;
      if (typeof s.voiceTranscriptsEnabled === 'boolean') this.voiceTranscriptsEnabled = s.voiceTranscriptsEnabled;
      if (typeof s.translationEnabled === 'boolean') this.translationEnabled = s.translationEnabled; // ✅ NEW
    } catch (e) {
      console.warn('Could not load chat settings', e);
    }
  }

  saveSettings() {
    const s: ChatsSettings = {
      enterToSend: this.enterToSend,
      mediaVisibility: this.mediaVisibility,
      keepArchived: this.keepArchived,
      fontSize: this.fontSize,
      voiceTranscriptsEnabled: this.voiceTranscriptsEnabled,
      translationEnabled: this.translationEnabled // ✅ NEW
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
      console.warn('Could not save chat settings', e);
    }
  }
 
  /* ---------- Helpers ---------- */
  async showToast(message: string, duration = 1400) {
    const t = await this.toastCtrl.create({ message, duration, position: 'bottom' });
    await t.present();
  }

  loadLastBackup() {
    this.lastBackup = localStorage.getItem('chats.lastBackup') || null;
  }

  async startBackup() {
    await this.showToast(this.translate.instant('chats.toasts.backup.starting'), 800);
    const now = new Date().toISOString();
    localStorage.setItem('chats.lastBackup', now);
    this.lastBackup = now;
    await this.showToast(this.translate.instant('chats.toasts.backup.done'));
  }
}