import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
// import { Channel } from '@capacitor/push-notifications';
import { IonicModule } from '@ionic/angular';
interface Channel {
  id: string;
  name: string;
  description?: string;

  // properties used by templates — make optional if sometimes missing
  avatar?: string;      // image url
  verified?: boolean;   // show verified badge
  followers?: number;   // follower count
  following?: boolean;  // is current user following
  // add other fields you need
}
@Component({
  selector: 'app-channel-list-item',
  templateUrl: './channel-list-item.component.html',
  styleUrls: ['./channel-list-item.component.scss'],
  standalone: true,
  // imports: [CommonModule, IonicModule,RouterModule],
    imports: [IonicModule, CommonModule,FormsModule,RouterModule],

})
export class ChannelListItemComponent  implements OnInit {
 @Input() channel!: Channel;               // required input
  @Output() followToggled = new EventEmitter<Channel>();

  onFollowClick(event?: Event) {
    event?.stopPropagation();
    this.followToggled.emit(this.channel);
  }
  constructor() { }

  ngOnInit() {}

}
