import { v7 as uuidv7 } from 'uuid';
import type { ObservationEvent, TaskEpisode } from '../../../src/types/ops';

interface IntentPattern {
  pattern: RegExp;
  intent: string;
  confidence: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  { pattern: /gmail|mail\.google/i, intent: 'email_interaction', confidence: 0.8 },
  { pattern: /calendar\.google/i, intent: 'calendar_interaction', confidence: 0.8 },
  { pattern: /notion\.so/i, intent: 'notion_interaction', confidence: 0.8 },
  { pattern: /slack/i, intent: 'messaging', confidence: 0.7 },
];

const UNRELATED_APPS = [
  'com.apple.finder',
  'com.apple.Preview',
  'com.spotify.client',
  'com.apple.Music',
];

export class InterpreterAgent {
  private episodeTimeout = 5 * 60 * 1000; // 5 minutes

  interpret(observations: ObservationEvent[]): TaskEpisode | null {
    if (observations.length === 0) return null;

    const intent = this.detectIntent(observations);
    const context = this.extractContext(observations);

    return {
      id: uuidv7(),
      created_at: observations[0].timestamp,
      updated_at: observations[observations.length - 1].timestamp,
      observation_ids: observations.map((o) => o.id),
      intent,
      context,
      status: 'open',
    };
  }

  shouldCloseEpisode(
    lastObservation: ObservationEvent,
    newObservation: ObservationEvent
  ): boolean {
    // Time gap check
    const lastTime = new Date(lastObservation.timestamp).getTime();
    const newTime = new Date(newObservation.timestamp).getTime();

    if (newTime - lastTime > this.episodeTimeout) {
      return true;
    }

    // App switch to unrelated app
    const lastApp = lastObservation.source.app_bundle_id;
    const newApp = newObservation.source.app_bundle_id;

    if (lastApp !== newApp) {
      const isUnrelatedSwitch =
        UNRELATED_APPS.includes(newApp) ||
        !this.appsRelated(lastApp, newApp);

      if (isUnrelatedSwitch) {
        return true;
      }
    }

    return false;
  }

  private detectIntent(observations: ObservationEvent[]): string {
    const urls = observations
      .map((o) => o.source.url)
      .filter(Boolean)
      .join(' ');

    const titles = observations
      .map((o) => o.source.window_title)
      .join(' ');

    const combined = `${urls} ${titles}`;

    for (const { pattern, intent } of INTENT_PATTERNS) {
      if (pattern.test(combined)) {
        return intent;
      }
    }

    return 'general_activity';
  }

  private extractContext(observations: ObservationEvent[]): Record<string, unknown> {
    const context: Record<string, unknown> = {
      apps: [...new Set(observations.map((o) => o.source.app_name))],
      urls: [...new Set(observations.map((o) => o.source.url).filter(Boolean))],
      duration_ms: this.calculateDuration(observations),
    };

    // Extract DOM excerpts for email context
    const excerpts = observations
      .map((o) => o.payload.dom_excerpt)
      .filter(Boolean);

    if (excerpts.length > 0) {
      context.content_preview = excerpts.join('\n').substring(0, 500);
    }

    return context;
  }

  private calculateDuration(observations: ObservationEvent[]): number {
    if (observations.length < 2) return 0;

    const first = new Date(observations[0].timestamp).getTime();
    const last = new Date(observations[observations.length - 1].timestamp).getTime();

    return last - first;
  }

  private appsRelated(app1: string, app2: string): boolean {
    // Browser-to-browser is related
    const browsers = ['com.google.Chrome', 'com.apple.Safari', 'org.mozilla.firefox'];
    if (browsers.includes(app1) && browsers.includes(app2)) {
      return true;
    }

    // Same vendor is related
    const vendor1 = app1.split('.').slice(0, 2).join('.');
    const vendor2 = app2.split('.').slice(0, 2).join('.');

    return vendor1 === vendor2;
  }
}
