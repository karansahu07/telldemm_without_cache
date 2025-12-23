import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

@Injectable({ providedIn: 'root' })
export class LocalStorageService {
  private _storage: Storage | null = null;
  private _initPromise: Promise<void> | null = null;

  constructor(private storage: Storage) {
    console.log('[LocalStorageService] constructor');
    this._initPromise = this.init();
  }

  private async init(): Promise<void> {
    if (this._storage) {
      console.log('[LocalStorageService] init: storage already set');
      return;
    }
    console.log('[LocalStorageService] init: creating storage...');
    this._storage = await this.storage.create();
    console.log('[LocalStorageService] init: storage created');
  }

  private async ready(): Promise<Storage> {
    if (!this._storage) {
      console.log('[LocalStorageService] ready: storage not ready, waiting init');
      if (!this._initPromise) {
        this._initPromise = this.init();
      }
      await this._initPromise;
    } else {
      console.log('[LocalStorageService] ready: storage already ready');
    }
    return this._storage!;
  }

  async get<T = any>(key: string): Promise<T | null> {
    console.log('[LocalStorageService] get called for key:', key);
    const s = await this.ready();
    const value = await s.get(key);
    console.log('[LocalStorageService] get result for', key, '=>', value);
    return value;
  }

  async set(key: string, value: any): Promise<void> {
    console.log('[LocalStorageService] set called for key:', key, 'value:', value);
    const s = await this.ready();
    await s.set(key, value);
    console.log('[LocalStorageService] set completed for key:', key);
  }

  async remove(key: string): Promise<void> {
    console.log('[LocalStorageService] remove called for key:', key);
    const s = await this.ready();
    await s.remove(key);
    console.log('[LocalStorageService] remove completed for key:', key);
  }
}
