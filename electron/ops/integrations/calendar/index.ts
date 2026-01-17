import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees: string[];
  meetLink?: string;
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendees?: string[];
  addMeetLink?: boolean;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export class CalendarIntegration {
  private calendar: calendar_v3.Calendar;

  constructor(auth: OAuth2Client) {
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  async getUpcomingEvents(maxResults: number = 10): Promise<CalendarEvent[]> {
    const response = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || []).map((event) => ({
      id: event.id || '',
      summary: event.summary || '',
      description: event.description || undefined,
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      attendees: (event.attendees || []).map((a) => a.email || ''),
      meetLink: event.hangoutLink || undefined,
    }));
  }

  async createEvent(params: CreateEventParams): Promise<string> {
    const event: calendar_v3.Schema$Event = {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.start.toISOString() },
      end: { dateTime: params.end.toISOString() },
      attendees: params.attendees?.map((email) => ({ email })),
    };

    if (params.addMeetLink) {
      event.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const response = await this.calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: params.addMeetLink ? 1 : 0,
    });

    return response.data.id || '';
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });
  }

  async updateEvent(eventId: string, updates: Partial<CreateEventParams>): Promise<void> {
    const patch: calendar_v3.Schema$Event = {};

    if (updates.summary) patch.summary = updates.summary;
    if (updates.description) patch.description = updates.description;
    if (updates.start) patch.start = { dateTime: updates.start.toISOString() };
    if (updates.end) patch.end = { dateTime: updates.end.toISOString() };
    if (updates.attendees) patch.attendees = updates.attendees.map((email) => ({ email }));

    await this.calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: patch,
    });
  }

  async findAvailableSlots(
    attendees: string[],
    duration: number, // minutes
    startDate: Date,
    endDate: Date
  ): Promise<TimeSlot[]> {
    const response = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [
          { id: 'primary' },
          ...attendees.map((email) => ({ id: email })),
        ],
      },
    });

    // Find gaps in busy times (simplified)
    const slots: TimeSlot[] = [];
    const busyTimes = response.data.calendars?.primary?.busy || [];

    let current = new Date(startDate);
    const durationMs = duration * 60 * 1000;

    for (const busy of busyTimes) {
      const busyStart = new Date(busy.start || '');

      while (current.getTime() + durationMs <= busyStart.getTime()) {
        slots.push({
          start: new Date(current),
          end: new Date(current.getTime() + durationMs),
        });
        current = new Date(current.getTime() + 30 * 60 * 1000); // 30 min increments
      }

      current = new Date(busy.end || '');
    }

    return slots.slice(0, 5); // Return top 5 slots
  }
}
