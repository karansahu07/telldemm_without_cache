import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { IonicModule, IonInput, PopoverController } from '@ionic/angular';
import { MenuPopoverComponent } from '../components/menu-popover/menu-popover.component';
import { ContactMenuComponent } from '../components/contact-menu/contact-menu.component';
import { ActionSheetController } from '@ionic/angular';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseChatService } from '../services/firebase-chat.service';
import { ContactSyncService } from '../services/contact-sync.service';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';
import { ApiService } from '../services/api/api.service';
import { AuthService } from '../auth/auth.service';
import { Contact } from 'src/types';

@Component({
  selector: 'app-contacts',
  templateUrl: './contacts.page.html',
  styleUrls: ['./contacts.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ContactsPage implements OnInit {
  @ViewChild('searchInput', { static: false }) searchInput!: IonInput;

  allUsers: {
    isOnPlatform: boolean;
    profile: string;
    username: string;
    phoneNumber: string;
    userId: string | null;
    selected?: boolean;
  }[] = [];
  filteredContacts: {
    isOnPlatform: boolean;
    profile: string;
    username: string;
    phoneNumber: string;
    userId: string | null;
    selected?: boolean;
  }[] = [];

  showSearchBar = false;
  searchTerm: string = '';
  keyboardType: 'text' | 'tel' = 'text';

  creatingGroup = false;
  newGroupName: string = '';
  userProfile: any;

  isLoading = true;

  constructor(
    private router: Router,
    private popoverControl: PopoverController,
    private actionSheetCtrl: ActionSheetController,
    private firebaseChatService: FirebaseChatService,
    private contactSyncService: ContactSyncService,
    private secureStorage: SecureStorageService,
    private api: ApiService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadDeviceMatchedContacts();
    const currentUserName = this.authService.authData?.name;
    //console.log("username", currentUserName);
    const userId = this.authService.authData?.userId;
    if (!userId) return;
  }
  async loadDeviceMatchedContacts(): Promise<void> {
    // current user phone from auth; fallback. to localStorage if authService not ready
    const currentUserPhone: string | undefined =
      this.authService?.authData?.phone_number ??
      localStorage.getItem('phone_number') ??
      undefined;

    this.allUsers = [];

    this.isLoading = true;

    try {
      const pfUsers = this.firebaseChatService.currentUsers;
      console.log({ pfUsers });
      const deviceContacts = this.firebaseChatService.currentDeviceContacts;

      // Extract phone numbers of platform users
      const pfUserPhones = pfUsers.map((pu) => pu.phoneNumber);

      // Filter device contacts that are NOT on the platform
      const nonPfUsers = deviceContacts.filter(
        (dc) => !pfUserPhones.includes(dc.phoneNumber)
      );

      // Build unified list of all users
      this.allUsers = [
        ...pfUsers.map(
          ({ phoneNumber, username, userId, avatar, isOnPlatform }) => ({
            userId: userId as string,
            profile: avatar || '',
            phoneNumber: phoneNumber as string,
            username: username as string,
            isOnPlatform: !!isOnPlatform,
            selected: false,
          })
        ),
        // ...nonPfUsers.map((dc) => ({
        //   userId: dc.userId || '', // fallback if device contact has no userId
        //   profile: dc.avatar || '',
        //   phoneNumber: dc.phoneNumber as string,
        //   name: dc.username || dc.phoneNumber,
        //   isOnPlatform: false,
        // })),
      ];

      // Initialize filtered contacts
      this.filteredContacts = [...this.allUsers];

      //  ...nonPfUser.map(({ phoneNumber, username }) => ({ userId: null, name: username, phoneNumber, isOnPlatform: false, profile: "" }))]
    } catch (error) {
      console.error('Error loading contacts');
    } finally {
      this.isLoading = false;
    }
  }

  async openContactChat(receiverId: any) {
    try {
      const receiver = this.allUsers.find(
        (u) => u.userId === receiverId && u.isOnPlatform
      );
      console.log('All users->', this.allUsers);
      console.log('Filtered users->', this.filteredContacts);
      console.log('ReceiverId->', receiverId);
      console.log('Receiver->', receiver);
      if (!receiver) {
        console.error('Receiver not found!');
        return;
      }
      await this.firebaseChatService.openChat(
        {
          receiver,
        },
        true
      );
      this.router.navigate(['/chatting-screen'], {
        queryParams: {
          receiver_phone: receiver.phoneNumber.slice(-10),
          receiverId: receiver.userId,
        },
      });
    } catch (error) {
      console.error('Error opening chat:', error);
      alert('Failed to open chat. Please try again.');
    }
  }

  startGroupCreation() {
    this.creatingGroup = true;
  }

  async createGroup() {
    const selectedUsers = this.allUsers.filter((u) => !!(u as any).selected);

    const currentUserId = this.authService.authData?.userId ?? '';
    const currentUserPhone = this.authService.authData?.phone_number ?? '';
    const currentUserName = this.authService.authData?.name ?? '';

    if (!this.newGroupName?.trim()) {
      alert('Group name is required');
      return;
    }

    const membersForFirebase: Array<any> = selectedUsers.map((u) => ({
      userId: u.userId,
      username: u.username,
      phoneNumber: u.phoneNumber,
    }));

    const memberIds = membersForFirebase.map((m) => {
      const id = m.userId;
      const n = typeof id === 'number' ? id : Number(id);
      return Number.isFinite(n) ? n : id;
    });

    const groupId = `group_${Date.now()}`;

    try {
      await this.firebaseChatService.createGroup({
        groupId,
        groupName: this.newGroupName,
        members: membersForFirebase,
      });

      this.api
        .createGroup(
          this.newGroupName,
          Number(currentUserId),
          groupId,
          memberIds
        )
        .subscribe({
          next: async (res: any) => {
            const backendGroupId =
              res?.group?.group?.group_id ??
              res?.group?.groupId ??
              res?.group?.id ??
              res?.group_id ??
              res?.data?.group_id ??
              res?.data?.id ??
              res?.id;
            if (backendGroupId) {
              try {
                await this.firebaseChatService.updateBackendGroupId(
                  groupId,
                  backendGroupId
                );
              } catch (err) {
                console.warn(
                  'Failed to update backendGroupId in Firebase:',
                  err
                );
              }
            }

            // reset UI & navigate
            this.creatingGroup = false;
            this.newGroupName = '';
            this.allUsers.forEach((u: any) => (u.selected = false));

            alert('Group created successfully');
            localStorage.setItem('shouldRefreshHome', 'true');
            this.router.navigate(['/home-screen']);
          },
          error: (err: any) => {
            console.error('Failed to sync group to backend:', err);
            alert('Failed to sync group to backend');
          },
        });
    } catch (err) {
      console.error('Failed to create group:', err);
      alert('Failed to create group');
    }
  }

  focusSearchBar() {
    this.showSearchBar = true;
    setTimeout(() => {
      this.searchInput?.setFocus();
    }, 300);
  }

  toggleSearch() {
    this.showSearchBar = !this.showSearchBar;
    if (!this.showSearchBar) {
      this.searchTerm = '';
      this.keyboardType = 'text';
      this.filterContacts();
    }
  }

  toggleKeyboardType() {
    this.keyboardType = this.keyboardType === 'text' ? 'tel' : 'text';
    setTimeout(() => {
      this.searchInput?.setFocus();
    }, 300);
  }

  async presentPopover(ev: any) {
    const popover = await this.popoverControl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();
  }

  async presentContactMenu(ev: any) {
    const popover = await this.popoverControl.create({
      component: ContactMenuComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
  }

  filterContacts() {
    const term = this.searchTerm.toLowerCase();
  }

  goToCommunity() {
    this.router.navigate(['/community-screen']);
  }
}
