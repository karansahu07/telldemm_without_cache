import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { ToastController, Platform, ModalController, PopoverController, ActionSheetController, AlertController } from '@ionic/angular';
import { NetworkService } from './services/network-connection/network.service';
import { FirebasePushService } from './services/push_notification/firebase-push.service';
import { FileSystemService } from './services/file-system.service';
import { AuthService } from './auth/auth.service';
import { NavigationEnd, Router } from '@angular/router';
import { FcmService } from './services/fcm-service';
import { SqliteService } from './services/sqlite.service';
import { StatusBar, Style } from '@capacitor/status-bar';
import { VersionCheck } from './services/version-check';
import { register } from 'swiper/element/bundle';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App as CapacitorApp } from '@capacitor/app';
import { filter } from 'rxjs/operators';
import { PresenceService } from './services/presence.service';
import { Subscription } from 'rxjs';
import { Language } from './services/language';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { EdgeToEdge } from '@capawesome/capacitor-android-edge-to-edge-support';
import { ThemeService } from './services/theme';
import { FirebaseChatService } from './services/firebase-chat.service';
import { ContactSyncService } from './services/contact-sync.service';
import { Storage } from '@ionic/storage-angular';

const STORAGE_KEY = 'settings.accessibility';

register();

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  private homeRoutes = ['/home-screen', '/home'];
  private appStateListener: any = null;
  private beforeUnloadHandler: any = null;
  private presenceSub?: Subscription;
  private langSub?: Subscription;
  private langSvcSub?: Subscription;

  constructor(
    private networkService: NetworkService,
    private storage: Storage,
    private toastController: ToastController,
    private FirebasePushService: FirebasePushService,
    private FileSystemService: FileSystemService,
    private authService: AuthService,
    private router: Router,
    private platform: Platform,
    private fcmService: FcmService,
    private sqliteService: SqliteService,
    private modalCtrl: ModalController,
    private popoverCtrl: PopoverController,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    private presence: PresenceService,
    private langSvc: Language,
    private translate: TranslateService,
    private zone: NgZone,
    private themeSvc: ThemeService,
    private lang: Language,
    private cd: ChangeDetectorRef,
    private firebaseChatService: FirebaseChatService,
    private contactSyncService: ContactSyncService
  ) {
    this.testStorage();
    this.initializeApp();
    this.applyAccessibilityFromStorage();
    this.NavBar_initialize();
    this.platform.ready().then(() => {
      this.langSvc.init();

      this.langSub = this.translate.onLangChange.subscribe((evt: LangChangeEvent) => {
        this.zone.run(() => {
          this.applyLanguageChange(evt.lang);
        });
      });

      if ((this.langSvc as any).langChanged$) {
        this.langSvcSub = (this.langSvc as any).langChanged$.subscribe((newLang: string) => {
          this.zone.run(() => {
            this.applyLanguageChange(newLang);
          });
        });
      }
    });
  }

  private async testStorage() {
    try {
      const s = await this.storage.create();
      console.log('[testStorage] driver used:', s.driver);
      await s.set('test_key', 'ok');
      console.log('[testStorage] set OK');
      const v = await s.get('test_key');
      console.log('[testStorage] get OK, value:', v);
    } catch (e) {
      console.error('[testStorage] error', e);
    }
  }

  private applyLanguageChange(newLang: string) {
    if (typeof this.langSvc.useLanguage === 'function') {
      this.langSvc.useLanguage(newLang);
    }
    const isRtl = /^(ar|he|fa|ur)/.test(newLang);
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.classList.toggle('rtl', isRtl);
    try {
      this.cd.detectChanges();
    } catch (e) {
      console.warn('CD detect failed', e);
    }
  }

  async NavBar_initialize() {
    await EdgeToEdge.enable();
    await EdgeToEdge.setBackgroundColor({ color: '#ffffff' });
    await StatusBar.setStyle({ style: Style.Light });
  }

  async ngOnInit() {
    this.lang.init();
    this.themeSvc.apply();

    // ✅ 1. Wait for CacheService + FirebaseChatService initialization first
    // try {
    //   console.log("🔄 Initializing cache and Firebase chat service...");
    //   await this.cacheService.ready;
    //   console.log("✅ Ionic storage is ready");

    //   await this.firebaseChatService.init();
    //   await this.firebaseChatService.logCacheContents();
    //   console.log('✅ [AppComponent] CacheService and FirebaseChatService initialized');
    // } catch (e) {
    //   console.warn('❌ [AppComponent] Cache init failed', e);
    // }

    // ✅ 2. Proceed with your existing boot logic
    await this.fcmService.initializePushNotifications();
    await this.sqliteService.init();
    await this.FileSystemService.init();
    await this.platform.ready();
    await this.authService.hydrateAuth();

    // ✅ 3. Initialize Firebase Chat Service with user data AFTER authentication
    if (this.authService.isAuthenticated && this.authService.authData?.userId) {
      try {
        console.log("🔄 Starting contact sync and Firebase chat initialization...");

        // Initialize the Firebase chat service with the current user
        await this.firebaseChatService.initApp(String(this.authService.authData.userId));

        console.log("✅ Firebase chat service and contacts synced successfully!");
      } catch (error) {
        console.error("❌ Error initializing Firebase chat service:", error);
      }
    }

    // ----------------------------
    let fromNotification = false;
    // localStorage.setItem('fromNotification', 'true');
    const navigation = this.router.getCurrentNavigation();
    console.log({ navigation })
    if (navigation?.extras?.state?.['fromNotification']) {
      fromNotification = true;
      // console.log({fromNotification})
    } else if (localStorage.getItem('fromNotification') === 'true') {
      fromNotification = true;
      // console.log({fromNotification})
    }

    console.log("authenticated on not ", this.authService.isAuthenticated)
    if (this.authService.isAuthenticated) {
      if (!fromNotification) {
        this.router.navigateByUrl('/home-screen', { replaceUrl: true });
      }

      const userId = Number(this.authService.authData?.userId);
      if (userId) {
        this.presence.setOnline(userId).subscribe({
          next: () => console.log('✅ Presence: marked online'),
          error: (e) => console.warn('❌ Presence: markOnline error', e),
        });

        try {
          this.appStateListener = CapacitorApp.addListener('appStateChange', (state: any) => {
            if (state.isActive) {
              this.presence.setOnline(userId).subscribe();
            } else {
              this.presence.setOffline(userId).subscribe();
            }
          });
        } catch (e) {
          console.warn('Presence listener error', e);
        }

        this.beforeUnloadHandler = () => {
          try {
            if (navigator && typeof navigator.sendBeacon === 'function') {
              const url = (this.presence as any).api?.baseUrl
                ? `${(this.presence as any).api.baseUrl}/api/users/markuser_offline`
                : null;
              if (url) {
                navigator.sendBeacon(url, JSON.stringify({ user_id: userId }));
              }
            }
          } catch {
          } finally {
            this.presence.setOffline(userId).subscribe();
          }
        };
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
      }
    } else {
      this.router.navigateByUrl('/welcome-screen', { replaceUrl: true });
    }
  }

  private applyAccessibilityFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      const body = document.body;
      body.classList.toggle('accessibility-high-contrast', !!s.increaseContrast);
      body.classList.toggle('accessibility-reduced-motion', !!s.reduceMotion);
      body.classList.toggle('accessibility-large-text', !!s.largeText);
      body.classList.toggle('accessibility-simple-animations', !!s.simpleAnimations);
      body.classList.toggle('accessibility-grayscale', !!s.grayscale);
    } catch (e) {
      console.warn('Could not apply accessibility settings from storage', e);
    }
  }

  async initializeApp() {
    await this.platform.ready();
    this.platform.backButton.subscribeWithPriority(10, async () => {
      if (!this.platform.is('android')) return;
      const currentUrl = this.router.url.split('?')[0];
      if (!this.isHomeRoute(currentUrl)) {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          this.router.navigate(['/home-screen']);
        }
        return;
      }
      const topModal = await this.modalCtrl.getTop();
      if (topModal) {
        await topModal.dismiss();
        return;
      }
      const topPopover = await this.popoverCtrl.getTop();
      if (topPopover) {
        await topPopover.dismiss();
        return;
      }
      const topAction = await this.actionSheetCtrl.getTop();
      if (topAction) {
        await topAction.dismiss();
        return;
      }
      const topAlert = await this.alertCtrl.getTop();
      if (topAlert) {
        await topAlert.dismiss();
        return;
      }
      try {
        await CapacitorApp.exitApp();
      } catch (e) {
        console.error('exitApp failed', e);
      }
    });
  }

  private isHomeRoute(url: string): boolean {
    return this.homeRoutes.includes(url);
  }

  ngOnDestroy() {
    try {
      if (this.appStateListener && typeof this.appStateListener.remove === 'function') {
        this.appStateListener.remove();
      } else if (this.appStateListener && typeof (this.appStateListener as any).cancel === 'function') {
        (this.appStateListener as any).cancel();
      }
    } catch { }
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    this.presenceSub?.unsubscribe();
  }
}