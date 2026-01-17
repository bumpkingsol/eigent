import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const EIGENT_FOLDER_NAME = 'Eigent';

export class DriveSync {
  private drive: drive_v3.Drive;
  private folderId: string | null = null;
  private encryptionKey: Buffer | null = null;

  constructor(auth: OAuth2Client) {
    this.drive = google.drive({ version: 'v3', auth });
  }

  async init(passphrase: string): Promise<void> {
    // Derive encryption key from passphrase
    this.encryptionKey = crypto.pbkdf2Sync(passphrase, 'eigent-salt', 100000, 32, 'sha256');

    // Find or create Eigent folder
    this.folderId = await this.getOrCreateFolder();
  }

  private async getOrCreateFolder(): Promise<string> {
    // Search for existing folder
    const response = await this.drive.files.list({
      q: `name='${EIGENT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: 'drive',
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }

    // Create folder
    const folder = await this.drive.files.create({
      requestBody: {
        name: EIGENT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
    });

    return folder.data.id!;
  }

  async uploadFile(localPath: string, remoteName: string): Promise<string> {
    if (!this.folderId || !this.encryptionKey) {
      throw new Error('DriveSync not initialized');
    }

    // Read and encrypt file
    const content = fs.readFileSync(localPath, 'utf-8');
    const encrypted = this.encrypt(content);

    // Check if file exists
    const existing = await this.findFile(remoteName);

    if (existing) {
      // Update existing
      await this.drive.files.update({
        fileId: existing,
        media: {
          mimeType: 'application/octet-stream',
          body: encrypted,
        },
      });
      return existing;
    }

    // Create new
    const response = await this.drive.files.create({
      requestBody: {
        name: remoteName,
        parents: [this.folderId],
      },
      media: {
        mimeType: 'application/octet-stream',
        body: encrypted,
      },
    });

    return response.data.id!;
  }

  async downloadFile(remoteName: string, localPath: string): Promise<boolean> {
    if (!this.encryptionKey) {
      throw new Error('DriveSync not initialized');
    }

    const fileId = await this.findFile(remoteName);
    if (!fileId) return false;

    const response = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    );

    const decrypted = this.decrypt(response.data as string);

    // Ensure directory exists
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(localPath, decrypted);
    return true;
  }

  async syncPlaybooks(localDir: string): Promise<void> {
    // Upload all playbooks
    const files = fs.readdirSync(localDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      await this.uploadFile(path.join(localDir, file), `playbooks/${file}`);
    }
  }

  private async findFile(name: string): Promise<string | null> {
    const response = await this.drive.files.list({
      q: `name='${name}' and '${this.folderId}' in parents and trashed=false`,
      spaces: 'drive',
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }
    return null;
  }

  private encrypt(plaintext: string): string {
    if (!this.encryptionKey) throw new Error('No encryption key');

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      data: encrypted,
    });
  }

  private decrypt(ciphertext: string): string {
    if (!this.encryptionKey) throw new Error('No encryption key');

    const { iv, authTag, data } = JSON.parse(ciphertext);

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
