import { TestBed } from '@angular/core/testing';

import { Firebasesyncchannel } from './firebasesyncchannel';

describe('Firebasesyncchannel', () => {
  let service: Firebasesyncchannel;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Firebasesyncchannel);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
