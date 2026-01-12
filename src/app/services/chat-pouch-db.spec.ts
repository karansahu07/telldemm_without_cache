import { TestBed } from '@angular/core/testing';

import { ChatPouchDb } from './chat-pouch-db';

describe('ChatPouchDb', () => {
  let service: ChatPouchDb;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChatPouchDb);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
