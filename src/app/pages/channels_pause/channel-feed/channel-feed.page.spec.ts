import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChannelFeedPage } from './channel-feed.page';

describe('ChannelFeedPage', () => {
  let component: ChannelFeedPage;
  let fixture: ComponentFixture<ChannelFeedPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChannelFeedPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
