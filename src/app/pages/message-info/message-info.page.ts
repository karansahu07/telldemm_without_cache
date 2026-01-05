import { CommonModule } from '@angular/common';
import { Component, OnInit, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { get, getDatabase, ref } from 'firebase/database';

interface ReceiptUser {
  userId: string;
  userName?: string;
  userAvatar?: string;
  timestamp: string | number | Date;
}

@Component({
  selector: 'app-message-info',
  templateUrl: './message-info.page.html',
  styleUrls: ['./message-info.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class MessageInfoPage implements OnInit {
  message: any = null;
  messageKey: string | null = null;
  currentUserId: string = '';
  isGroupChat: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chatService: FirebaseChatService,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private apiService: ApiService,
    private zone: NgZone
  ) {}

  async ngOnInit() {
    // Get current user ID
    this.currentUserId = this.authService.authData?.userId || '';
    
    // 1) Try service stored message
    const svcMsg = this.chatService.getSelectedMessageInfo(true);  
    if (svcMsg) {
      this.message = svcMsg;
      await this.checkIfGroupChat();
      return;
    }

    // 2) Try navigation state
    const navStateMsg = (this.router.getCurrentNavigation()?.extras?.state as any)?.message;
    if (navStateMsg) {
      this.message = navStateMsg;
      await this.checkIfGroupChat();
      return;
    }

    // 3) Fallback: query params
    this.route.queryParams.subscribe(params => {
      const key = params['messageKey'];
      if (key) {
        this.messageKey = key;
        this.message = { key, text: '(message details unavailable)', timestamp: null };
        this.showInfoToast();
      }
    });
  }

  private async checkIfGroupChat() {
    this.isGroupChat = this.message?.roomId?.startsWith('group_') || false;
    
    // ✅ If group chat, enhance receipt users with device names and avatars
    if (this.isGroupChat) {
      await this.enhanceReceiptUsers();
    }
  }

  // ✅ Enhance receipt users with device contacts (same logic as userabout.page.ts)
  private async enhanceReceiptUsers() {
    try {
      const deviceContacts = this.chatService.currentDeviceContacts || [];
      
      console.log('📱 Device Contacts:', deviceContacts);
      
      // Enhance readBy users
      if (this.message?.receipts?.read?.readBy) {
        this.message.receipts.read.readBy = await Promise.all(
          this.message.receipts.read.readBy.map(async (receipt: any) => {
            return await this.enhanceSingleUser(receipt, deviceContacts);
          })
        );
      }

      // Enhance deliveredTo users
      if (this.message?.receipts?.delivered?.deliveredTo) {
        this.message.receipts.delivered.deliveredTo = await Promise.all(
          this.message.receipts.delivered.deliveredTo.map(async (receipt: any) => {
            return await this.enhanceSingleUser(receipt, deviceContacts);
          })
        );
      }

      console.log('✅ Enhanced receipt users:', {
        readBy: this.message?.receipts?.read?.readBy,
        deliveredTo: this.message?.receipts?.delivered?.deliveredTo
      });
    } catch (error) {
      console.error('❌ Error enhancing receipt users:', error);
    }
  }

  // ✅ Enhance single user (same logic as membersWithDeviceNames in userabout.page.ts)
private async enhanceSingleUser(receipt: any, deviceContacts: any[]): Promise<any> {
  const userId = receipt.userId;
  const groupId = this.message?.roomId;

  // 1️⃣ Current user
  if (String(userId) === String(this.currentUserId)) {
    return {
      ...receipt,
      userName: 'You',
      userAvatar: await this.fetchUserAvatar(userId),
    };
  }

  // 2️⃣ Phone from GROUP members node ✅
 const groupPhone = groupId
  ? await this.getPhoneFromGroupMembers(groupId, userId)
  : null;

  // Normalize phone
  const normalizedGroupPhone = groupPhone
    ? groupPhone.replace(/\D/g, '').slice(-10)
    : '';

  // 3️⃣ Device contact match
  const matchedContact = deviceContacts.find(dc => {
    const dcPhone = (dc.phoneNumber || '').replace(/\D/g, '').slice(-10);
    return normalizedGroupPhone && dcPhone === normalizedGroupPhone;
  });

  // 4️⃣ FINAL resolved name (NO userId fallback ❌)
  const resolvedName =
    matchedContact?.username ||
    groupPhone ||
    receipt.userPhone ||
    receipt.phoneNumber ||
    receipt.userName ||
    'Unknown';

  return {
    ...receipt,
    userName: resolvedName,
    userAvatar: await this.fetchUserAvatar(userId),
  };
}


private async getPhoneFromGroupMembers(
  groupId: string,
  userId: string
): Promise<string | null> {
  try {
    const db = getDatabase();
    const snap = await get(ref(db, `groups/${groupId}/members/${String(userId)}`));

    if (!snap.exists()) return null;

    const member = snap.val();
    return member?.phoneNumber || null;
  } catch (e) {
    console.error('❌ Failed to fetch group member phone', e);
    return null;
  }
}



  // ✅ Fetch user avatar from API
  private async fetchUserAvatar(userId: string): Promise<string> {
    try {
      const response: any = await this.apiService.getUserProfilebyId(userId).toPromise();
      return response?.profile || 'assets/default-avatar.png';
    } catch (error) {
      console.warn(`⚠️ Failed to fetch avatar for user ${userId}:`, error);
      return 'assets/default-avatar.png';
    }
  }

  private async showInfoToast() {
    const t = await this.toastCtrl.create({
      message: 'Full message data not available — opened from key only.',
      duration: 2000,
      color: 'medium'
    });
    await t.present();
  }

  // Get list of users who have read the message
  get readByUsers(): ReceiptUser[] {
    if (!this.message?.receipts?.read?.readBy) return [];
    return this.message.receipts.read.readBy.map((r: any) => ({
      userId: r.userId,
      userName: r.userName || r.userId,
      userAvatar: r.userAvatar || 'assets/default-avatar.png',
      timestamp: r.timestamp
    }));
  }

  // Get list of users who have received but not read
  get deliveredToUsers(): ReceiptUser[] {
    if (!this.message?.receipts?.delivered?.deliveredTo) return [];
    
    const readUserIds = new Set(
      this.message.receipts.read?.readBy?.map((r: any) => r.userId) || []
    );
    
    return this.message.receipts.delivered.deliveredTo
      .filter((r: any) => !readUserIds.has(r.userId))
      .map((r: any) => ({
        userId: r.userId,
        userName: r.userName || r.userId,
        userAvatar: r.userAvatar || 'assets/default-avatar.png',
        timestamp: r.timestamp
      }));
  }

  // Get ALL users who have received the message
  get allDeliveredUsers(): ReceiptUser[] {
    if (!this.message?.receipts?.delivered?.deliveredTo) return [];
    
    return this.message.receipts.delivered.deliveredTo.map((r: any) => ({
      userId: r.userId,
      userName: r.userName || r.userId,
      userAvatar: r.userAvatar || 'assets/default-avatar.png',
      timestamp: r.timestamp
    }));
  }

  // For 1-1 chat: Check if message is read
  get isRead(): boolean {
    if (this.isGroupChat) return false;
    if (!this.message?.receipts?.read) return false;
    return this.message.receipts.read.status;
  }

  // For 1-1 chat: Get read timestamp
  get readTimestamp(): string | number | Date | null {
    if (this.isGroupChat) return null;
    if (!this.message?.receipts?.read?.readBy) return null;
    
    const receipt = this.message.receipts.read.readBy[0];
    return receipt?.timestamp || null;
  }

  // For 1-1 chat: Check if message is delivered
  get isDelivered(): boolean {
    if (this.isGroupChat) return false;
    if (!this.message?.receipts?.delivered) return false;
    return this.message.receipts.delivered.status;
  }

  // For 1-1 chat: Get delivered timestamp
  get deliveredTimestamp(): string | number | Date | null {
    if (this.isGroupChat) return null;
    if (!this.message?.receipts?.delivered?.deliveredTo) return null;
    
    const receipt = this.message.receipts.delivered.deliveredTo[0];
    return receipt?.timestamp || null;
  }

  formatDate(ts: any): string {
    if (!ts && ts !== 0) return '';

    let tnum: number;
    if (typeof ts === 'string') {
      const parsed = Number(ts);
      if (Number.isNaN(parsed)) {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        return this.formatDateFromDate(d);
      }
      tnum = parsed;
    } else if (typeof ts === 'number') {
      tnum = ts;
    } else {
      return '';
    }

    if (tnum < 1e11) {
      tnum = tnum * 1000;
    }

    const d = new Date(tnum);
    if (isNaN(d.getTime())) return '';

    return this.formatDateFromDate(d);
  }

  private formatDateFromDate(d: Date): string {
    const now = new Date();

    const sameDay = d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.getFullYear() === yesterday.getFullYear()
      && d.getMonth() === yesterday.getMonth()
      && d.getDate() === yesterday.getDate();

    const timeStr = this.formatTime(d);

    if (sameDay) {
      return `Today at ${timeStr}`;
    } else if (isYesterday) {
      return `Yesterday, ${timeStr}`;
    } else {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}, ${timeStr}`;
    }
  }

  private formatTime(d: Date): string {
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const mins = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${mins} ${ampm}`;
  }
}