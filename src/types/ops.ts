// Observation Events
export type ObservationEventType =
  | "app_activated"
  | "window_focused"
  | "url_changed"
  | "dom_snapshot"
  | "text_input"
  | "click"
  | "file_opened"
  | "clipboard_copy";

export interface ObservationEvent {
  id: string;
  timestamp: string;
  session_id: string;
  source: {
    app_bundle_id: string;
    app_name: string;
    window_title: string;
    window_id: number;
    url?: string;
  };
  event_type: ObservationEventType;
  payload: {
    dom_hash?: string;
    dom_excerpt?: string;
    input_field_id?: string;
    input_length?: number;
    click_target?: string;
    file_path?: string;
  };
  redaction_applied: string[];
  confidence: number;
}

// Task Episodes
export interface TaskEpisode {
  id: string;
  created_at: string;
  updated_at: string;
  observation_ids: string[];
  intent: string;
  context: Record<string, unknown>;
  status: "open" | "closed";
}

// Proposals
export type ProposalStatus = "pending" | "approved" | "declined" | "executed";

export interface ProposedAction {
  id: string;
  created_at: string;
  episode_id: string;
  action_type: "email_draft" | "calendar_event" | "notion_page" | "generic";
  title: string;
  summary: string;
  draft_content: string;
  confidence: number;
  risk_level: "low" | "medium" | "high";
  status: ProposalStatus;
  metadata: Record<string, unknown>;
}

// Playbooks
export type PlaybookMode = "suggest" | "shadow" | "approve" | "autopilot";

export interface Playbook {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  name: string;
  description: string;
  trigger: {
    app_pattern: string;
    url_pattern?: string;
    context_signals: string[];
  };
  actions: PlaybookAction[];
  mode: PlaybookMode;
  max_daily_executions: number;
  stats: {
    total_executions: number;
    successful_executions: number;
    avg_edit_distance: number;
    last_execution?: string;
    dry_runs_completed: number;
  };
}

export interface PlaybookAction {
  type: string;
  tool: string;
  params: Record<string, unknown>;
}

// Decision Log
export interface DecisionLog {
  id: string;
  timestamp: string;
  proposal_id: string;
  decision: "approved" | "declined" | "edited";
  edit_distance?: number;
  execution_result?: "success" | "failure";
  error_message?: string;
}
