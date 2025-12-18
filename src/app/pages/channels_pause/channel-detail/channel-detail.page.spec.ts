import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChannelDetailPage } from './channel-detail.page';

describe('ChannelDetailPage', () => {
  let component: ChannelDetailPage;
  let fixture: ComponentFixture<ChannelDetailPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChannelDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
