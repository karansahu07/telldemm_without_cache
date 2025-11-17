import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChannelsPage } from './channels.page';

describe('ChannelsPage', () => {
  let component: ChannelsPage;
  let fixture: ComponentFixture<ChannelsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChannelsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
