import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { IMessage } from 'src/app/services/sqlite.service';

@Component({
  selector: 'app-message-more-popover',
  templateUrl: './message-more-popover.component.html',
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class MessageMorePopoverComponent {
  @Input() hasText: boolean = true;
  @Input() hasAttachment: boolean = false;
  @Input() isPinned: boolean = false;
  @Input() message: IMessage | null = null;
  @Input() currentUserId: string = '';

  constructor(private popoverCtrl: PopoverController) {}

  /** dismisses the popover and sends the action back to the parent */
  selectOption(action: string) {
    this.popoverCtrl.dismiss(action);
  }

  /** ✅ Show info option ONLY for messages sent by current user (msg.isMe === true) */
  get showInfo(): boolean {
    if (!this.message) return false;
    // Check if the message sender is the current user
    return String(this.message.sender) === String(this.currentUserId);
  }

  /** Copy only if the message has text */
  get showCopy(): boolean {
    return this.hasText;
  }

  /** Share only if the message has an attachment */
  get showShare(): boolean {
    return this.hasAttachment;
  }

  /** Show Pin or Unpin depending on the current state */
  get showPin(): boolean {
    return !this.isPinned;
  }

  get showUnpin(): boolean {
    return this.isPinned;
  }

  /** Allow edit only if:
   *  - message exists,
   *  - current user is the sender,
   *  - within 15 minutes of sending.
   */
  get showEdit(): boolean {
    if (!this.message) return false;
    const now = Date.now();
    const msgTime = new Date(this.message.timestamp).getTime();
    const diff = now - msgTime;
    return (
      String(this.message.sender) === String(this.currentUserId) &&
      diff < 15 * 60 * 1000
    );
  }
}