import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import type { ProposalStatus } from '../../src/types/ops.js';

// Database row types (JSON fields stored as strings)
export interface ObservationRow {
  id: string;
  timestamp: string;
  session_id: string;
  source: string; // JSON string
  event_type: string;
  payload: string; // JSON string
  redaction_applied: string; // JSON string
  confidence: number;
  created_at?: string;
}

export interface EpisodeRow {
  id: string;
  created_at: string;
  updated_at: string;
  observation_ids: string; // JSON string
  intent: string;
  context: string; // JSON string
  status: string;
}

export interface ProposalRow {
  id: string;
  created_at: string;
  episode_id: string;
  action_type: string;
  title: string;
  summary: string;
  draft_content: string;
  confidence: number;
  risk_level: string;
  status: string;
  metadata: string; // JSON string
  updated_at?: string;
}

export interface PlaybookRow {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  name: string;
  description: string;
  trigger: string; // JSON string
  actions: string; // JSON string
  mode: string;
  max_daily_executions: number;
  stats: string; // JSON string
}

export interface DecisionRow {
  id: string;
  timestamp: string;
  proposal_id: string;
  decision: string;
  edit_distance: number | null;
  execution_result: string | null;
  error_message: string | null;
}

// Handle __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class OpsDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    const migrationPath = path.join(__dirname, 'migrations', '001_initial.sql');
    const migration = fs.readFileSync(migrationPath, 'utf-8');
    this.db.exec(migration);
  }

  listTables(): string[] {
    const rows = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[];
    return rows.map(r => r.name);
  }

  // Observations
  insertObservation(obs: ObservationRow): void {
    const stmt = this.db.prepare(`
      INSERT INTO observations (id, timestamp, session_id, source, event_type, payload, redaction_applied, confidence)
      VALUES (@id, @timestamp, @session_id, @source, @event_type, @payload, @redaction_applied, @confidence)
    `);
    stmt.run(obs);
  }

  getObservation(id: string): ObservationRow | undefined {
    return this.db.prepare('SELECT * FROM observations WHERE id = ?').get(id) as ObservationRow | undefined;
  }

  getRecentObservations(limit: number = 100): ObservationRow[] {
    return this.db.prepare(
      'SELECT * FROM observations ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as ObservationRow[];
  }

  // Proposals
  insertProposal(proposal: Omit<ProposalRow, 'updated_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO proposals (id, created_at, episode_id, action_type, title, summary, draft_content, confidence, risk_level, status, metadata)
      VALUES (@id, @created_at, @episode_id, @action_type, @title, @summary, @draft_content, @confidence, @risk_level, @status, @metadata)
    `);
    stmt.run(proposal);
  }

  getPendingProposals(): ProposalRow[] {
    return this.db.prepare(
      "SELECT * FROM proposals WHERE status = 'pending' ORDER BY created_at DESC"
    ).all() as ProposalRow[];
  }

  updateProposalStatus(id: string, status: ProposalStatus): void {
    this.db.prepare(
      'UPDATE proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(status, id);
  }

  getProposal(id: string): ProposalRow | undefined {
    return this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as ProposalRow | undefined;
  }

  // Playbooks
  insertPlaybook(playbook: Omit<PlaybookRow, 'version'> & { version?: number }): void {
    const stmt = this.db.prepare(`
      INSERT INTO playbooks (id, created_at, updated_at, name, description, trigger, actions, mode, max_daily_executions, stats)
      VALUES (@id, @created_at, @updated_at, @name, @description, @trigger, @actions, @mode, @max_daily_executions, @stats)
    `);
    stmt.run(playbook);
  }

  getAllPlaybooks(): PlaybookRow[] {
    return this.db.prepare('SELECT * FROM playbooks ORDER BY updated_at DESC').all() as PlaybookRow[];
  }

  // Decisions
  insertDecision(decision: DecisionRow): void {
    const stmt = this.db.prepare(`
      INSERT INTO decisions (id, timestamp, proposal_id, decision, edit_distance, execution_result, error_message)
      VALUES (@id, @timestamp, @proposal_id, @decision, @edit_distance, @execution_result, @error_message)
    `);
    stmt.run(decision);
  }

  close(): void {
    this.db.close();
  }
}
