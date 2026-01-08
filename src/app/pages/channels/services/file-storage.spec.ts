import { TestBed } from '@angular/core/testing';

import { FileStorage } from './file-storage';

describe('FileStorage', () => {
  let service: FileStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FileStorage);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
