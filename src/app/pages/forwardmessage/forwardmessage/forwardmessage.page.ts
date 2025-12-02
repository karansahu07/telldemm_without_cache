import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { IonicModule, NavController, PopoverController } from '@ionic/angular';
import { Router } from '@angular/router';
import { MenuPopoverComponent } from '../../../components/menu-popover/menu-popover.component';
import { FormsModule } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import { ApiService } from '../../../services/api/api.service';
import { FirebaseChatService } from '../../../services/firebase-chat.service';
import { Subscription } from 'rxjs';
import { EncryptionService } from '../../../services/encryption.service';
import { Capacitor } from '@capacitor/core';
import { SecureStorageService } from '../../../services/secure-storage/secure-storage.service';
import { ContactSyncService } from 'src/app/services/contact-sync.service';
import { v4 as uuidv4 } from 'uuid';
import { Message } from 'src/types';
import { AuthService } from 'src/app/auth/auth.service';
import { IMessage } from 'src/app/services/sqlite.service';

@Component({
  selector: 'app-forwardmessage',
  templateUrl: './forwardmessage.page.html',
  styleUrls: ['./forwardmessage.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ForwardmessagePage implements OnInit, OnDestroy {
  searchText = '';
  selectedFilter = 'all';
  currUserId: string | null = null;
  senderUserId: string | null = null;

  scannedText = '';
  capturedImage = '';
  chatList: any[] = [];
  toggleGroupCreator = false;
  newGroupName = '';
  unreadSubs: Subscription[] = [];
  selectedImage: string | null = null;
  showPopup = false;
  
  // Updated properties for device contacts
  allUsers: any[] = [];
  filteredContacts: any[] = [];
  isLoadingContacts = true;

  selectedContacts: any[] = [];
  selectedUserDetails: any[] = [];
  forwardedMessage: any;

  sender_name: string | null = null;
  sender_phone: string | null = null;

  constructor(
    private router: Router,
    private popoverCtrl: PopoverController,
    private service: ApiService,
    private firebaseChatService: FirebaseChatService,
    private encryptionService: EncryptionService,
    private secureStorage: SecureStorageService,
    private navCtrl: NavController,
    private contactSyncService: ContactSyncService,
    private authService: AuthService
  ) { }

  statusList = [
    { name: 'My status', subtitle: 'My contacts', avatar: 'assets/images/user.jfif' },
    { name: 'Meta AI', subtitle: 'Ask me anything', avatar: 'assets/images/user.jfif' }
  ];

  async ngOnInit() {
    this.currUserId = await this.secureStorage.getItem('phone_number');
    this.senderUserId = this.authService.authData?.userId || '';
    await this.loadDeviceMatchedContacts();
    const forwardMessages = this.firebaseChatService.getForwardMessages();
    console.log({forwardMessages})
  }

  async ionViewWillEnter() {
    const shouldRefresh = localStorage.getItem('shouldRefreshHome');
    if (shouldRefresh === 'true') {
      localStorage.removeItem('shouldRefreshHome');
      this.clearChatData();
      await this.refreshHomeData();
    }
  }

  private clearChatData() {
    this.unreadSubs.forEach((sub) => sub.unsubscribe());
    this.unreadSubs = [];
    this.chatList = [];
  }

  private async refreshHomeData() {
    try {
      this.currUserId = await this.secureStorage.getItem('phone_number');
      this.senderUserId = await this.secureStorage.getItem('userId');
    } catch (error) {
      console.error('Error refreshing home data:', error);
    }
  }

  ngOnDestroy() {
    this.unreadSubs.forEach((sub) => sub.unsubscribe());
  }

  goToUserAbout() {
    this.showPopup = false;
    setTimeout(() => {
      this.router.navigate(['/profile-screen']);
    }, 100);
  }

  goToUsercall() {
    this.showPopup = false;
    setTimeout(() => {
      this.router.navigate(['/calls-screen']);
    }, 100);
  }

  goToUservideocall() {
    this.showPopup = false;
    setTimeout(() => {
      this.router.navigate(['/calling-screen']);
    }, 100);
  }

  goBack() {
    this.navCtrl.back();
  }

  // Updated method - same as add-members page
  async loadDeviceMatchedContacts(): Promise<void> {
    const currentUserPhone = this.authService.authData?.phone_number;
    this.allUsers = [];
    this.isLoadingContacts = true;

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
        // Optional: Uncomment if you want to include non-platform device contacts
        // ...nonPfUsers.map((dc: any) => ({
        //   user_id: null,
        //   name: dc.username ?? dc.phoneNumber,
        //   image: dc.avatar ?? 'assets/images/user.jfif',
        //   phone_number: String(dc.phoneNumber),
        //   isOnPlatform: false,
        //   selected: false,
        // })),
      ];

      // Filter out current user
      this.allUsers = this.allUsers.filter(
        (u: any) => u.phone_number !== currentUserPhone
      );

      // Initialize filtered list for search
      this.filteredContacts = [...this.allUsers];
      console.log('Device contacts loaded:', this.filteredContacts);
    } catch (error) {
      console.error('Error loading contacts', error);
    } finally {
      this.isLoadingContacts = false;
    }
  }

  // Updated toggle selection method
  toggleSelection(contact: any) {
    contact.selected = !contact.selected;

    if (contact.selected) {
      this.selectedContacts.push(contact);
    } else {
      this.selectedContacts = this.selectedContacts.filter(
        c => c.user_id !== contact.user_id
      );
    }

    console.log('Currently selected contacts:', this.selectedContacts);
  }

  // Filter users based on search text
  filteredUsers() {
    const search = this.searchText.toLowerCase();
    return this.filteredContacts.filter(user =>
      user.name?.toLowerCase().includes(search)
    );
  }

  get selectedNames(): string {
    return this.selectedContacts
      .map(c => c.name)
      .join(', ');
  }

  getRoomId(a: string, b: string): string {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  // async sendForward() {
  //   const forwardMessages = this.firebaseChatService.getForwardMessages();
  //   console.log({forwardMessages})

  //   if (!forwardMessages || forwardMessages.length === 0) {
  //     return;
  //   }

  //   for (const forwardedMessage of forwardMessages) {
  //     if (this.selectedContacts.length === 0) {
  //       return;
  //     }

  //     for (const contact of this.selectedContacts) {
  //       const receiverId = contact.user_id;
  //       console.log("this selected contacts", this.selectedContacts)
  //       const roomId = this.getRoomId(this.senderUserId!, receiverId);
  //       console.log({roomId})


  //       const message: any = {
  //         ...forwardMessages,
  //         timestamp: new Date().toISOString(),
  //         // isDeleted: false,
  //         isForwarded: true,
  //         // replyToMessageId: forwardedMessage.replyToMessageId || "",
  //       };
  //       console.log({message});

  //       // if (forwardedMessage.attachment && Object.keys(forwardedMessage.attachment).length > 0) {
  //       //   message.mediaId = { ...forwardedMessage.attachment };
  //       //   message.text = "";
  //       // }
  //       // else if (forwardedMessage.text) {
  //       //   let textToSend = forwardedMessage.text;

  //       //   if (!textToSend.startsWith('ENC:')) {
  //       //     textToSend = await this.encryptionService.encrypt(textToSend);
  //       //   }

  //       //   message.text = textToSend;
  //       // }
  //       console.log("this message is send to forward",message)
  //       await this.firebaseChatService.sendMessage(message);
  //       console.log({message})
  //     }
  //   }

  //   this.firebaseChatService.clearForwardMessages();
  //   this.router.navigate(['/home-screen']);
  // }

  async sendForward() {
  const forwardMessages = this.firebaseChatService.getForwardMessages();
  console.log({ forwardMessages });

  if (!forwardMessages || forwardMessages.length === 0) {
    console.warn('No messages to forward');
    return;
  }

  if (this.selectedContacts.length === 0) {
    console.warn('No contacts selected');
    return;
  }

  try {
    // Loop through each message to forward
    for (const forwardedMessage of forwardMessages) {
      console.log('Forwarding message:', forwardedMessage.msgId);
      
      // Loop through each selected contact
      for (const contact of this.selectedContacts) {
        const receiverId = contact.user_id;
        console.log('  → To contact:', receiverId);

        // Forward the message
        await this.firebaseChatService.sendForwardMessage(
          forwardedMessage,
          receiverId
        );
      }
    }

    // Clear forward messages and navigate
    this.firebaseChatService.clearForwardMessages();
    this.router.navigate(['/home-screen']);
    
    console.log('✅ All messages forwarded successfully');
  } catch (error) {
    console.error('❌ Error forwarding messages:', error);
    // Show error toast to user
  }
}

}