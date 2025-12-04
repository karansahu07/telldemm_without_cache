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



