import type { ObservationEvent, TaskEpisode, ProposedAction, DecisionLog } from '../../../src/types/ops';

export interface TimelineEntry {
  timestamp: string;
  type: 'observation' | 'episode' | 'proposal' | 'decision' | 'execution';
  summary: string;
  details: Record<string, unknown>;
}

export interface ExplainResult {
  triggered: boolean;
  conditions: {
    name: string;
    matched: boolean;
    expected: string;
    actual: string;
  }[];
  suggestion?: string;
}

export class DebugTimeline {
  buildTimeline(
    observations: ObservationEvent[],
    episodes: TaskEpisode[],
    proposals: ProposedAction[],
    decisions: DecisionLog[]
  ): TimelineEntry[] {
    const entries: TimelineEntry[] = [];

    // Add observations
    for (const obs of observations) {
      entries.push({
        timestamp: obs.timestamp,
        type: 'observation',
        summary: `${obs.event_type}: ${obs.source.app_name} - ${obs.source.window_title}`,
        details: {
          id: obs.id,
          session_id: obs.session_id,
          source: obs.source,
          payload: obs.payload,
        },
      });
    }

    // Add episodes
    for (const ep of episodes) {
      entries.push({
        timestamp: ep.created_at,
        type: 'episode',
        summary: `TaskEpisode: "${ep.intent}"`,
        details: {
          id: ep.id,
          observation_count: ep.observation_ids.length,
          context: ep.context,
          status: ep.status,
        },
      });
    }

    // Add proposals
    for (const prop of proposals) {
      entries.push({
        timestamp: prop.created_at,
        type: 'proposal',
        summary: `Proposal: ${prop.title} (${prop.confidence}%)`,
        details: {
          id: prop.id,
          action_type: prop.action_type,
          confidence: prop.confidence,
          risk_level: prop.risk_level,
          status: prop.status,
        },
      });
    }

    // Add decisions
    for (const dec of decisions) {
      entries.push({
        timestamp: dec.timestamp,
        type: 'decision',
        summary: `Decision: ${dec.decision}${dec.execution_result ? ` → ${dec.execution_result}` : ''}`,
        details: {
          id: dec.id,
          proposal_id: dec.proposal_id,
          edit_distance: dec.edit_distance,
          error_message: dec.error_message,
        },
      });
    }

    // Sort by timestamp
    return entries.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  explainPlaybook(
    playbook: { trigger: { app_pattern: string; url_pattern?: string; context_signals: string[] } },
    observation: ObservationEvent
  ): ExplainResult {
    const conditions: ExplainResult['conditions'] = [];
    let allMatched = true;

    // Check app pattern
    const appMatches = new RegExp(playbook.trigger.app_pattern, 'i')
      .test(observation.source.app_bundle_id);
    conditions.push({
      name: 'App Pattern',
      matched: appMatches,
      expected: playbook.trigger.app_pattern,
      actual: observation.source.app_bundle_id,
    });
    if (!appMatches) allMatched = false;

    // Check URL pattern
    if (playbook.trigger.url_pattern && observation.source.url) {
      const urlMatches = new RegExp(playbook.trigger.url_pattern, 'i')
        .test(observation.source.url);
      conditions.push({
        name: 'URL Pattern',
        matched: urlMatches,
        expected: playbook.trigger.url_pattern,
        actual: observation.source.url,
      });
      if (!urlMatches) allMatched = false;
    }

    // Generate suggestion
    let suggestion: string | undefined;
    if (!allMatched) {
      const failedCondition = conditions.find((c) => !c.matched);
      if (failedCondition) {
        suggestion = `Update ${failedCondition.name.toLowerCase()} to include "${failedCondition.actual}"`;
      }
    }

    return {
      triggered: allMatched,
      conditions,
      suggestion,
    };
  }
}
