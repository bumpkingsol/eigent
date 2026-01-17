import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

export interface Email {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
}

export class GmailIntegration {
  private gmail: ReturnType<typeof google.gmail>;

  constructor(private auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async getRecentEmails(maxResults: number = 10): Promise<Email[]> {
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults,
      labelIds: ['INBOX'],
    });

    const messages = response.data.messages || [];
    const emails: Email[] = [];

    for (const msg of messages.slice(0, 5)) {
      const detail = await this.gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name === name)?.value || '';

      emails.push({
        id: msg.id!,
        threadId: msg.threadId!,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        snippet: detail.data.snippet || '',
        date: getHeader('Date'),
      });
    }

    return emails;
  }

  async createDraft(draft: EmailDraft): Promise<string> {
    const message = this.createMimeMessage(draft);
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage,
          threadId: draft.replyTo,
        },
      },
    });

    return response.data.id!;
  }

  async sendDraft(draftId: string): Promise<void> {
    await this.gmail.users.drafts.send({
      userId: 'me',
      requestBody: { id: draftId },
    });
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.gmail.users.drafts.delete({
      userId: 'me',
      id: draftId,
    });
  }

  private createMimeMessage(draft: EmailDraft): string {
    const lines = [
      `To: ${draft.to}`,
      `Subject: ${draft.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      draft.body,
    ];
    return lines.join('\r\n');
  }
}
