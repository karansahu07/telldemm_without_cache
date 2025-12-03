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

  constructor(private popoverCtrl: PopoverController) {}

  dismiss(option?: string) {
    this.popoverCtrl.dismiss({ selected: option });
  }

  // get menuOptions() {
  //   if (this.chatType === 'group') {
  //     return ['Group Info','Group Media','Search','Add Members', 'Exit Group', 'clear chat'];
  //   } else {
  //     return ['View Contact', 'Search', 'Mute Notifications wip', 'clear chat'];
  //   }
  // }
  get menuOptions() {
  if (this.chatType === 'group') {
    return [
      'Group Info (DemmRoom Info)',
      'Group Media (DemmVault)',
      'Search (FindTell)',
      'Add Members (Add Demmians)',
      'Exit Group (Leave DemmRoom)',
      'Clear Chat (Clear DemmChat)'
    ];
  } else {
    return [
      'View Contact (View Demmian)',
      'Search (FindTell)',
      'Mute Notifications (QuietTell) wip',
      'Clear Chat (Clear DemmChat)'
    ];
  }
}


}
