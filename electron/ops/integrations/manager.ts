import { GmailIntegration } from './gmail';
import { CalendarIntegration } from './calendar';
import { NotionIntegration } from './notion';
import { DriveSync } from '../sync/drive-sync';

export interface IntegrationConfig {
  google?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  notion?: {
    apiKey: string;
  };
}

export class IntegrationManager {
  private gmail: GmailIntegration | null = null;
  private calendar: CalendarIntegration | null = null;
  private notion: NotionIntegration | null = null;
  private drive: DriveSync | null = null;

  async initialize(config: IntegrationConfig): Promise<void> {
    if (config.google) {
      // OAuth setup would go here - for now just note it's not implemented
      // This is a placeholder that will be expanded when OAuth is added
      console.log('[IntegrationManager] Google OAuth not yet implemented');
    }

    if (config.notion?.apiKey) {
      this.notion = new NotionIntegration(config.notion.apiKey);
    }
  }

  async execute(
    actionType: string,
    content: string,
    metadata: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    switch (actionType) {
      case 'email_draft':
        return this.executeEmailDraft(content, metadata);
      case 'calendar_event':
        return this.executeCalendarEvent(content, metadata);
      case 'notion_page':
        return this.executeNotionPage(content, metadata);
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  private async executeEmailDraft(
    content: string,
    metadata: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.gmail) throw new Error('Gmail not configured');

    const draftId = await this.gmail.createDraft({
      to: metadata.to as string,
      subject: metadata.subject as string,
      body: content,
    });

    return { draft_id: draftId };
  }

  private async executeCalendarEvent(
    content: string,
    metadata: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.calendar) throw new Error('Calendar not configured');

    const eventData = JSON.parse(content);
    const eventId = await this.calendar.createEvent({
      summary: eventData.summary || (metadata.summary as string),
      description: eventData.description,
      start: new Date(eventData.start || (metadata.start as string)),
      end: new Date(eventData.end || (metadata.end as string)),
      attendees: eventData.attendees || (metadata.attendees as string[]),
      addMeetLink: eventData.addMeetLink ?? true,
    });

    return { event_id: eventId };
  }

  private async executeNotionPage(
    content: string,
    metadata: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.notion) throw new Error('Notion not configured');

    const pageId = await this.notion.createPage({
      parentId: metadata.parent_id as string,
      title: metadata.title as string,
      content,
    });

    return { page_id: pageId };
  }

  isConfigured(integration: 'gmail' | 'calendar' | 'notion' | 'drive'): boolean {
    switch (integration) {
      case 'gmail':
        return this.gmail !== null;
      case 'calendar':
        return this.calendar !== null;
      case 'notion':
        return this.notion !== null;
      case 'drive':
        return this.drive !== null;
      default:
        return false;
    }
  }
}
