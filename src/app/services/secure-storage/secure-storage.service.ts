import { Injectable } from '@angular/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

@Injectable({
  providedIn: 'root'
})
export class SecureStorageService {

  constructor() {}

  /**
   * Unicode-safe base64 encoding
   * Handles emojis and special characters properly
   */
  private utf8ToBase64(str: string): string {
    try {
      // Convert string to UTF-8 bytes, then to base64
      const utf8Bytes = encodeURIComponent(str).replace(
        /%([0-9A-F]{2})/g,
        (match, p1) => String.fromCharCode(parseInt(p1, 16))
      );
      return btoa(utf8Bytes);
    } catch (error) {
      console.error('❌ Error encoding to base64:', error);
      throw new Error(`Failed to encode value: ${error}`);
    }
  }

  /**
   * Unicode-safe base64 decoding
   * Handles emojis and special characters properly
   */
  private base64ToUtf8(str: string): string {
    try {
      // Decode base64 to UTF-8 bytes, then to string
      const decodedStr = atob(str);
      const utf8Str = Array.prototype.map.call(
        decodedStr,
        (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('');
      return decodeURIComponent(utf8Str);
    } catch (error) {
      console.error('❌ Error decoding from base64:', error);
      throw new Error(`Failed to decode value: ${error}`);
    }
  }

  /**
   * Store a value in secure storage with Unicode support
   * @param key Storage key
   * @param value Value to store (can contain emojis and special characters)
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      // Encode value to handle Unicode characters (emojis, etc.)
      const encodedValue = this.utf8ToBase64(value);
      
      await SecureStoragePlugin.set({ key, value: encodedValue });
      
      console.log(`✅ Stored '${key}' successfully`);
    } catch (error) {
      console.error(`❌ Error storing '${key}':`, error);
      throw new Error(`Failed to store item '${key}': ${error}`);
    }
  }

  /**
   * Retrieve a value from secure storage with Unicode support
   * @param key Storage key
   * @returns Decoded value or null if not found
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const { value } = await SecureStoragePlugin.get({ key });
      
      if (!value) {
        return null;
      }
      
      // Decode value to restore Unicode characters
      const decodedValue = this.base64ToUtf8(value);
      
      console.log(`✅ Retrieved '${key}' successfully`);
      return decodedValue;
    } catch (error) {
      console.warn(`⚠️ Item not found or error retrieving '${key}':`, error);
      return null;
    }
  }

  /**
   * Remove a specific item from secure storage
   * @param key Storage key to remove
   */
  async removeItem(key: string): Promise<void> {
    try {
      await SecureStoragePlugin.remove({ key });
      console.log(`✅ Removed '${key}' successfully`);
    } catch (error) {
      console.error(`❌ Error removing '${key}':`, error);
      throw new Error(`Failed to remove item '${key}': ${error}`);
    }
  }

  /**
   * Clear all items from secure storage
   */
  async clearAll(): Promise<void> {
    try {
      await SecureStoragePlugin.clear();
      console.log('✅ Cleared all secure storage successfully');
    } catch (error) {
      console.error('❌ Error clearing secure storage:', error);
      throw new Error(`Failed to clear secure storage: ${error}`);
    }
  }

  /**
   * Check if a key exists in secure storage
   * @param key Storage key to check
   * @returns true if key exists, false otherwise
   */
  async hasItem(key: string): Promise<boolean> {
    try {
      const value = await this.getItem(key);
      return value !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Store multiple items at once
   * @param items Object with key-value pairs
   */
  async setMultiple(items: Record<string, string>): Promise<void> {
    try {
      const promises = Object.entries(items).map(([key, value]) =>
        this.setItem(key, value)
      );
      await Promise.all(promises);
      console.log('✅ Stored multiple items successfully');
    } catch (error) {
      console.error('❌ Error storing multiple items:', error);
      throw new Error(`Failed to store multiple items: ${error}`);
    }
  }

  /**
   * Get multiple items at once
   * @param keys Array of keys to retrieve
   * @returns Object with key-value pairs
   */
  async getMultiple(keys: string[]): Promise<Record<string, string | null>> {
    try {
      const promises = keys.map(async (key) => ({
        key,
        value: await this.getItem(key)
      }));
      
      const results = await Promise.all(promises);
      
      return results.reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, string | null>);
    } catch (error) {
      console.error('❌ Error getting multiple items:', error);
      throw new Error(`Failed to get multiple items: ${error}`);
    }
  }
}