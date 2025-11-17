// import { Component, OnInit } from '@angular/core';

// @Component({
//   selector: 'app-channel-card',
//   templateUrl: './channel-card.component.html',
//   styleUrls: ['./channel-card.component.scss'],
// })
// export class ChannelCardComponent  implements OnInit {

//   constructor() { }

//   ngOnInit() {}

// }
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-channel-card',
  templateUrl: './channel-card.component.html',
  styleUrls: ['./channel-card.component.scss'],
  standalone: true,
  // imports: [CommonModule, IonicModule,RouterModule],
    imports: [IonicModule, CommonModule,FormsModule,RouterModule],

})
export class ChannelCardComponent {
  @Input() channel: any;
}
