import { ipcMain, app } from 'electron';
import * as path from 'path';
import { OpsDatabase } from './database';
import { OpsTray } from './tray';
import { ComputerMcpServer } from './mcp-server';
import { InterpreterAgent } from './agents/interpreter';
import { DraftingAgent } from './agents/drafter';
import { PolicyAgent } from './agents/policy';
import { PlaybookMiner } from './agents/playbook-miner';
import type { ObservationEvent } from '../../src/types/ops';

export class OpsLayer {
  private db: OpsDatabase;
  private tray: OpsTray | null = null;
  private mcpServer: ComputerMcpServer;
  private interpreter: InterpreterAgent;
  private drafter: DraftingAgent;
  private policy: PolicyAgent;
  private miner: PlaybookMiner;
  private observationBuffer: ObservationEvent[] = [];

  constructor(private onOpenOpsInbox: () => void) {
    const dbPath = path.join(app.getPath('userData'), 'ops.db');
    this.db = new OpsDatabase(dbPath);

    this.mcpServer = new ComputerMcpServer();
    this.interpreter = new InterpreterAgent();
    this.drafter = new DraftingAgent();
    this.policy = new PolicyAgent();
    this.miner = new PlaybookMiner();

    this.setupEventHandlers();
    this.setupIpc();
  }

  init(): void {
    this.tray = new OpsTray(this.onOpenOpsInbox);
    this.tray.init();
  }

  private setupEventHandlers(): void {
    this.mcpServer.onEvent(async (event) => {
      // Store observation
      this.db.insertObservation({
        id: event.id,
        timestamp: event.timestamp,
        session_id: event.session_id,
        source: JSON.stringify(event.source),
        event_type: event.event_type,
        payload: JSON.stringify(event.payload),
        redaction_applied: JSON.stringify(event.redaction_applied),
        confidence: event.confidence,
      });

      // Buffer for episode detection
      this.observationBuffer.push(event);

      // Check for episode boundary
      if (this.observationBuffer.length >= 2) {
        const last = this.observationBuffer[this.observationBuffer.length - 2];
        const current = event;

        if (this.interpreter.shouldCloseEpisode(last, current)) {
          await this.processEpisode();
        }
      }
    });
  }

  private async processEpisode(): Promise<void> {
    if (this.observationBuffer.length === 0) return;

    // Create episode
    const episode = this.interpreter.interpret(this.observationBuffer);
    if (!episode) return;

    // Generate draft
    const proposal = await this.drafter.createDraft(episode);
    if (!proposal) return;

    // Evaluate policy
    const decision = this.policy.evaluate(proposal);

    if (decision.action === 'auto_decline') {
      // Log but don't show
      return;
    }

    // Store proposal
    this.db.insertProposal({
      id: proposal.id,
      created_at: proposal.created_at,
      episode_id: proposal.episode_id,
      action_type: proposal.action_type,
      title: proposal.title,
      summary: proposal.summary,
      draft_content: proposal.draft_content,
      confidence: proposal.confidence,
      risk_level: proposal.risk_level,
      status: proposal.status,
      metadata: JSON.stringify(proposal.metadata),
    });

    // Update tray count
    const pendingCount = this.db.getPendingProposals().length;
    this.tray?.updatePendingCount(pendingCount);

    // Show notification
    if (proposal.confidence >= 60) {
      this.tray?.showProposalNotification(
        proposal.title,
        proposal.summary,
        proposal.id
      );
    }

    // Clear buffer
    this.observationBuffer = [];
  }

  private setupIpc(): void {
    ipcMain.handle('ops:get-proposals', () => {
      return this.db.getPendingProposals().map((p) => ({
        ...p,
        metadata: JSON.parse(p.metadata),
      }));
    });

    ipcMain.handle('ops:approve-proposal', (_, id: string) => {
      this.db.updateProposalStatus(id, 'approved');
      const count = this.db.getPendingProposals().length;
      this.tray?.updatePendingCount(count);
      return true;
    });

    ipcMain.handle('ops:decline-proposal', (_, id: string) => {
      this.db.updateProposalStatus(id, 'declined');
      const count = this.db.getPendingProposals().length;
      this.tray?.updatePendingCount(count);
      return true;
    });

    ipcMain.handle('ops:get-playbooks', () => {
      return this.db.getAllPlaybooks().map((p) => ({
        ...p,
        trigger: JSON.parse(p.trigger),
        actions: JSON.parse(p.actions),
        stats: JSON.parse(p.stats),
      }));
    });

    ipcMain.handle('ops:start-observation', () => {
      this.mcpServer.start();
      return true;
    });

    ipcMain.handle('ops:stop-observation', () => {
      // MCP server stop handled internally
      return true;
    });
  }

  destroy(): void {
    this.tray?.destroy();
    this.db.close();
  }
}
