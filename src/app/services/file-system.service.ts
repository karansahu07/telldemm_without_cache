import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import imageCompression from 'browser-image-compression';

@Injectable({ providedIn: 'root' })
export class FileSystemService {
  private folderName = 'ChatMedia';
  private sentFolder = 'sent';
  private receivedFolder = 'received';

  public async init() {
    await this.createBaseFolder();
    await this.ensureSubFolders();
  }

  private async createBaseFolder(): Promise<void> {
    try {
      await Filesystem.mkdir({
        path: this.folderName,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch (err: any) {
      if (!err.message?.includes('Directory exists')) {
        // console.error('Error creating base ChatMedia folder:', err);
      }
    }
  }

  private async ensureSubFolders(): Promise<void> {
    for (const sub of [this.sentFolder, this.receivedFolder]) {
      try {
        await Filesystem.mkdir({
          path: `${this.folderName}/${sub}`,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch (err: any) {
        if (!err.message?.includes('Directory exists')) {
          // console.error(`Error creating ${sub} folder:`, err);
        }
      }
    }
  }

  private async compressIfNeeded(file: Blob, fallbackName = ''): Promise<Blob> {
    let type: string | undefined = (file as any)?.type;

    if (!type || typeof type !== 'string') {
      type = this.getMimeTypeFromName(fallbackName) || '';
    }

    if (!type.startsWith('image/')) {
      return file;
    }

    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
    };

    //console.log("sgergsrg", typeof file);
    try {
      return await imageCompression(file as any, options);
    } catch (err) {
      console.warn('Image compression failed:', err);
      return file;
    }
  }

  private getMimeTypeFromName(filename: string): string | null {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'mp4':
        return 'video/mp4';
      case 'mp3':
        return 'audio/mpeg';
      default:
        return null;
    }
  }

  public convertToBase64(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  public convertToBlob(base64Data: string, mimeType?: string): Blob {
    const parts = base64Data.split(',');
    const base64String = parts.length > 1 ? parts[1] : parts[0];

    const byteCharacters = atob(base64String);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: mimeType || '' });
  }

  private async saveFile(relativePath: string, file: Blob): Promise<string> {
    const compressedFile = await this.compressIfNeeded(file, relativePath);
    //console.log("type of ", typeof compressedFile);
    const base64Data = await this.convertToBase64(compressedFile);
    const fullPath = `${this.folderName}/${relativePath}`;

    await Filesystem.writeFile({
      path: fullPath,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true, // Ensure nested folder is handled
    });

    const uriResult = await Filesystem.getUri({
      path: fullPath,
      directory: Directory.Documents,
    });

    return uriResult.uri;
  }

  async saveFileToSent(filename: string, file: Blob): Promise<string> {
    return this.saveFile(`${this.sentFolder}/${filename}`, file);
  }

  async saveFileToReceived(filename: string, file: Blob): Promise<string> {
    return this.saveFile(`${this.receivedFolder}/${filename}`, file);
  }

  async getFilePreview(relativePath: string): Promise<string | null> {
    if(!relativePath) return null;
    try {
      const path = relativePath.split(this.folderName)[1];
      const videoFileUri = await Filesystem.getUri({
        directory: Directory.Documents,
        // path: 'chatmedia/received/sample.mp4'
        path: `${this.folderName}/${path}`,
      });

      return Capacitor.convertFileSrc(videoFileUri.uri);
      // const result: any = await Filesystem.readFile({
      //   path: `${this.folderName}/${path}`,
      //   directory: Directory.Documents, });

      // const rawBase64 = result.data;

      // const mimeType = this.getMimeTypeFromName(relativePath);

      // return `data:${mimeType};base64,${rawBase64}`;
    } catch (err) {
      console.error('Error reading file preview:', err);
      return null;
    }
  }

  private extractRelativePath(
    fullPath: string,
    baseFolder: string = 'ChatMedia'
  ): string | null {
    const cleanedPath = fullPath.replace(/^file:\/+/, '');
    const baseIndex = cleanedPath.indexOf(`/${baseFolder}/`);
    if (baseIndex === -1) return null;
    const relativePath = cleanedPath.substring(
      baseIndex + baseFolder.length + 1
    );
    return `/${relativePath}`;
  }

  async getFile(relativePath: string): Promise<Blob | null> {
    const path = this.extractRelativePath(relativePath);
    try {
      const result: any = await Filesystem.readFile({
        path: `${this.folderName}/${path}`,
        directory: Directory.Documents,
      });

      const rawBase64 = result.data;

      let base64String = rawBase64;
      let mimeType = 'application/octet-stream';

      if (rawBase64.startsWith('data:')) {
        const matches = rawBase64.match(/^data:(.*?);base64,(.*)$/);
        if (matches) {
          mimeType = matches[1];
          base64String = matches[2];
        }
      }

      const byteCharacters = atob(base64String);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      return new Blob([byteArray], { type: mimeType });
    } catch (err) {
      console.error('Error reading file as Blob:', err);
      return null;
    }
  }

  async deleteFile(relativePath: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: `${this.folderName}/${relativePath}`,
        directory: Directory.Documents,
      });
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  }

  async listFiles(subfolder: 'sent' | 'received'): Promise<string[]> {
    try {
      const result: any = await Filesystem.readdir({
        path: `${this.folderName}/${subfolder}`,
        directory: Directory.Documents,
      });
      return result.files || [];
    } catch (err) {
      console.error('Error listing files:', err);
      return [];
    }
  }
}
