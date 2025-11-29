import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, LoadingController, ToastController, ActionSheetController } from '@ionic/angular';
import { AuthService } from '../../auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ImageCropperModalComponent } from '../../components/image-cropper-modal/image-cropper-modal.component';
import { Subject, takeUntil } from 'rxjs';
import { Router } from '@angular/router';
import { CropResult } from 'src/types';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-setting-profile',
  templateUrl: './setting-profile.page.html',
  styleUrls: ['./setting-profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
})
export class SettingProfilePage implements OnInit, OnDestroy {
  profileImageUrl = 'assets/images/user.jfif';
  isLoadingProfile = false;
  isUpdatingImage = false;

  user = { name: '', about: '', phone: '' };
  currentUserId: number | null = null;

  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024;
  private readonly ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private service: ApiService,
    private modalController: ModalController,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private actionSheetController: ActionSheetController,
    private router: Router,
    private translate: TranslateService
  ) {}

  async ngOnInit() {
    await this.initializeProfile();
  }

  async ionViewWillEnter() {
    await this.initializeProfile();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async initializeProfile() {
    try {
      await this.authService.hydrateAuth();
      const id = this.authService.authData?.userId;
      if (id) this.currentUserId = Number(id);

      if (this.authService.authData) {
        const auth = this.authService.authData;
        this.user = {
          name: auth.name || '',
          about: '.',
          phone: auth.phone_number || ''
        };
        await this.loadUserProfile();
      }
    } catch (error) {
      console.error('Error initializing profile:', error);
      await this.showToast(this.translate.instant('profilePage.toast.loadFailed'), 'danger');
    }
  }

  goToUpdateName() {
    this.router.navigate(['/update-username']);
  }

  goToUpdateStatus() {
    this.router.navigate(['/update-status']);
  }

  async loadUserProfile() {
    const userId = this.authService.authData?.userId;
    if (!userId) return;

    try {
      this.isLoadingProfile = true;

      this.service.getUserProfilebyId(userId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            if (response?.profile || response?.image_url) {
              this.profileImageUrl = response.profile || response.image_url;
            }
            if (response?.name) this.user.name = response.name;
            if (response?.dp_status) this.user.about = response.dp_status;
            this.isLoadingProfile = false;
          },
          error: async () => {
            this.isLoadingProfile = false;
            await this.showToast(this.translate.instant('profilePage.toast.imageLoadFailed'), 'danger');
          }
        });
    } catch (error) {
      console.error('Error in loadUserProfile:', error);
      this.isLoadingProfile = false;
    }
  }

  onImageError() {
    this.profileImageUrl = 'assets/images/user.jfif';
  }

  async editProfileImage() {
    const actionSheet = await this.actionSheetController.create({
      header: this.translate.instant('profilePage.actions.source.header'),
      cssClass: 'custom-action-sheet',
      buttons: [
        {
          text: this.translate.instant('profilePage.actions.source.camera'),
          icon: 'camera',
          handler: () => this.selectImageFromSource(CameraSource.Camera)
        },
        {
          text: this.translate.instant('profilePage.actions.source.gallery'),
          icon: 'images',
          handler: () => this.selectImageFromSource(CameraSource.Photos)
        },
        {
          text: this.translate.instant('profilePage.actions.source.cancel'),
          icon: 'close',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  private async selectImageFromSource(source: CameraSource) {
    try {
      const loading = await this.loadingController.create({
        message: this.translate.instant('profilePage.loading.openingCamera'),
        duration: 5000
      });
      await loading.present();

      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source,
        width: 1000,
        height: 1000
      });

      await loading.dismiss();
      if (image?.webPath) await this.processSelectedImage(image.webPath);
    } catch (error) {
      console.error('Error selecting image:', error);
      await this.showToast(this.translate.instant('profilePage.toast.selectFailed'), 'danger');
    }
  }

  private async processSelectedImage(imagePath: string) {
    try {
      const loading = await this.loadingController.create({
        message: this.translate.instant('profilePage.loading.processing'),
        duration: 10000
      });
      await loading.present();

      const response = await fetch(imagePath);
      const blob = await response.blob();

      await loading.dismiss();

      const validationError = this.validateImageBlob(blob);
      if (validationError) {
        await this.showToast(validationError, 'danger');
        return;
      }

      const dataUrl = await this.blobToDataURL(blob);
      await this.openImageCropper(dataUrl, blob);
    } catch (error) {
      console.error('Error processing image:', error);
      await this.showToast(this.translate.instant('profilePage.toast.processFailed'), 'danger');
    }
  }

  private validateImageBlob(blob: Blob): string | null {
    if (blob.size > this.MAX_FILE_SIZE) {
      return this.translate.instant('profilePage.validation.size');
    }
    if (!this.ALLOWED_IMAGE_TYPES.includes(blob.type)) {
      return this.translate.instant('profilePage.validation.type');
    }
    return null;
  }

  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
      reader.readAsDataURL(blob);
    });
  }

  private async openImageCropper(imageUrl: string, originalBlob: Blob) {
    const modal = await this.modalController.create({
      component: ImageCropperModalComponent,
      componentProps: {
        imageUrl,
        aspectRatio: 1,
        cropQuality: 0.9
      },
      cssClass: 'image-cropper-modal',
      backdropDismiss: false
    });

    await modal.present();
    const { data } = await modal.onDidDismiss<CropResult>();

    if (data?.success && data.croppedImage && data.originalBlob) {
      await this.updateProfileImage(data.originalBlob, data.croppedImage);
    } else if (data?.error) {
      await this.showToast(data.error, 'danger');
    }
  }

  private async updateProfileImage(croppedBlob: Blob, croppedImageUrl: string) {
    if (!this.currentUserId) {
      await this.showToast(this.translate.instant('profilePage.toast.noUser'), 'danger');
      return;
    }

    try {
      this.isUpdatingImage = true;
      const loading = await this.loadingController.create({
        message: this.translate.instant('profilePage.loading.updating'),
        backdropDismiss: false
      });
      await loading.present();

      const file = new File([croppedBlob], `profile_${Date.now()}.jpg`, { type: croppedBlob.type });

      this.service.updateUserDp(this.currentUserId, file)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async () => {
            this.profileImageUrl = croppedImageUrl;
            await loading.dismiss();
            await this.showToast(this.translate.instant('profilePage.toast.updated'), 'success');
            this.isUpdatingImage = false;
          },
          error: async () => {
            await loading.dismiss();
            await this.showToast(this.translate.instant('profilePage.toast.updateFailed'), 'danger');
            this.isUpdatingImage = false;
          }
        });
    } catch (error) {
      console.error('Error in updateProfileImage:', error);
      await this.showToast(this.translate.instant('profilePage.toast.updateFailed'), 'danger');
      this.isUpdatingImage = false;
    }
  }

  private async showToast(message: string, color: 'danger' | 'success' | 'dark' = 'dark') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
      buttons: [{ text: this.translate.instant('common.ok'), role: 'cancel' }]
    });
    await toast.present();
  }

  addLinks() {
    this.router.navigate(['/social-media-links']);
  }

  get displayImageUrl(): string {
    if (this.isLoadingProfile || this.isUpdatingImage) return 'assets/images/user.jfif';
    return this.profileImageUrl;
  }

  get isImageLoading(): boolean {
    return this.isLoadingProfile || this.isUpdatingImage;
  }
}
