import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  Database,
  get,
  getDatabase,
  onValue,
  ref,
  set,
} from '@angular/fire/database';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonicModule,
  LoadingController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { Observable, Subject, takeUntil } from 'rxjs';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { FcmService } from 'src/app/services/fcm-service';
import { environment } from 'src/environments/environment.prod';
import { CropResult } from 'src/types';
import { SecureStorageService } from '../../services/secure-storage/secure-storage.service';
import { ImageCropperModalComponent } from '../image-cropper-modal/image-cropper-modal.component';
import { EmojiPickerModalComponent } from '../emoji-picker-modal/emoji-picker-modal.component';

@Component({
  selector: 'app-profile-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, HttpClientModule],
  templateUrl: './profile-setup.page.html',
  styleUrls: ['./profile-setup.page.scss'],
})
export class ProfileSetupPage implements OnInit, OnDestroy {
  // Form data
  name: string = '';
  imageData: string | null = null;
  selectedFile: File | null = null;
  phoneNumber: string = '';
  userID: string = '';

  // UI state
  maxLength = 25;
  remainingCount = this.maxLength;
  isSubmitting: boolean = false;
  isLoadingProfile: boolean = false;

  // Constants
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  // Cleanup
  private destroy$ = new Subject<void>();

  constructor(
    private toastController: ToastController,
    private router: Router,
    private http: HttpClient,
    private secureStorage: SecureStorageService,
    private db: Database,
    private authService: AuthService,
    private fcmService: FcmService,
    private service: ApiService,
    private modalController: ModalController,
    private modalCtrl: ModalController,
    private loadingController: LoadingController
  ) {}

  async ngOnInit() {
    await this.initializeProfileData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize profile data from auth service and API
   */
  private async initializeProfileData() {
    const storedPhone = this.authService.authData?.userId;

    if (!storedPhone) {
      await this.showToast(
        'Phone number is missing, please login again.',
        'danger'
      );
      this.router.navigateByUrl('/login-screen');
      return;
    }

    this.userID = storedPhone;
    this.phoneNumber = this.authService.authData?.phone_number || storedPhone;

    // Update remaining count for name field
    this.updateRemainingCount();

    await this.loadUserProfile();
  }

  /**
   * Load user profile from API
   */
  private async loadUserProfile() {
    this.isLoadingProfile = true;

    this.service
      .getUserProfilebyId(this.userID)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          //console.log("Profile API response:", res);
          this.populateProfileData(res);
          this.isLoadingProfile = false;
        },
        error: (err) => {
          console.error('Error fetching profile:', err);
          this.showToast('Failed to load profile details.', 'danger');
          this.isLoadingProfile = false;
        },
      });
  }

  /**
   * Populate form with profile data from API
   */
  private populateProfileData(profileData: any) {
    if (profileData) {
      this.name = profileData.name || '';
      this.imageData = profileData.profile || null;
      this.phoneNumber = profileData.phone_number || this.phoneNumber;

      // Update remaining count after setting name
      this.updateRemainingCount();

      // Store public key if available
      if (profileData.publicKeyHex) {
        this.secureStorage.setItem('publicKeyHex', profileData.publicKeyHex);
      }
    }
  }

  /**
   * Handle image selection with validation and cropping
   */
  async onImageSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    // Reset input value to allow selecting the same file again
    target.value = '';

    // Validate file
    const validationError = this.validateImageFile(file);
    if (validationError) {
      await this.showToast(validationError, 'danger');
      return;
    }

    try {
      // Show loading
      const loading = await this.loadingController.create({
        message: 'Processing image...',
        duration: 10000,
      });
      await loading.present();

      // Convert file to data URL
      const imageUrl = await this.fileToDataURL(file);
      await loading.dismiss();

      // Open cropper modal
      await this.openImageCropper(imageUrl, file);
    } catch (error) {
      console.error('Error processing image:', error);
      await this.showToast(
        'Error processing image. Please try again.',
        'danger'
      );
    }
  }

  /**
   * Validate image file
   */
  private validateImageFile(file: File): string | null {
    if (file.size > this.MAX_FILE_SIZE) {
      return 'Image size should be less than 5MB';
    }

    if (!this.ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return 'Please select a valid image file (JPEG, PNG, WebP)';
    }

    return null;
  }

  /**
   * Convert file to data URL
   */
  private fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Open image cropper modal
   */
  private async openImageCropper(imageUrl: string, originalFile: File) {
    const modal = await this.modalController.create({
      component: ImageCropperModalComponent,
      componentProps: {
        imageUrl: imageUrl,
        aspectRatio: 1, // Square crop for profile picture
        cropQuality: 0.9,
      },
      cssClass: 'image-cropper-modal',
      backdropDismiss: false,
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<CropResult>();

    if (data?.success && data.croppedImage && data.originalBlob) {
      // Set cropped image
      this.imageData = data.croppedImage;

      // Create File object from cropped blob
      this.selectedFile = new File(
        [data.originalBlob],
        this.generateFileName(originalFile.name),
        {
          type: data.originalBlob.type,
          lastModified: Date.now(),
        }
      );

      await this.showToast('Image cropped successfully!', 'success');
    } else if (data?.error) {
      await this.showToast(data.error, 'danger');
    }
    // If cancelled, do nothing
  }

  /**
   * Generate unique filename for cropped image
   */
  private generateFileName(originalName: string): string {
    const timestamp = Date.now();
    const extension = originalName.split('.').pop() || 'jpg';
    return `cropped_profile_${timestamp}.${extension}`;
  }

 async openEmojiKeyboard() {
    try {
      const modal = await this.modalCtrl.create({
        component: EmojiPickerModalComponent,
        cssClass: 'emoji-picker-modal',
        breakpoints: [0, 0.5, 0.75, 1],
        initialBreakpoint: 0.75,
        backdropDismiss: true,
      });

      await modal.present();

      const { data } = await modal.onDidDismiss();

      if (data && data.selected && data.emoji) {
        console.log('✅ Emoji selected:', data.emoji);
        
        // Add emoji to the name input
        const currentName = this.name || '';
        const newName = currentName + data.emoji;
        
        // Check if adding emoji exceeds max length
        if (newName.length <= this.maxLength) {
          this.name = newName;
          this.updateRemainingCount();
          
          // Show success toast
          const toast = await this.toastController.create({
            message: `Emoji added: ${data.emoji}`,
            duration: 1500,
            color: 'success',
            position: 'bottom',
          });
          await toast.present();
        } else {
          // Show warning if max length exceeded
          await this.showToast(
            'Cannot add emoji. Character limit reached!',
            'danger'
          );
        }
      }
    } catch (error) {
      console.error('❌ Error opening emoji picker:', error);
      
      const toast = await this.toastController.create({
        message: 'Failed to open emoji picker',
        duration: 2000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    }
  }


  /**
   * Handle input change and update character count
   */
  onInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target.value || '';

    // Trim to max length
    if (value.length > this.maxLength) {
      const trimmedValue = value.slice(0, this.maxLength);
      target.value = trimmedValue;
      this.name = trimmedValue;
    } else {
      this.name = value;
    }

    this.updateRemainingCount();
  }

  /**
   * Update remaining character count
   */
  private updateRemainingCount() {
    this.remainingCount = this.maxLength - (this.name?.length || 0);
  }

  /**
   * Show toast notification
   */
  async showToast(
    message: string,
    color: 'danger' | 'success' | 'dark' = 'dark'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    await toast.present();
  }

  /**
   * Validate form before submission
   */
  private validateForm(): string | null {
    if (!this.name?.trim()) {
      return 'Please enter your name';
    }

    if (this.name.trim().length < 2) {
      return 'Name should be at least 2 characters long';
    }

    return null;
  }

  /**
   * Submit profile data
   */
  async onSubmit() {
    // Validate form
    const validationError = this.validateForm();
    if (validationError) {
      await this.showToast(validationError, 'danger');
      return;
    }

    if (this.isSubmitting) return;

    this.isSubmitting = true;

    // Show loading
    const loading = await this.loadingController.create({
      message: 'Setting up your profile...',
      backdropDismiss: false,
    });
    await loading.present();

    try {
      // Prepare form data
      const formData = this.prepareFormData();

      // Submit to API
      await this.submitProfileData(formData);

      // Save additional data
      await this.saveAdditionalData();

      // Navigate based on user rooms
      await this.handleNavigation();

      await loading.dismiss();
      await this.showToast('Profile setup completed successfully!', 'success');
    } catch (error) {
      await loading.dismiss();
      console.error('Error submitting profile:', error);
      await this.showToast(
        'Failed to save profile. Please try again.',
        'danger'
      );
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * Prepare form data for API submission
   */
  private prepareFormData(): FormData {
    const formData = new FormData();
    formData.append('user_id', this.userID);
    formData.append('name', this.name.trim());

    if (this.selectedFile) {
      formData.append(
        'profile_picture',
        this.selectedFile,
        this.selectedFile.name
      );
    }

    return formData;
  }

  /**
   * Submit profile data to API
   */
  private async submitProfileData(formData: FormData): Promise<void> {
    await this.http
      .post(`${environment.apiBaseUrl}/api/users`, formData)
      .toPromise();
  }

  private async saveAdditionalData(): Promise<void> {
  try {
    const db = getDatabase();
    const userRef = ref(db, `users/${this.userID}`);

    const snapshot = await get(userRef);
    let finalFcmToken: string | null = null;

    //console.log('🔄 Refreshing FCM token for user:', this.userID);
    
    try {
      await this.fcmService.updateFcmToken(this.userID);
      console.log("updating fcm token",this.fcmService.updateFcmToken(this.userID));
      finalFcmToken = this.fcmService.getFcmToken();
      console.log("final fcm token", finalFcmToken);
      
      if (!finalFcmToken) {
        console.warn('⚠️ No token after refresh, retrying...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.fcmService.updateFcmToken(this.userID);
        finalFcmToken = this.fcmService.getFcmToken();
      }
    } catch (error) {
      console.error('❌ Error refreshing FCM token:', error);
    }

    if (!snapshot.exists()) {
      console.log('📝 New user - saving complete profile');
      await this.fcmService.saveFcmTokenToDatabase(
        this.userID,
        this.name,
        this.phoneNumber
      );
    } else {
      console.log('🔄 Existing user - updating profile');
      await set(ref(db, `users/${this.userID}/name`), this.name);
      await set(ref(db, `users/${this.userID}/lastActive`), new Date().toISOString());
    }

    if (finalFcmToken) {
      const UserId = Number(this.userID);
      if (!Number.isNaN(UserId)) {
        this.service.pushFcmToAdmin(UserId, finalFcmToken).subscribe({
          next: (res) => {
            console.log('✅ FCM token sent to admin API');
          },
          error: (err) => {
            console.error('❌ Failed to send token to admin API:', err);
          },
        });
      }
    } else {
      console.warn('⚠️ No FCM token available after all retries');
    }

    await this.authService.updateUserName(this.name);
    if (this.imageData) {
      await this.secureStorage.setItem('profile_url', this.imageData);
    }

    console.log('✅ Profile data saved successfully');
  } catch (error) {
    console.error('❌ Error saving additional data:', error);
    throw error;
  }
}

  private async handleNavigation(): Promise<void> {
  await this.router.navigateByUrl('/home-screen', { replaceUrl: true });
}

  /**
   * Check if form is valid for submission
   */
  get isFormValid(): boolean {
    return !!(this.name?.trim() && this.name.trim().length >= 2);
  }

  /**
   * Get profile image source
   */
  get profileImageSrc(): string {
    return this.imageData || 'assets/images/cameraplus.png';
  }
}
