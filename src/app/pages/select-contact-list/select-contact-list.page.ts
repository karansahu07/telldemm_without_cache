import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { ContactSyncService } from 'src/app/services/contact-sync.service';
import { FileSystemService } from 'src/app/services/file-system.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { IMessage } from 'src/app/services/sqlite.service';

@Component({
  selector: 'app-select-contact-list',
  templateUrl: './select-contact-list.page.html',
  styleUrls: ['./select-contact-list.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class SelectContactListPage implements OnInit {
  searchText = '';
  allUsers: any[] = [];
  filteredContacts: any[] = [];
  isLoading = false;
  groupId: string = '';
  selectedAttachment: any;

  constructor(
    private navCtrl: NavController,
    private contactSyncService: ContactSyncService,
    private route: ActivatedRoute,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private service : ApiService,
    private firebaseChatService : FirebaseChatService,
    private FileService : FileSystemService
  ) {}

  ngOnInit() {
    this.loadDeviceMatchedContacts();
    this.groupId = this.route.snapshot.queryParamMap.get('groupId') || '';
    this.selectedAttachment = this.firebaseChatService.getSelectedAttachment();
    console.log("this .selectedAttachment", this.selectedAttachment);
  }

  async showToast(message: string, color: 'success' | 'danger' = 'success') {
  const toast = await this.toastCtrl.create({
    message,
    duration: 2000,
    color,
    position: 'bottom'
  });
  toast.present();
}

async loadDeviceMatchedContacts(): Promise<void> {
  const currentUserPhone = this.authService.authData?.phone_number;
  this.allUsers = [];
  this.isLoading = true;

  try {
    const pfUsers = this.firebaseChatService.currentUsers || [];
    const deviceContacts = this.firebaseChatService.currentDeviceContacts || [];

    // Extract platform user phone numbers for reference
    const pfUserPhones = pfUsers.map((pu: any) => String(pu.phoneNumber));

    // Optionally: find device contacts not on the platform
    const nonPfUsers = deviceContacts.filter(
      (dc: any) => !pfUserPhones.includes(String(dc.phoneNumber))
    );

    // Normalize platform users to match your HTML structure
    this.allUsers = [
      ...pfUsers.map((u: any) => ({
        user_id: String(u.userId ?? u.user_id ?? ''), // backend ID
        name: u.username ?? u.name ?? u.phoneNumber ?? 'Unknown',
        image: u.avatar ?? u.profile ?? 'assets/images/user.jfif',
        phone_number: String(u.phoneNumber ?? ''),
        isOnPlatform: true,
        selected: false,
      })),
    ];

    // Initialize filtered list for search
    this.filteredContacts = [...this.allUsers];
  } catch (error) {
    console.error('Error loading contacts', error);
  } finally {
    this.isLoading = false;
  }
}


//pfUsers

  get selectedUsers() {
    return this.allUsers.filter(user => user.selected);
  }

  toggleSelect(user: any) {
    user.selected = !user.selected;
  }

  filteredUsers() {
    const search = this.searchText.toLowerCase();
    return this.filteredContacts.filter(user =>
      user.name?.toLowerCase().includes(search)
    );
  }

//   async sendAttachment() {
//   // ✅ Step 1: Validate attachment exists
//   if (!this.selectedAttachment) {
//     await this.showToast('No attachment selected', 'danger');
//     return;
//   }

//   // ✅ Step 2: Validate at least one user is selected
//   const selectedUsers = this.allUsers.filter(user => user.selected);
  
//   if (selectedUsers.length === 0) {
//     await this.showToast('Please select at least one contact', 'danger');
//     return;
//   }

//   // ✅ Step 3: Show loading toast
//   this.isLoading = true;
//   const loadingToast = await this.toastCtrl.create({
//     message: `Sending to ${selectedUsers.length} contact(s)...`,
//     duration: 0,
//     position: 'bottom'
//   });
//   await loadingToast.present();

//   try {
//     const currentUserId = this.authService.authData?.userId || '';
//     const currentUserName = this.authService.authData?.name || 'You';

//     // ✅ Step 4: Upload attachment to S3 once (reuse for all users)
//     const mediaId = await this.uploadAttachmentToS3(this.selectedAttachment);
//     console.log("this.selectedAttachment",this.selectedAttachment)

//     const res = await firstValueFrom(
//         this.service.getDownloadUrl(mediaId)
//       );
//       const cdnUrl = res.status ? res.downloadUrl : '';

      

//     // ✅ Step 5: Prepare attachment object
//     const attachmentPayload = {
//       type: this.selectedAttachment.type,
//       mediaId: mediaId,
//       fileName: this.selectedAttachment.fileName,
//       mimeType: this.selectedAttachment.mimeType,
//       fileSize: this.selectedAttachment.fileSize,
//       caption: this.selectedAttachment.caption || '',
//       cdnUrl: cdnUrl,
//     };

//     // ✅ Step 6: Send to each selected user using Firebase service
//     const sendPromises = selectedUsers.map(async (user) => {
//       const receiverId = user.user_id;
      
//       const message: Partial<IMessage & { attachment?: any }> = {
//         sender: currentUserId,
//         sender_name: currentUserName,
//         receiver_id: receiverId,
//         text: attachmentPayload.caption || '',
//         timestamp: Date.now(),
//         msgId: this.generateUUID(),
//         replyToMsgId: '',
//         isEdit: false,
//         isPinned: false,
//         type: 'image',
//         reactions: [],
//         attachment: {
//           ...attachmentPayload,
//           msgId: this.generateUUID()
//         }
//       };

//       console.log("message of attachment",message)
//       // Send via Firebase Chat Service
//       return this.firebaseChatService.sendMessageDirectly(message, receiverId);
//     });

//     // ✅ Step 7: Wait for all messages to be sent
//     await Promise.all(sendPromises);

//     // ✅ Step 8: Dismiss loading toast
//     await loadingToast.dismiss();

//     // ✅ Step 9: Show success message
//     await this.showToast(
//       `Attachment sent to ${selectedUsers.length} contact(s)`,
//       'success'
//     );

//     // ✅ Step 10: Clear selection and navigate back
//     this.selectedAttachment = null;
//     this.firebaseChatService.clearSelectedAttachment();
//     this.navCtrl.back();

//   } catch (error) {
//     console.error('❌ Error sending attachment:', error);
    
//     await loadingToast.dismiss();
    
//     await this.showToast(
//       'Failed to send attachment. Please try again.',
//       'danger'
//     );
//   } finally {
//     this.isLoading = false;
//   }
// }

async sendAttachment() {
  // ✅ Step 1: Validate attachment exists
  if (!this.selectedAttachment) {
    await this.showToast('No attachment selected', 'danger');
    return;
  }

  // ✅ Step 2: Validate at least one user is selected
  const selectedUsers = this.allUsers.filter(user => user.selected);
  
  if (selectedUsers.length === 0) {
    await this.showToast('Please select at least one contact', 'danger');
    return;
  }

  // ✅ Step 3: Show loading toast
  this.isLoading = true;
  const loadingToast = await this.toastCtrl.create({
    message: `Sending to ${selectedUsers.length} contact(s)...`,
    duration: 0,
    position: 'bottom'
  });
  await loadingToast.present();

  try {
    const currentUserId = this.authService.authData?.userId || '';
    const currentUserName = this.authService.authData?.name || 'You';

    // ✅ Step 4: Upload attachment to S3 once (reuse for all users)
    const mediaId = await this.uploadAttachmentToS3(this.selectedAttachment);
    console.log("this.selectedAttachment", this.selectedAttachment);

    const res = await firstValueFrom(
      this.service.getDownloadUrl(mediaId)
    );
    const cdnUrl = res.status ? res.downloadUrl : '';

    // ✅ Step 4.5: Save file locally into "sent" folder (same as sendMessage)
    const localUrl = await this.FileService.saveFileToSent(
      this.selectedAttachment.fileName,
      this.selectedAttachment.blob
    );
    console.log({localUrl})

    // ✅ Step 5: Prepare attachment object (with localUrl added)
    const attachmentPayload = {
      type: this.selectedAttachment.type,
      mediaId: mediaId,
      fileName: this.selectedAttachment.fileName,
      mimeType: this.selectedAttachment.mimeType,
      fileSize: this.selectedAttachment.fileSize,
      caption: this.selectedAttachment.caption || '',
      cdnUrl: cdnUrl,
      localUrl: localUrl,  // ✅ Local file path added
    };

    // ✅ Step 6: Send to each selected user using Firebase service
    const sendPromises = selectedUsers.map(async (user) => {
      const receiverId = user.user_id;
      
      const message: Partial<IMessage & { attachment?: any }> = {
        sender: currentUserId,
        sender_name: currentUserName,
        receiver_id: receiverId,
        text: attachmentPayload.caption || '',
        timestamp: Date.now(),
        msgId: this.generateUUID(),
        replyToMsgId: '',
        isEdit: false,
        isPinned: false,
        type: 'image',
        reactions: [],
        attachment: {
          ...attachmentPayload,
          msgId: this.generateUUID()
        }
      };

      console.log("message of attachment", message);
      // Send via Firebase Chat Service
      return this.firebaseChatService.sendMessageDirectly(message, receiverId);
    });

    // ✅ Step 7: Wait for all messages to be sent
    await Promise.all(sendPromises);

    // ✅ Step 8: Dismiss loading toast
    await loadingToast.dismiss();

    // ✅ Step 9: Show success message
    await this.showToast(
      `Attachment sent to ${selectedUsers.length} contact(s)`,
      'success'
    );

    // ✅ Step 10: Clear selection and navigate back
    this.selectedAttachment = null;
    this.firebaseChatService.clearSelectedAttachment();
    this.navCtrl.back();

  } catch (error) {
    console.error('❌ Error sending attachment:', error);
    
    await loadingToast.dismiss();
    
    await this.showToast(
      'Failed to send attachment. Please try again.',
      'danger'
    );
  } finally {
    this.isLoading = false;
  }
}

// ✅ Helper: Upload to S3
private async uploadAttachmentToS3(attachment: any): Promise<string> {
  try {
    const currentUserId = parseInt(this.authService.authData?.userId || '0');

    const uploadResponse: any = await firstValueFrom(
      this.service.getUploadUrl(
        currentUserId,
        attachment.type,
        attachment.fileSize,
        attachment.mimeType,
        {
          caption: attachment.caption || '',
          fileName: attachment.fileName
        }
      )
    );

    if (!uploadResponse?.status || !uploadResponse.upload_url) {
      throw new Error('Failed to get upload URL');
    }

    const file = this.blobToFile(
      attachment.blob,
      attachment.fileName,
      attachment.mimeType
    );

    await firstValueFrom(
      this.service.uploadToS3(uploadResponse.upload_url, file)
    );

    return uploadResponse.media_id;

  } catch (error) {
    console.error('❌ S3 upload error:', error);
    throw error;
  }
}

// ✅ Helper: Convert Blob to File
private blobToFile(blob: Blob, fileName: string, mimeType?: string): File {
  return new File([blob], fileName, {
    type: mimeType || blob.type,
    lastModified: Date.now()
  });
}

// ✅ Helper: Generate UUID
private generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

  checkboxChanged(user: any) {
    user.selected = !user.selected;
  }
}
