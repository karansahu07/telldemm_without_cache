import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChannelAllPage } from './channel-all.page';

describe('ChannelAllPage', () => {
  let component: ChannelAllPage;
  let fixture: ComponentFixture<ChannelAllPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChannelAllPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
