import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';

@Component({
  selector: 'app-chat-options-popover',
  templateUrl: './chat-options-popover.component.html',
  styleUrls: ['./chat-options-popover.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class ChatOptionsPopoverComponent {
  @Input() chatType: string = 'private';
  @Input() isMuted: boolean = false; // ✅ NEW: Track mute status

  constructor(private popoverCtrl: PopoverController) {}

  dismiss(option?: string) {
    this.popoverCtrl.dismiss({ selected: option });
  }

  get menuOptions() {
    if (this.chatType === 'group') {
      return [
        'Group Info',
        'Group Media',
        'Search',
        'Add Members',
        'Exit Group',
        this.isMuted ? 'Unmute Notifications' : 'Mute Notifications',
        'Clear Chat'
      ];
    } else {
      return [
        'View Contact',
        'Search',
        this.isMuted ? 'Unmute Notifications' : 'Mute Notifications',
        'Clear Chat'
      ];
    }
  }
}