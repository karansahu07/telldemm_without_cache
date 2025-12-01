import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';

@Component({
  selector: 'app-image-cropper-modal',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './image-cropper-modal.component.html',
  styleUrls: ['./image-cropper-modal.component.scss']
})
export class ImageCropperModalComponent implements OnInit, OnDestroy {
  @Input() imageUrl: string = '';
  @Input() aspectRatio: number = 1; 
  @Input() cropQuality: number = 0.9;

  @ViewChild('imageElement', { static: false }) imageElementRef!: ElementRef<HTMLImageElement>;

  showCropArea = false;
  cropArea = { x: 0, y: 0, width: 0, height: 0 };
  isDragging = false;
  isResizing = false;
  resizeDirection = '';
  startPos = { x: 0, y: 0 };
  initialCropState = { x: 0, y: 0, width: 0, height: 0 }; 
  imageElement: HTMLImageElement | null = null;
  imageContainer: HTMLElement | null = null;

  // Touch support (FIXED: Declared here as class properties)
  private touchStartTime = 0;
  private lastTouchEnd = 0; 
  
  // Animation frame for smooth rendering
  private animationFrameId: number | null = null;
  private pendingUpdate = false;
  private pendingPosition = { x: 0, y: 0 };

  // Bound event handlers (for proper removal)
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  private boundContextMenu: (e: Event) => void;

  constructor(
    private modalController: ModalController,
    private cdr: ChangeDetectorRef
  ) {
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundTouchMove = this.onTouchMove.bind(this);
    this.boundTouchEnd = this.onTouchEnd.bind(this);
    this.boundContextMenu = this.preventContextMenu.bind(this);
  }

  ngOnInit() {
    this.addEventListeners();
  }

  ngOnDestroy() {
    this.removeEventListeners();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  // --- Event Listeners Setup/Teardown ---
  private addEventListeners() {
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd);
    document.addEventListener('contextmenu', this.boundContextMenu);
  }

  private removeEventListeners() {
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
    document.removeEventListener('touchmove', this.boundTouchMove);
    document.removeEventListener('touchend', this.boundTouchEnd);
    document.removeEventListener('contextmenu', this.boundContextMenu);
  }

  private preventContextMenu(event: Event) {
    event.preventDefault();
  }
  // ------------------------------------

  onImageLoad() {
    this.showCropArea = true;
    this.imageElement = this.imageElementRef.nativeElement;
    this.imageContainer = this.imageElement.parentElement;

    if (this.imageElement && this.imageContainer) {
      this.initializeCropArea();
    }
  }

  initializeCropArea() {
    const img = this.imageElement!;
    const imgWidth = img.clientWidth;
    const imgHeight = img.clientHeight;

    const maxDim = Math.min(imgWidth, imgHeight) * 0.8;
    
    let cropWidth, cropHeight;

    if (this.aspectRatio > 0 && this.aspectRatio !== 1) {
        if (imgWidth / imgHeight > this.aspectRatio) {
            cropHeight = maxDim;
            cropWidth = cropHeight * this.aspectRatio;
        } else {
            cropWidth = maxDim;
            cropHeight = cropWidth / this.aspectRatio;
        }
    } else {
        cropWidth = maxDim;
        cropHeight = maxDim;
    }

    cropWidth = Math.min(cropWidth, imgWidth);
    cropHeight = Math.min(cropHeight, imgHeight);

    const cropX = (imgWidth - cropWidth) / 2;
    const cropY = (imgHeight - cropHeight) / 2;

    this.cropArea = {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight
    };

    this.initialCropState = { ...this.cropArea };
    this.cdr.detectChanges();
  }

  // --- Interaction Start ---
  startDrag(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    this.isDragging = true;

    // FIX 1: Correctly determine clientX and clientY based on event type
    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

    const containerRect = this.imageContainer!.getBoundingClientRect();

    this.startPos = {
      x: clientX - containerRect.left - this.cropArea.x,
      y: clientY - containerRect.top - this.cropArea.y
    };

    this.initialCropState = { ...this.cropArea };
  }

  startResize(event: MouseEvent | TouchEvent, direction: string) {
    event.stopPropagation();
    event.preventDefault();

    this.isResizing = true;
    this.resizeDirection = direction;

    // FIX 2: Correctly determine clientX and clientY based on event type
    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

    this.startPos = { x: clientX, y: clientY };
    this.initialCropState = { ...this.cropArea };
  }
  // -------------------------

  // --- Interaction Move (Smoother with RAF) ---
  onMouseMove(event: MouseEvent) {
    if (this.isDragging || this.isResizing) {
      this.scheduleUpdate(event.clientX, event.clientY);
    }
  }

  onTouchMove(event: TouchEvent) {
    event.preventDefault();
    if ((this.isDragging || this.isResizing) && event.touches.length === 1) {
      this.scheduleUpdate(event.touches[0].clientX, event.touches[0].clientY);
    }
  }

  private scheduleUpdate(clientX: number, clientY: number) {
    this.pendingPosition = { x: clientX, y: clientY };

    if (!this.pendingUpdate) {
      this.pendingUpdate = true;
      this.animationFrameId = requestAnimationFrame(() => {
        this.handleMove(this.pendingPosition.x, this.pendingPosition.y);
        this.cdr.detectChanges();
        this.pendingUpdate = false;
        this.animationFrameId = null;
      });
    }
  }

  private handleMove(clientX: number, clientY: number) {
    if (!this.imageElement || !this.imageContainer) return;

    const containerRect = this.imageContainer.getBoundingClientRect();
    const relativeX = clientX - containerRect.left;
    const relativeY = clientY - containerRect.top;

    if (this.isDragging) {
      this.handleDrag(relativeX, relativeY);
    } else if (this.isResizing) {
      this.handleResize(clientX, clientY);
    }
  }
  // --------------------------------------------

  private handleDrag(relativeX: number, relativeY: number) {
    const newX = relativeX - this.startPos.x;
    const newY = relativeY - this.startPos.y;

    const rect = this.imageElement!.getBoundingClientRect();
    const imageWidth = rect.width;
    const imageHeight = rect.height;

    const maxX = imageWidth - this.cropArea.width;
    const maxY = imageHeight - this.cropArea.height;

    this.cropArea.x = Math.max(0, Math.min(newX, maxX));
    this.cropArea.y = Math.max(0, Math.min(newY, maxY));
  }

  private handleResize(clientX: number, clientY: number) {
    if (!this.imageElement) return;

    const deltaX = clientX - this.startPos.x;
    const deltaY = clientY - this.startPos.y;

    let newWidth = this.initialCropState.width;
    let newHeight = this.initialCropState.height;
    let newX = this.initialCropState.x;
    let newY = this.initialCropState.y;

    const minSize = 50;
    const rect = this.imageElement.getBoundingClientRect();
    const maxWidth = rect.width;
    const maxHeight = rect.height;

    // --- Free Transform Logic ---
    switch (this.resizeDirection) {
      case 'top-left':
        newWidth = this.initialCropState.width - deltaX;
        newHeight = this.initialCropState.height - deltaY;
        newX = this.initialCropState.x + deltaX;
        newY = this.initialCropState.y + deltaY;
        break;

      case 'top-right':
        newWidth = this.initialCropState.width + deltaX;
        newHeight = this.initialCropState.height - deltaY;
        newY = this.initialCropState.y + deltaY;
        break;

      case 'bottom-left':
        newWidth = this.initialCropState.width - deltaX;
        newHeight = this.initialCropState.height + deltaY;
        newX = this.initialCropState.x + deltaX;
        break;

      case 'bottom-right':
        newWidth = this.initialCropState.width + deltaX;
        newHeight = this.initialCropState.height + deltaY;
        break;
    }

    // --- Clamping and Min Size Check ---
    
    // Clamp width and x
    if (newWidth < minSize) {
        newWidth = minSize;
        if (this.resizeDirection.includes('left')) {
            newX = this.initialCropState.x + this.initialCropState.width - minSize;
        }
    }
    if (newX < 0) {
        newWidth += newX; // Reduce width
        newX = 0;
    }
    if (newX + newWidth > maxWidth) {
        newWidth = maxWidth - newX;
    }

    // Clamp height and y
    if (newHeight < minSize) {
        newHeight = minSize;
        if (this.resizeDirection.includes('top')) {
            newY = this.initialCropState.y + this.initialCropState.height - minSize;
        }
    }
    if (newY < 0) {
        newHeight += newY; // Reduce height
        newY = 0;
    }
    if (newY + newHeight > maxHeight) {
        newHeight = maxHeight - newY;
    }

    // Re-check min size after boundary adjustments
    newWidth = Math.max(minSize, newWidth);
    newHeight = Math.max(minSize, newHeight);

    this.cropArea = {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight
    };
  }

  // --- Interaction End ---
  onMouseUp() {
    this.stopInteraction();
  }

  onTouchEnd(event: TouchEvent) {
    this.stopInteraction();

    const now = Date.now();
    // FIX 3: lastTouchEnd is now a property of the class and can be accessed via 'this'
    if (now - this.lastTouchEnd <= 300) { event.preventDefault(); }
    this.lastTouchEnd = now;
  }

  private stopInteraction() {
    this.isDragging = false;
    this.isResizing = false;
    this.resizeDirection = '';

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.pendingUpdate = false;
    this.cdr.detectChanges();
  }
  // -----------------------

  // --- Image Processing & Modal Control ---
  async cropImage() {
    if (!this.imageElement) {
      this.showError('Image not loaded properly');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        this.showError('Canvas not supported');
        return;
      }

      canvas.width = this.cropArea.width;
      canvas.height = this.cropArea.height;

      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          try {
            const displayedWidth = this.imageElement!.clientWidth;
            const displayedHeight = this.imageElement!.clientHeight;
            const scaleX = img.naturalWidth / displayedWidth;
            const scaleY = img.naturalHeight / displayedHeight;

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(
              img,
              this.cropArea.x * scaleX,
              this.cropArea.y * scaleY,
              this.cropArea.width * scaleX,
              this.cropArea.height * scaleY,
              0,
              0,
              this.cropArea.width,
              this.cropArea.height
            );

            resolve();
          } catch (error) {
            reject(error);
          }
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = this.imageUrl;
      });

      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            this.modalController.dismiss({
              success: true,
              croppedImage: reader.result,
              originalBlob: blob,
              cropArea: this.cropArea
            });
          };
          reader.readAsDataURL(blob);
        } else {
          this.showError('Failed to create image blob');
        }
      }, 'image/jpeg', this.cropQuality);

    } catch (error) {
      console.error('Error cropping image:', error);
      this.showError('Failed to crop image. Please try again.');
    }
  }

  private showError(message: string) {
    this.modalController.dismiss({
      success: false,
      error: message
    });
  }

  cancel() {
    this.modalController.dismiss({
      success: false,
      cancelled: true
    });
  }

  resetCropArea() {
    if (this.imageElement) {
      this.initializeCropArea();
    }
  }
}