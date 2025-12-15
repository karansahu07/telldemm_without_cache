import { Component, OnInit, OnDestroy } from '@angular/core';
import { IonicModule, NavController, ModalController, LoadingController, ToastController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ApiService } from 'src/app/services/api/api.service';
import { ImageCropperModalComponent } from '../../components/image-cropper-modal/image-cropper-modal.component';
import { Subject, takeUntil } from 'rxjs';
import { CropResult } from 'src/types';

@Component({
  selector: 'app-profile-dp-view',
  templateUrl: './profile-dp-view.page.html',
  styleUrls: ['./profile-dp-view.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ProfileDpViewPage implements OnInit, OnDestroy {
  imageUrl: string = 'assets/images/user.jfif';
  isGroup: boolean = false;
  showEditModal: boolean = false;
  isUpdatingImage: boolean = false;
  
  // Group related properties
  groupId: number | null = null;
  firebaseGroupId: string | null = null;

  // Constants for validation
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  
  // Cleanup subject
  private destroy$ = new Subject<void>();

  constructor(
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private modalController: ModalController,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private service: ApiService
  ) {}

  ngOnInit() {
    this.initializePageData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize page data from route parameters
   */
  // private initializePageData() {
  //   try {
  //     // Get image URL from query params
  //     this.imageUrl = this.route.snapshot.queryParamMap.get('image') || this.imageUrl;

  //     // Check if it's a group
  //     const isGroupParam = this.route.snapshot.queryParamMap.get('isGroup');
  //     this.isGroup = isGroupParam === 'true';

  //     // Get group IDs
  //     const gid = this.route.snapshot.queryParamMap.get('group_id');
  //     const fid = this.route.snapshot.queryParamMap.get('receiverId');
      
  //     if (gid) this.groupId = +gid;
  //     if (fid) this.firebaseGroupId = fid;

  //     //console.log('Page initialized with:', {
  //       imageUrl: this.imageUrl,
  //       isGroup: this.isGroup,
  //       groupId: this.groupId,
  //       firebaseGroupId: this.firebaseGroupId
  //     });

  //   } catch (error) {
  //     console.error('Error initializing page data:', error);
  //     this.showToast('Failed to load page data', 'danger');
  //   }
  // }

  private initializePageData() {
  try {
    // Get image URL from query params
    this.imageUrl = this.route.snapshot.queryParamMap.get('image') || this.imageUrl;

    // Check if it's a group
    const isGroupParam = this.route.snapshot.queryParamMap.get('isGroup');
    this.isGroup = isGroupParam === 'true';

    // Get IDs
    this.groupId = this.route.snapshot.queryParamMap.get('groupId')
      ? +this.route.snapshot.queryParamMap.get('groupId')!
      : null;

    this.firebaseGroupId = this.route.snapshot.queryParamMap.get('receiverId');

    //console.log('Page initialized with:', {
      // imageUrl: this.imageUrl,
      // isGroup: this.isGroup,
      // groupId: this.groupId,
      // firebaseGroupId: this.firebaseGroupId
    // });

  } catch (error) {
    console.error('Error initializing page data:', error);
    this.showToast('Failed to load page data', 'danger');
  }
}


  /**
   * Edit profile picture - show modal for groups only
   */
  editProfileDp() {
    if (!this.isGroup) {
      this.showToast('Edit option only available for groups', 'warning');
      return;
    }

    if (this.isUpdatingImage) {
      this.showToast('Please wait, image is being updated...', 'warning');
      return;
    }

    this.showEditModal = true;
  }

  /**
   * Close the edit modal
   */
  closeEditModal() {
    this.showEditModal = false;
  }

  /**
   * Handle option selection from modal
   */
  async pickOption(option: string) {
    //console.log('Selected option:', option);
    
    // Close modal first
    this.closeEditModal();

    // Handle different options
    switch (option) {
      case 'camera':
        await this.selectImageFromSource(CameraSource.Camera);
        break;
        
      case 'gallery':
        await this.selectImageFromSource(CameraSource.Photos);
        break;
        
      case 'emoji':
        await this.showToast('Emoji & Stickers option coming soon!', 'dark');
        break;
        
      case 'ai-images':
        await this.showToast('AI Images option coming soon!', 'dark');
        break;
        
      case 'search-web':
        await this.showToast('Search Web option coming soon!', 'dark');
        break;
        
      default:
        console.warn('Unknown option selected:', option);
        await this.showToast('Unknown option selected', 'warning');
    }
  }

  /**
   * Select image from camera or gallery
   */
  private async selectImageFromSource(source: CameraSource) {
    if (this.isUpdatingImage) {
      await this.showToast('Please wait for current operation to complete', 'warning');
      return;
    }

    try {
      const sourceText = source === CameraSource.Camera ? 'camera' : 'gallery';
      
      // Show loading
      const loading = await this.loadingController.create({
        message: `Opening ${sourceText}...`,
        duration: 5000
      });
      await loading.present();

      // Get image from camera/gallery
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false, // We'll handle cropping with our modal
        resultType: CameraResultType.Uri,
        source: source,
        width: 1000,
        height: 1000
      });

      await loading.dismiss();

      if (image?.webPath) {
        await this.processSelectedImage(image.webPath);
      } else {
        await this.showToast('No image selected', 'warning');
      }

    } catch (error) {
      console.error('Error selecting image:', error);
      
      // Handle user cancellation gracefully
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message?.toLowerCase() || '';
        if (errorMessage.includes('cancelled') || errorMessage.includes('cancel')) {
          return; // Don't show error toast for user cancellation
        }
      }
      
      await this.showToast('Failed to select image. Please try again.', 'danger');
    }
  }

  /**
   * Process selected image and open cropper modal
   */
  private async processSelectedImage(imagePath: string) {
    try {
      // Show processing message
      const loading = await this.loadingController.create({
        message: 'Processing image...',
        duration: 10000
      });
      await loading.present();

      // Convert image to blob for validation
      const response = await fetch(imagePath);
      const blob = await response.blob();
      
      await loading.dismiss();

      // Validate the image
      const validationError = this.validateImageBlob(blob);
      if (validationError) {
        await this.showToast(validationError, 'danger');
        return;
      }

      // Convert to data URL for the cropper
      const dataUrl = await this.blobToDataURL(blob);
      
      // Open image cropper modal
      await this.openImageCropper(dataUrl, blob);

    } catch (error) {
      console.error('Error processing image:', error);
      await this.showToast('Error processing image. Please try again.', 'danger');
    }
  }

  /**
   * Validate image blob
   */
  private validateImageBlob(blob: Blob): string | null {
    // Check file size
    if (blob.size > this.MAX_FILE_SIZE) {
      return 'Image size should be less than 5MB';
    }

    // Check file type
    if (!this.ALLOWED_IMAGE_TYPES.includes(blob.type)) {
      return 'Please select a valid image file (JPEG, PNG, WebP)';
    }

    return null; // Valid
  }

  /**
   * Convert blob to data URL
   */
  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to convert image'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Open image cropper modal
   */
  private async openImageCropper(imageUrl: string, originalBlob: Blob) {
    const modal = await this.modalController.create({
      component: ImageCropperModalComponent,
      componentProps: {
        imageUrl: imageUrl,
        aspectRatio: 1, // Square crop for group pictures
        cropQuality: 0.9
      },
      cssClass: 'image-cropper-modal',
      backdropDismiss: false
    });

    await modal.present();

    // Wait for modal result
    const { data } = await modal.onDidDismiss<CropResult>();
    
    if (data?.success && data.croppedImage && data.originalBlob) {
      // Update group image with cropped version
      await this.updateGroupImage(data.originalBlob, data.croppedImage);
    } else if (data?.error) {
      await this.showToast(data.error, 'danger');
    }
    // If cancelled, do nothing
  }

  /**
   * Update group image on server
   */
  private async updateGroupImage(croppedBlob: Blob, croppedImageUrl: string) {
    //console.log("group id is:",this.groupId);
    //console.log("group id is:",this.firebaseGroupId);
    if (!this.firebaseGroupId) {
      await this.showToast('Group information missing', 'danger');
      return;
    }

    try {
      this.isUpdatingImage = true;

      // Show loading indicator
      const loading = await this.loadingController.create({
        message: 'Updating group picture...',
        backdropDismiss: false
      });
      await loading.present();

      // Create file from cropped blob
      const file = new File([croppedBlob], `group_dp_${Date.now()}.jpg`, { 
        type: croppedBlob.type 
      });

      // Call API to update group picture
      this.service.updateGroupDp(this.groupId, this.firebaseGroupId, file)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async (response) => {
            //console.log('Group DP updated successfully:', response);
            
            // Update local image immediately for better UX
            this.imageUrl = croppedImageUrl;
            
            await loading.dismiss();
            await this.showToast('Group picture updated successfully!', 'success');
            this.isUpdatingImage = false;
          },
          error: async (error) => {
            console.error('Error updating group picture:', error);
            await loading.dismiss();
            
            let errorMessage = 'Failed to update group picture';
            if (error?.error?.message) {
              errorMessage = error.error.message;
            }
            
            await this.showToast(errorMessage, 'danger');
            this.isUpdatingImage = false;
          }
        });

    } catch (error) {
      console.error('Error in updateGroupImage:', error);
      await this.showToast('Failed to update group picture', 'danger');
      this.isUpdatingImage = false;
    }
  }

  /**
   * Show toast notification
   */
  private async showToast(message: string, color: 'danger' | 'success' | 'warning' | 'dark' = 'dark') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
      buttons: [
        {
          text: 'OK',
          role: 'cancel'
        }
      ]
    });
    await toast.present();
  }

  /**
   * Handle image loading error
   */
  onImageError() {
    console.warn('Image failed to load, using fallback');
    this.imageUrl = 'assets/images/user.jfif';
  }

  /**
   * Navigate back to previous page
   */
  closePage() {
    this.navCtrl.back();
  }

  /**
   * Legacy method for backward compatibility
   * (Not used in new implementation but kept for reference)
   */
  private dataURLtoFile(dataUrl: string, filename: string): File {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || '';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new File([u8arr], filename, { type: mime });
  }

  // Getter methods for template
  get canEditImage(): boolean {
    return this.isGroup && !this.isUpdatingImage;
  }

  get isImageLoading(): boolean {
    return this.isUpdatingImage;
  }
}