import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpsDatabase } from '../../../../electron/ops/database';
import fs from 'fs';
import path from 'path';

describe('OpsDatabase', () => {
  let db: OpsDatabase;
  const testDbPath = path.join(__dirname, 'test-ops.db');

  beforeEach(() => {
    db = new OpsDatabase(testDbPath);
  });

  afterEach(() => {
    db.close();
    // Clean up database file and WAL files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDbPath + '-wal')) {
      fs.unlinkSync(testDbPath + '-wal');
    }
    if (fs.existsSync(testDbPath + '-shm')) {
      fs.unlinkSync(testDbPath + '-shm');
    }
  });

  it('creates tables on initialization', () => {
    const tables = db.listTables();
    expect(tables).toContain('observations');
    expect(tables).toContain('episodes');
    expect(tables).toContain('proposals');
    expect(tables).toContain('playbooks');
    expect(tables).toContain('decisions');
  });

  it('inserts and retrieves observations', () => {
    const obs = {
      id: 'obs-1',
      timestamp: new Date().toISOString(),
      session_id: 'session-1',
      source: JSON.stringify({ app_bundle_id: 'com.test', app_name: 'Test', window_title: 'Test', window_id: 1 }),
      event_type: 'app_activated',
      payload: JSON.stringify({}),
      redaction_applied: JSON.stringify([]),
      confidence: 0.9,
    };

    db.insertObservation(obs);
    const retrieved = db.getObservation('obs-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.session_id).toBe('session-1');
  });

  it('inserts and retrieves proposals', () => {
    const proposal = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Reply to John',
      summary: 'Draft reply',
      draft_content: 'Hello John...',
      confidence: 75,
      risk_level: 'low',
      status: 'pending',
      metadata: JSON.stringify({}),
    };

    db.insertProposal(proposal);
    const pending = db.getPendingProposals();

    expect(pending.length).toBe(1);
    expect(pending[0].title).toBe('Reply to John');
  });
});
