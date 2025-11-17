// import { Component, OnInit } from '@angular/core';

// @Component({
//   selector: 'app-reaction-button',
//   templateUrl: './reaction-button.component.html',
//   styleUrls: ['./reaction-button.component.scss'],
// })
// export class ReactionButtonComponent  implements OnInit {

//   constructor() { }

//   ngOnInit() {}

// }

// import { CommonModule } from '@angular/common';
// import { Component, EventEmitter, Input, Output } from '@angular/core';
// import { FormsModule } from '@angular/forms';
// import { RouterModule } from '@angular/router';
// import { IonicModule } from '@ionic/angular';

// @Component({
//   selector: 'app-reaction-button',
//   standalone: true,
//   // imports: [CommonModule, IonicModule,RouterModule],
//   imports: [IonicModule, CommonModule,FormsModule,RouterModule],
//   template: `<ion-button fill="clear" size="small" (click)="clicked.emit()">{{icon}} <span *ngIf="count"> {{count}}</span></ion-button>`,
// })
// export class ReactionButtonComponent {
//   @Input() icon = '👍';
//   @Input() count: number | undefined;
//   @Output() clicked = new EventEmitter<void>();
// }
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-reaction-button',
  standalone: true,
  templateUrl: './reaction-button.component.html'
})
export class ReactionButtonComponent {
  @Input() count?: number;
  @Input() emoji: string = '👍';
  @Output() clicked = new EventEmitter<string>();

  onClick() {
    this.clicked.emit(this.emoji);
  }
}



