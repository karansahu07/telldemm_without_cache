// import { Injectable } from '@angular/core';

// @Injectable({
//   providedIn: 'root'
// })
// export class FileStorage {
  
// }
// ============================================================================
// OPTION 1: IndexedDB Binary Storage (RECOMMENDED - Most Optimized)
// ============================================================================

// Create a separate service for binary file storage
// file-storage.service.ts

// src/app/pages/channels/services/file-storage.service.ts
import { Injectable } from '@angular/core';

interface StoredFile {
  id: string;
  blob: Blob;
  fileName: string;
  fileType: string;
  fileSize: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class FileStorageService {
  private dbName = 'offline_files_db';
  private storeName = 'files';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Initialize immediately
    this.initPromise = this.initDB();
  }

  /**
   * Initialize IndexedDB for binary storage
   */
  private async initDB(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        console.error('❌ IndexedDB open failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB initialized for file storage');
        resolve();
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('✅ Created IndexedDB object store for files');
        }
      };
    });
  }

  /**
   * Ensure DB is initialized before operations
   */
  private async ensureDB(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.db) {
      await this.initDB();
    }
  }

  /**
   * Store file as Blob (no size overhead!)
   */
  async storeFile(id: string, file: File): Promise<void> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);

      const storedFile: StoredFile = {
        id,
        blob: file, // Store as Blob directly - no overhead!
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        timestamp: Date.now()
      };

      const request = objectStore.put(storedFile);

      request.onsuccess = () => {
        console.log(`✅ Stored file in IndexedDB: ${id} (${this.formatBytes(file.size)})`);
        resolve();
      };

      request.onerror = () => {
        console.error('❌ Failed to store file:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Retrieve file as Blob
   */
  async getFile(id: string): Promise<Blob | null> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = () => {
        const result = request.result as StoredFile | undefined;
        if (result) {
          console.log(`📱 Retrieved file from IndexedDB: ${id}`);
          resolve(result.blob);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('❌ Failed to get file:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get Blob URL for display (efficient!)
   */
  async getFileURL(id: string): Promise<string | null> {
    const blob = await this.getFile(id);
    if (!blob) return null;

    // Create object URL (no memory overhead, just a pointer)
    const url = URL.createObjectURL(blob);
    console.log(`✅ Created Blob URL for: ${id}`);
    return url;
  }

  /**
   * Get file metadata
   */
  async getFileInfo(id: string): Promise<Omit<StoredFile, 'blob'> | null> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = () => {
        const result = request.result as StoredFile | undefined;
        if (result) {
          const { blob, ...info } = result;
          resolve(info);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Check if file exists
   */
  async fileExists(id: string): Promise<boolean> {
    const info = await this.getFileInfo(id);
    return info !== null;
  }

  /**
   * Delete file
   */
  async deleteFile(id: string): Promise<void> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.delete(id);

      request.onsuccess = () => {
        console.log(`🧹 Deleted file from IndexedDB: ${id}`);
        resolve();
      };

      request.onerror = () => {
        console.error('❌ Failed to delete file:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all stored files
   */
  async getAllFiles(): Promise<StoredFile[]> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        console.log(`📊 Retrieved ${request.result.length} files from IndexedDB`);
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear old files (cleanup)
   */
  async clearOldFiles(daysOld: number = 7): Promise<number> {
    await this.ensureDB();

    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const index = objectStore.index('timestamp');
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));

      let deletedCount = 0;

      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          console.log(`🧹 Cleared ${deletedCount} old files`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all files
   */
  async clearAllFiles(): Promise<void> {
    await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.clear();

      request.onsuccess = () => {
        console.log('✅ Cleared all files from IndexedDB');
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get storage usage
   */
  async getStorageUsage(): Promise<{ count: number; totalSize: string; totalBytes: number }> {
    const files = await this.getAllFiles();
    const totalBytes = files.reduce((sum, f) => sum + f.fileSize, 0);
    
    return {
      count: files.length,
      totalSize: this.formatBytes(totalBytes),
      totalBytes
    };
  }

  /**
   * Format bytes to human-readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}