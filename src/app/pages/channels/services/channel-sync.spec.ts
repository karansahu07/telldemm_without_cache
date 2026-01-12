import { TestBed } from '@angular/core/testing';

import { ChannelSync } from './channel-sync';

describe('ChannelSync', () => {
  let service: ChannelSync;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChannelSync);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
