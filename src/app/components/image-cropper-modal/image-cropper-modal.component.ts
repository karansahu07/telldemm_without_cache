import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
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
  @Input() aspectRatio: number = 1; // 1:1 for square, 16/9 for widescreen, etc.
  @Input() cropQuality: number = 0.9; // JPEG quality (0.1 - 1.0)
  
  @ViewChild('imageElement', { static: false }) imageElementRef!: ElementRef<HTMLImageElement>;
  
  showCropArea = false;
  cropArea = { x: 50, y: 50, width: 200, height: 200 };
  isDragging = false;
  isResizing = false;
  resizeDirection = '';
  startPos = { x: 0, y: 0 };
  imageElement: HTMLImageElement | null = null;
  imageContainer: HTMLElement | null = null;
  
  // Touch support
  private touchStartTime = 0;
  private lastTouchEnd = 0;
  
  constructor(private modalController: ModalController) {}
  
  ngOnInit() {
    this.addEventListeners();
  }
  
  ngOnDestroy() {
    this.removeEventListeners();
  }
  
  private addEventListeners() {
    // Mouse events
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
    
    // Touch events
    document.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.onTouchEnd.bind(this));
    
    // Prevent context menu on long press
    document.addEventListener('contextmenu', this.preventContextMenu.bind(this));
  }
  
  private removeEventListeners() {
    document.removeEventListener('mousemove', this.onMouseMove.bind(this));
    document.removeEventListener('mouseup', this.onMouseUp.bind(this));
    document.removeEventListener('touchmove', this.onTouchMove.bind(this));
    document.removeEventListener('touchend', this.onTouchEnd.bind(this));
    document.removeEventListener('contextmenu', this.preventContextMenu.bind(this));
  }
  
  private preventContextMenu(event: Event) {
    event.preventDefault();
  }
  
  onImageLoad() {
    this.showCropArea = true;
    this.imageElement = this.imageElementRef.nativeElement;
    this.imageContainer = this.imageElement.parentElement;
    
    if (this.imageElement && this.imageContainer) {
      this.initializeCropArea();
    }
  }
  
  // private initializeCropArea() {
  //   if (!this.imageElement) return;
    
  //   const rect = this.imageElement.getBoundingClientRect();
  //   const containerRect = this.imageContainer!.getBoundingClientRect();
    
  //   // Calculate initial crop size based on image size and aspect ratio
  //   const maxSize = Math.min(rect.width, rect.height) * 0.7;
  //   let cropWidth = maxSize;
  //   let cropHeight = maxSize;
    
  //   // Adjust for aspect ratio
  //   if (this.aspectRatio !== 1) {
  //     if (this.aspectRatio > 1) {
  //       cropHeight = cropWidth / this.aspectRatio;
  //     } else {
  //       cropWidth = cropHeight * this.aspectRatio;
  //     }
  //   }
    
  //   // Center the crop area
  //   this.cropArea = {
  //     x: (rect.width - cropWidth) / 2,
  //     y: (rect.height - cropHeight) / 2,
  //     width: cropWidth,
  //     height: cropHeight
  //   };
  // }

initializeCropArea() {
  const img = this.imageElement!;
  const imgWidth = img.clientWidth;
  const imgHeight = img.clientHeight;

  // Aspect ratio (w/h)
  const ratio = this.aspectRatio; // e.g., 1, 16/9 etc.

  let cropWidth, cropHeight;

  // Fit the crop area to the maximum possible inside image while respecting ratio
  if (imgWidth / imgHeight > ratio) {
    // Image is wider → height is the limiting factor
    cropHeight = imgHeight;
    cropWidth = cropHeight * ratio;
  } else {
    // Image is taller → width is the limiting factor
    cropWidth = imgWidth;
    cropHeight = cropWidth / ratio;
  }

  // Center the crop area
  const cropX = (imgWidth - cropWidth) / 2;
  const cropY = (imgHeight - cropHeight) / 2;

  // Apply
  this.cropArea = {
    x: cropX,
    y: cropY,
    width: cropWidth,
    height: cropHeight
  };
}

  
  startDrag(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    this.isDragging = true;
    
    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
    
    const containerRect = this.imageContainer!.getBoundingClientRect();
    
    this.startPos = {
      x: clientX - containerRect.left - this.cropArea.x,
      y: clientY - containerRect.top - this.cropArea.y
    };
  }
  
  startResize(event: MouseEvent | TouchEvent, direction: string) {
    event.stopPropagation();
    event.preventDefault();
    
    this.isResizing = true;
    this.resizeDirection = direction;
    
    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
    
    this.startPos = { x: clientX, y: clientY };
  }
  
  onMouseMove(event: MouseEvent) {
    this.handleMove(event.clientX, event.clientY);
  }
  
  onTouchMove(event: TouchEvent) {
    event.preventDefault();
    if (event.touches.length === 1) {
      this.handleMove(event.touches[0].clientX, event.touches[0].clientY);
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
  
  private handleDrag(relativeX: number, relativeY: number) {
    const newX = relativeX - this.startPos.x;
    const newY = relativeY - this.startPos.y;
    
    // Keep crop area within image bounds
    const rect = this.imageElement!.getBoundingClientRect();
    const containerRect = this.imageContainer!.getBoundingClientRect();
    
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
    
    let newWidth = this.cropArea.width;
    let newHeight = this.cropArea.height;
    let newX = this.cropArea.x;
    let newY = this.cropArea.y;
    
    const minSize = 50;
    const rect = this.imageElement.getBoundingClientRect();
    
    switch (this.resizeDirection) {
      case 'top-left':
        newWidth = Math.max(minSize, this.cropArea.width - deltaX);
        newHeight = this.aspectRatio === 1 ? newWidth : newWidth / this.aspectRatio;
        newX = this.cropArea.x + this.cropArea.width - newWidth;
        newY = this.cropArea.y + this.cropArea.height - newHeight;
        break;
        
      case 'top-right':
        newWidth = Math.max(minSize, this.cropArea.width + deltaX);
        newHeight = this.aspectRatio === 1 ? newWidth : newWidth / this.aspectRatio;
        newY = this.cropArea.y + this.cropArea.height - newHeight;
        break;
        
      case 'bottom-left':
        newWidth = Math.max(minSize, this.cropArea.width - deltaX);
        newHeight = this.aspectRatio === 1 ? newWidth : newWidth / this.aspectRatio;
        newX = this.cropArea.x + this.cropArea.width - newWidth;
        break;
        
      case 'bottom-right':
        newWidth = Math.max(minSize, this.cropArea.width + deltaX);
        newHeight = this.aspectRatio === 1 ? newWidth : newWidth / this.aspectRatio;
        break;
    }
    
    // Boundary checks
    if (newX >= 0 && newY >= 0 && 
        newX + newWidth <= rect.width && 
        newY + newHeight <= rect.height) {
      
      this.cropArea = { 
        x: newX, 
        y: newY, 
        width: newWidth, 
        height: newHeight 
      };
      this.startPos = { x: clientX, y: clientY };
    }
  }
  
  onMouseUp() {
    this.stopInteraction();
  }
  
  onTouchEnd(event: TouchEvent) {
    this.stopInteraction();
    
    // Prevent double tap zoom
    const now = (new Date()).getTime();
    if (now - this.lastTouchEnd <= 300) {
      event.preventDefault();
    }
    this.lastTouchEnd = now;
  }
  
  private stopInteraction() {
    this.isDragging = false;
    this.isResizing = false;
    this.resizeDirection = '';
  }
  
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
      
      // Set canvas size to crop area size
      canvas.width = this.cropArea.width;
      canvas.height = this.cropArea.height;
      
      // Create a new image element
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          try {
            // Calculate scale factors
            const displayedWidth = this.imageElement!.clientWidth;
            const displayedHeight = this.imageElement!.clientHeight;
            const scaleX = img.naturalWidth / displayedWidth;
            const scaleY = img.naturalHeight / displayedHeight;
            
            // Draw the cropped portion
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
            
            resolve(true);
          } catch (error) {
            reject(error);
          }
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = this.imageUrl;
      });
      
      // Convert to blob
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
  
  // Helper method to reset crop area
  resetCropArea() {
    if (this.imageElement) {
      this.initializeCropArea();
    }
  }
}