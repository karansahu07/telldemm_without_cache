// import { Component, OnInit } from '@angular/core';

// @Component({
//   selector: 'app-channel-detail',
//   templateUrl: './channel-detail.page.html',
//   styleUrls: ['./channel-detail.page.scss'],
// })
// export class ChannelDetailPage implements OnInit {

//   constructor() { }

//   ngOnInit() {
//   }

// }


import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
// import { ChannelService } from '../services/channel.service';
import { IonicModule, ModalController } from '@ionic/angular';
import { ChannelPrivacyModalComponent } from '../modals/channel-privacy-modal/channel-privacy-modal.component';
import { ChannelService } from '../services/channel';
import { CommonModule } from '@angular/common';
import { FooterTabsComponent } from 'src/app/components/footer-tabs/footer-tabs.component';
import { FormsModule } from '@angular/forms';
import { ChannelFeedPage } from '../channel-feed/channel-feed.page';
import { ChannelCardComponent } from '../components/channel-card/channel-card.component';
import { ChannelListItemComponent } from '../components/channel-list-item/channel-list-item.component';
import { ReactionButtonComponent } from '../components/reaction-button/reaction-button.component';
import { RegionFilterModalComponent } from '../modals/region-filter-modal/region-filter-modal.component';

@Component({
  selector: 'app-channel-detail',
  templateUrl: './channel-detail.page.html',
  styleUrls: ['./channel-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule,FormsModule,ChannelListItemComponent,
    ChannelCardComponent,
    ReactionButtonComponent,
    ChannelDetailPage,
    ChannelFeedPage,
    ChannelPrivacyModalComponent,
    RegionFilterModalComponent,],
})
export class ChannelDetailPage implements OnInit {
  channel: any;
  id!: any;
  constructor(
    private route: ActivatedRoute,
    private channelService: ChannelService,
    private modalCtrl: ModalController,
    private router: Router
  ) {}

  async ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id');
    // this.channel = await this.channelService.getChannel(this.id);
  }

  async showPrivacy() {
    const modal = await this.modalCtrl.create({
      component: ChannelPrivacyModalComponent,
      componentProps: { channel: this.channel },
    });
    await modal.present();
  }

  openFeed(id: string) {
  this.router.navigate(['/channels','feed', id]);
}

 reportChannel() {
    // TODO: implement reporting logic
    console.log('report clicked');
  }
}
