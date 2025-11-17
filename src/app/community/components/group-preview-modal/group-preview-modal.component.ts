// import { Component, Input } from '@angular/core';
// import { IonicModule, ModalController } from '@ionic/angular';
// import { CommonModule } from '@angular/common';
// import { TranslateModule, TranslateService } from '@ngx-translate/core';

// @Component({
//   selector: 'app-group-preview-modal',
//   templateUrl: './group-preview-modal.component.html',
//   styleUrls: ['./group-preview-modal.component.scss'],
//   standalone: true,
//   imports: [IonicModule, CommonModule, TranslateModule],
// })
// export class GroupPreviewModalComponent {
//   @Input() group: any;
//   @Input() communityName = '';
//   @Input() currentUserId = '';
//   @Input() currentUserName = '';
//   @Input() currentUserPhone = '';

//   constructor(
//     private modalCtrl: ModalController,
//     private translate: TranslateService
//   ) {}

//   get memberKeys(): string[] {
//     if (!this.group || !this.group.rawMembers) return [];
//     return Object.keys(this.group.rawMembers);
//   }

//   memberObj(key: string): any {
//     return this.group && this.group.rawMembers ? this.group.rawMembers[key] : null;
//   }

//   initialsFor(mem: any): string {
//     const n: string = mem?.name || '';
//     if (!n) return mem?.phone_number ? String(mem.phone_number).slice(-2) : 'U';

//     const initials = n
//       .split(' ')
//       .map((s: string) => (s && s.length > 0 ? s[0] : ''))
//       .filter((ch: string) => !!ch)
//       .slice(0, 2)
//       .join('')
//       .toUpperCase();

//     return initials || 'U';
//   }

//   /**
//    * Localized "Created by {{name}}"
//    * (Date is appended in the template with Angular date pipe)
//    */
//   get createdByText(): string {
//     const name =
//       this.group?.createdByName ||
//       this.group?.createdBy ||
//       this.group?.created_by ||
//       '';
//     if (!name) return '';
//     return this.translate.instant('group_preview_modal_component.createdBy', { name });
//   }

//   close(): void {
//     this.modalCtrl.dismiss();
//   }

//   join(): void {
//     this.modalCtrl.dismiss({ action: 'join', groupId: this.group?.id });
//   }

//   setDefaultAvatar(event: Event) {
//     try {
//       const img = event?.target as HTMLImageElement | null;
//       if (!img) return;
//       img.onerror = null;
//       img.src = this.avatarFallbackUrl();
//     } catch (e) {
//       console.warn('setDefaultAvatar error', e);
//     }
//   }

//   avatarFallbackUrl(): string {
//     return 'assets/images/user.jfif';
//   }
// }


import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FirebaseChatService } from '../../../services/firebase-chat.service';

@Component({
  selector: 'app-group-preview-modal',
  templateUrl: './group-preview-modal.component.html',
  styleUrls: ['./group-preview-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
})
export class GroupPreviewModalComponent implements OnInit {
  @Input() group: any;
  @Input() communityName = '';
  @Input() currentUserId = '';
  @Input() currentUserName = '';
  @Input() currentUserPhone = '';

  // Local variables for group details
  groupDetails: any = null;
  memberKeys: string[] = [];
  loading = false;

  constructor(
    private modalCtrl: ModalController,
    private translate: TranslateService,
    private firebaseService: FirebaseChatService
  ) {}

  async ngOnInit() {
    await this.loadGroupDetails();
  }

  /**
   * 🔹 Load full group details from Firebase
   */
  async loadGroupDetails() {
    if (!this.group || !this.group.roomId) {
      console.error('Invalid group data');
      return;
    }

    this.loading = true;
    try {
      // Fetch full group details from Firebase
      this.groupDetails = await this.firebaseService.getGroupDetails(
        this.group.roomId
      );

      console.log('Group details loaded:', this.groupDetails);

      // Extract member keys
      if (this.groupDetails?.members) {
        this.memberKeys = Object.keys(this.groupDetails.members);
      }
    } catch (error) {
      console.error('Error loading group details:', error);
      // Fallback to group object passed from parent
      this.groupDetails = this.group;
      
      // Try to extract members from group object
      if (this.group.members && Array.isArray(this.group.members)) {
        this.memberKeys = this.group.members;
      } else if (this.group.members && typeof this.group.members === 'object') {
        this.memberKeys = Object.keys(this.group.members);
      }
    } finally {
      this.loading = false;
    }
  }

  /**
   * 🔹 Get member object by key
   */
  memberObj(key: string): any {
    if (!this.groupDetails || !this.groupDetails.members) return null;
    return this.groupDetails.members[key];
  }

  /**
   * 🔹 Get initials for member avatar
   */
  initialsFor(mem: any): string {
    if (!mem) return 'U';
    
    const n: string = mem?.name || mem?.username || '';
    if (!n) {
      return mem?.phone_number || mem?.phoneNumber 
        ? String(mem.phone_number || mem.phoneNumber).slice(-2) 
        : 'U';
    }

    const initials = n
      .split(' ')
      .map((s: string) => (s && s.length > 0 ? s[0] : ''))
      .filter((ch: string) => !!ch)
      .slice(0, 2)
      .join('')
      .toUpperCase();

    return initials || 'U';
  }

  /**
   * 🔹 Get "Created by" text
   */
  get createdByText(): string {
    const details = this.groupDetails || this.group;
    const name =
      details?.createdByName ||
      details?.createdBy ||
      details?.created_by ||
      '';
    if (!name) return '';
    return this.translate.instant('group_preview_modal_component.createdBy', { name });
  }

  /**
   * 🔹 Get group name
   */
  get groupName(): string {
    return this.groupDetails?.name || this.groupDetails?.title || this.group?.name || this.group?.title || 'Unnamed Group';
  }

  /**
   * 🔹 Get group description
   */
  get groupDescription(): string {
    return this.groupDetails?.description || this.group?.description || '';
  }

  /**
   * 🔹 Get member count
   */
  get memberCount(): number {
    return this.memberKeys.length || this.groupDetails?.membersCount || this.group?.membersCount || 0;
  }

  /**
   * 🔹 Get creation date
   */
  get createdAt(): Date | null {
    const details = this.groupDetails || this.group;
    if (details?.createdAt) {
      return typeof details.createdAt === 'string' 
        ? new Date(details.createdAt) 
        : details.createdAt;
    }
    return null;
  }

  /**
   * 🔹 Close modal
   */
  close(): void {
    this.modalCtrl.dismiss();
  }

  /**
   * 🔹 Join group
   */
  join(): void {
    this.modalCtrl.dismiss({ 
      action: 'join', 
      groupId: this.group?.roomId || this.group?.id 
    });
  }

  /**
   * 🔹 Set default avatar on error
   */
  setDefaultAvatar(event: Event) {
    try {
      const img = event?.target as HTMLImageElement | null;
      if (!img) return;
      img.onerror = null;
      img.src = this.avatarFallbackUrl();
    } catch (e) {
      console.warn('setDefaultAvatar error', e);
    }
  }

  /**
   * 🔹 Get fallback avatar URL
   */
  avatarFallbackUrl(): string {
    return 'assets/images/user.jfif';
  }
}