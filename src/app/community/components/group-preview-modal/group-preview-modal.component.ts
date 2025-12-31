// import { Component, Input, OnInit } from '@angular/core';
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
// export class GroupPreviewModalComponent implements OnInit {
//   @Input() group: any;
//   @Input() communityName = '';
//   @Input() currentUserId = '';
//   @Input() currentUserName = '';
//   @Input() currentUserPhone = '';

//   // Local variables for group details
//   memberKeys: string[] = [];

//   constructor(
//     private modalCtrl: ModalController,
//     private translate: TranslateService
//   ) {}

//   async ngOnInit() {
//     console.log("group detail in preview modal", this.group);
//     this.extractMemberKeys();
//   }

//   /**
//    * 🔹 Extract member keys from group object
//    */
//   extractMemberKeys() {
//     if (this.group?.members) {
//       if (Array.isArray(this.group.members)) {
//         this.memberKeys = this.group.members;
//       } else if (typeof this.group.members === 'object') {
//         this.memberKeys = Object.keys(this.group.members);
//       }
//     }
//   }

//   /**
//    * 🔹 Get member object by key
//    */
//   memberObj(key: string): any {
//     if (!this.group?.members) return null;
//     return this.group.members[key];
//   }

//   /**
//    * 🔹 Get initials for member avatar
//    */
//   initialsFor(mem: any): string {
//     if (!mem) return 'U';
    
//     const n: string = mem?.name || mem?.username || '';
//     if (!n) {
//       return mem?.phone_number || mem?.phoneNumber 
//         ? String(mem.phone_number || mem.phoneNumber).slice(-2) 
//         : 'U';
//     }

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
//    * 🔹 Get "Created by" text
//    */
//   get createdByText(): string {
//     const name = this.group?.createdByName || this.group?.createdBy || this.group?.created_by || '';
//     if (!name) return '';
//     return this.translate.instant('group_preview_modal_component.createdBy', { name });
//   }

//   /**
//    * 🔹 Get group name
//    */
//   get groupName(): string {
//     return this.group?.name || this.group?.title || 'Unnamed Group';
//   }

//   /**
//    * 🔹 Get group description
//    */
//   get groupDescription(): string {
//     return this.group?.description || '';
//   }

//   /**
//    * 🔹 Get member count
//    */
//   get memberCount(): number {
//     return this.memberKeys.length || this.group?.membersCount || 0;
//   }

//   /**
//    * 🔹 Get creation date
//    */
//   get createdAt(): Date | null {
//     if (this.group?.createdAt) {
//       return typeof this.group.createdAt === 'string' 
//         ? new Date(this.group.createdAt) 
//         : this.group.createdAt;
//     }
//     return null;
//   }

//   /**
//    * 🔹 Get group avatar
//    */
//   get groupAvatar(): string {
//     return this.group?.avatar || this.avatarFallbackUrl();
//   }

//   /**
//    * 🔹 Close modal
//    */
//   close(): void {
//     this.modalCtrl.dismiss();
//   }

//   /**
//    * 🔹 Join group
//    */
//   join(): void {
//     this.modalCtrl.dismiss({ 
//       action: 'join', 
//       groupId: this.group?.roomId || this.group?.id 
//     });
//   }

//   /**
//    * 🔹 Set default avatar on error
//    */
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

//   /**
//    * 🔹 Get fallback avatar URL
//    */
//   avatarFallbackUrl(): string {
//     return 'assets/images/user.jfif';
//   }
// }

import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ApiService } from 'src/app/services/api/api.service';

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
  memberKeys: string[] = [];
  memberAvatars: { [key: string]: string } = {};
  memberDetails: { [key: string]: any } = {};

  constructor(
    private modalCtrl: ModalController,
    private translate: TranslateService,
    private api: ApiService 
  ) {}

  async ngOnInit() {
    console.log("group detail in preview modal", this.group);
    this.extractMemberKeys();
    this.loadMemberAvatars();
  }

  /**
   * 🔹 Extract member keys from group object
   */
  extractMemberKeys() {
    if (this.group?.members) {
      if (Array.isArray(this.group.members)) {
        this.memberKeys = this.group.members;
      } else if (typeof this.group.members === 'object') {
        this.memberKeys = Object.keys(this.group.members);
      }
    }
  }

 loadMemberAvatars() {
  if (!this.memberKeys || this.memberKeys.length === 0) {
    console.log('⚠️ No member keys to load avatars');
    return;
  }

  const membersToLoad = this.memberKeys.slice(0, 8);
  console.log('👥 Loading member details for:', membersToLoad);
  
  membersToLoad.forEach((memberId) => {
    this.api.getUserProfilebyId(memberId).subscribe({
      next: (res: any) => {
        console.log(`✅ Response for member ${memberId}:`, res);
        
        // Store complete member details
        this.memberDetails[memberId] = {
          id: memberId,
          name: res?.name || res?.username || '',
          username: res?.username || '',
          phone_number: res?.phone_number || res?.phoneNumber || '',
          avatar: res?.profile || ''
        };
        
        console.log(`💾 Stored member details for ${memberId}:`, this.memberDetails[memberId]);
      },
      error: (err) => {
        console.error(`❌ Error loading profile for member ${memberId}:`, err);
        // Store minimal details on error
        this.memberDetails[memberId] = {
          id: memberId,
          name: '',
          username: '',
          phone_number: '',
          avatar: ''
        };
      },
    });
  });
}

/**
 * 🔹 Get member object by key
 */
memberObj(key: string): any {
  // Return fetched member details instead of group.members[key]
  return this.memberDetails[key] || null;
}
  /**
   * 🔹 Get initials for member avatar
   */
  initialsFor(mem: any): string {
    if (!mem) return 'U';
    // console.log("ffffffffffffffffffffffffff",mem)
    
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
    const name = this.group?.createdByName || this.group?.createdBy || this.group?.created_by || '';
    if (!name) return '';
    return this.translate.instant('group_preview_modal_component.createdBy', { name });
  }

  /**
   * 🔹 Get group name
   */
  get groupName(): string {
    return this.group?.name || this.group?.title || 'Unnamed Group';
  }

  /**
   * 🔹 Get group description
   */
  get groupDescription(): string {
    return this.group?.description || '';
  }

  /**
   * 🔹 Get member count
   */
  get memberCount(): number {
    return this.memberKeys.length || this.group?.membersCount || 0;
  }

  /**
   * 🔹 Get creation date
   */
  get createdAt(): Date | null {
    if (this.group?.createdAt) {
      return typeof this.group.createdAt === 'string' 
        ? new Date(this.group.createdAt) 
        : this.group.createdAt;
    }
    return null;
  }

  /**
   * 🔹 Get group avatar
   */
  get groupAvatar(): string {
    return this.group?.avatar || this.avatarFallbackUrl();
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