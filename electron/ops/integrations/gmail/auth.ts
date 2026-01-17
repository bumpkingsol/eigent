import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { BrowserWindow } from 'electron';
import * as fs from 'fs';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
];

export class GmailAuth {
  private oauth2Client: OAuth2Client;
  private tokenPath: string;

  constructor(credentialsPath: string, tokenPath: string) {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    this.tokenPath = tokenPath;
  }

  async getAuthenticatedClient(): Promise<OAuth2Client> {
    // Try to load existing token
    if (fs.existsSync(this.tokenPath)) {
      const token = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
      this.oauth2Client.setCredentials(token);
      return this.oauth2Client;
    }

    // Need to authenticate
    throw new Error('Not authenticated. Call authenticate() first.');
  }

  async authenticate(): Promise<OAuth2Client> {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    // Open auth URL in browser window
    const authWindow = new BrowserWindow({
      width: 600,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
      },
    });

    authWindow.loadURL(authUrl);

    return new Promise((resolve, reject) => {
      authWindow.webContents.on('will-redirect', async (event, url) => {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');

        if (code) {
          try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);

            // Save token
            fs.writeFileSync(this.tokenPath, JSON.stringify(tokens));

            authWindow.close();
            resolve(this.oauth2Client);
          } catch (error) {
            reject(error);
          }
        }
      });

      authWindow.on('closed', () => {
        reject(new Error('Auth window closed'));
      });
    });
  }

  isAuthenticated(): boolean {
    return fs.existsSync(this.tokenPath);
  }
}
