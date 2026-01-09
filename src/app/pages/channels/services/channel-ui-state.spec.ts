import { TestBed } from '@angular/core/testing';

import { ChannelUiState } from './channel-ui-state';

describe('ChannelUiState', () => {
  let service: ChannelUiState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChannelUiState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
