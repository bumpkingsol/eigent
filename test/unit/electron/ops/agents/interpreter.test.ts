import { describe, it, expect } from 'vitest';
import { InterpreterAgent } from '../../../../../electron/ops/agents/interpreter';
import type { ObservationEvent } from '../../../../../src/types/ops';

describe('InterpreterAgent', () => {
  const agent = new InterpreterAgent();

  it('creates episode from email observations', () => {
    const observations: ObservationEvent[] = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
        source: {
          app_bundle_id: 'com.google.Chrome',
          app_name: 'Google Chrome',
          window_title: 'Inbox - Gmail',
          window_id: 1,
          url: 'https://mail.google.com',
        },
        event_type: 'window_focused',
        payload: {},
        redaction_applied: [],
        confidence: 1.0,
      },
      {
        id: '2',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
        source: {
          app_bundle_id: 'com.google.Chrome',
          app_name: 'Google Chrome',
          window_title: 'RE: Meeting Tomorrow - Gmail',
          window_id: 1,
          url: 'https://mail.google.com/mail/u/0/#inbox/abc123',
        },
        event_type: 'window_focused',
        payload: { dom_excerpt: 'Hi, can we reschedule...' },
        redaction_applied: [],
        confidence: 1.0,
      },
    ];

    const episode = agent.interpret(observations);

    expect(episode).toBeDefined();
    expect(episode!.intent).toContain('email');
    expect(episode!.observation_ids).toHaveLength(2);
  });

  it('detects episode boundary on app switch', () => {
    const observations: ObservationEvent[] = [
      {
        id: '1',
        timestamp: '2026-01-17T10:00:00.000Z',
        session_id: 'session-1',
        source: {
          app_bundle_id: 'com.google.Chrome',
          app_name: 'Chrome',
          window_title: 'Gmail',
          window_id: 1,
        },
        event_type: 'app_activated',
        payload: {},
        redaction_applied: [],
        confidence: 1.0,
      },
      {
        id: '2',
        timestamp: '2026-01-17T10:01:00.000Z',
        session_id: 'session-1',
        source: {
          app_bundle_id: 'com.apple.finder',
          app_name: 'Finder',
          window_title: 'Documents',
          window_id: 2,
        },
        event_type: 'app_activated',
        payload: {},
        redaction_applied: [],
        confidence: 1.0,
      },
    ];

    const shouldClose = agent.shouldCloseEpisode(observations[0], observations[1]);
    expect(shouldClose).toBe(true);
  });
});
