import { TestBed } from '@angular/core/testing';

import { PostOfflineStore } from './post-offline-store';

describe('PostOfflineStore', () => {
  let service: PostOfflineStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PostOfflineStore);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
