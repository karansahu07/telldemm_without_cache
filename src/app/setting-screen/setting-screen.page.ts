import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { AlertController, IonicModule, NavController, Platform } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslateModule, TranslateService, LangChangeEvent } from '@ngx-translate/core';

import { MenuPopoverComponent } from '../components/menu-popover/menu-popover.component';
import { ApiService } from '../services/api/api.service';
import { AuthService } from '../auth/auth.service';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';
import { Resetapp } from '../services/resetapp';

@Component({
  selector: 'app-setting-screen',
  templateUrl: './setting-screen.page.html',
  styleUrls: ['./setting-screen.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule]
})
export class SettingScreenPage implements OnInit, OnDestroy {
  profileImageUrl: string = 'assets/images/user.jfif';
  isLoading = true;
  sender_name = '';
  dpStatus = '';

  private langSub?: Subscription;
  private backButtonSub?: Subscription;

  constructor(
    private service: ApiService,
    private authService: AuthService,
    private secureStorage: SecureStorageService,
    private router: Router,
    private alertController: AlertController,
    private navCtrl: NavController,
    private resetapp: Resetapp,
    private translate: TranslateService,
    private cd: ChangeDetectorRef,
    private zone: NgZone,
    private platform: Platform  // Add Platform
  ) {}

  ngOnInit() {
    this.loadUserProfile();
    this.sender_name = this.authService.authData?.name || '';

    // mirror HelpFeedbackPage: live update on language change
    this.langSub = this.translate.onLangChange.subscribe((evt: LangChangeEvent) => {
      this.zone.run(() => {
        const isRtl = /^(ar|he|fa|ur)/.test(evt.lang);
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
        try { this.cd.detectChanges(); } catch { this.cd.markForCheck(); }
      });
    });
  }

  ionViewWillEnter() {
    this.loadUserProfile();
    this.sender_name = this.authService.authData?.name || '';

    // Handle hardware back button
    this.backButtonSub = this.platform.backButton.subscribeWithPriority(10, () => {
      // Navigate to home-screen instead of default back behavior
      this.navCtrl.navigateRoot('/home-screen', {
        animationDirection: 'back'
      });
    });
  }

  ionViewWillLeave() {
    // Unsubscribe when leaving the page
    this.backButtonSub?.unsubscribe();
  }

  ngOnDestroy() {
    this.langSub?.unsubscribe();
    this.backButtonSub?.unsubscribe();
  }

  goToProfile() { this.router.navigateByUrl('/setting-profile'); }
  goToAccount() { this.router.navigateByUrl('account'); }
  goToPrivacy() { this.router.navigateByUrl('privacy'); }
  goToAvatar() { this.router.navigateByUrl('avatar'); }
  goToChats() { this.router.navigateByUrl('chats'); }
  goToAccessibility() { this.router.navigateByUrl('accessibility'); }
  goToNotifications() { this.router.navigateByUrl('notification'); }
  goToStorageData() { this.router.navigateByUrl('storage-data'); }
  goToAppLanguage() { this.router.navigateByUrl('app-language'); }
  goToHelpFeedback() { this.router.navigateByUrl('help-feedback'); }
  goToAppUpdates() { this.router.navigateByUrl('app-updates'); }
  goToInviteFriend() { this.router.navigateByUrl('invite-friend'); }

  async loadUserProfile() {
    try {
      const userId = this.authService.authData?.userId;
      if (!userId) {
        this.isLoading = false;
        return;
      }

      this.service.getUserProfilebyId(userId).subscribe({
        next: (response: any) => {
          if (response?.profile || response?.image_url) {
            this.profileImageUrl = response.profile || response.image_url;
          }
          // default dpStatus is translated
          const fallback = this.translate.instant('settingsPage.defaultStatus');
          this.dpStatus = response?.dp_status || fallback;
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; }
      });
    } catch {
      this.isLoading = false;
    }
  }

  onImageError(event: any) {
    event.target.src = 'assets/images/user.jfif';
  }

  async logout() {
    const header = this.translate.instant('settingsPage.logout.confirmHeader');
    const message = this.translate.instant('settingsPage.logout.confirmMessage');
    const cancel = this.translate.instant('common.cancel');
    const logoutTxt = this.translate.instant('common.logout');

    const alert = await this.alertController.create({
      header,
      message,
      buttons: [
        { text: cancel, role: 'cancel', cssClass: 'secondary' },
        { text: logoutTxt, cssClass: 'danger', handler: async () => await this.performLogout() }
      ]
    });
    await alert.present();
  }

  async performLogout() {
    const loadingHeader = this.translate.instant('settingsPage.logout.loadingHeader');
    const loadingMessage = this.translate.instant('settingsPage.logout.loadingMessage');
    const successHeader = this.translate.instant('settingsPage.logout.successHeader');
    const successMessage = this.translate.instant('settingsPage.logout.successMessage');
    const okTxt = this.translate.instant('common.ok');

    const loadingAlert = await this.alertController.create({
      header: loadingHeader,
      message: loadingMessage,
      backdropDismiss: false
    });
    await loadingAlert.present();
    await loadingAlert.dismiss();

    const successAlert = await this.alertController.create({
      header: successHeader,
      message: successMessage,
      buttons: [{ text: okTxt, handler: async () => await this.resetapp.resetApp() }]
    });
    await successAlert.present();
  }
}