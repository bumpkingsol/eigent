import { v7 as uuidv7 } from 'uuid';
import type { TaskEpisode, Playbook, DecisionLog } from '../../../src/types/ops';

interface PatternCandidate {
  intent: string;
  appPattern: string;
  urlPattern?: string;
  occurrences: number;
  avgEditDistance: number;
  successRate: number;
  firstSeen: string;
  lastSeen: string;
}

export class PlaybookMiner {
  private minOccurrences = 5;
  private maxEditDistance = 0.15;
  private minDaysSpan = 3;
  private minSuccessRate = 0.9;

  analyzePatterns(
    episodes: TaskEpisode[],
    decisions: DecisionLog[]
  ): PatternCandidate[] {
    const patterns = new Map<string, PatternCandidate>();

    for (const episode of episodes) {
      const key = this.getPatternKey(episode);

      if (!patterns.has(key)) {
        patterns.set(key, {
          intent: episode.intent,
          appPattern: this.extractAppPattern(episode),
          urlPattern: this.extractUrlPattern(episode),
          occurrences: 0,
          avgEditDistance: 0,
          successRate: 1,
          firstSeen: episode.created_at,
          lastSeen: episode.created_at,
        });
      }

      const pattern = patterns.get(key)!;
      pattern.occurrences++;
      pattern.lastSeen = episode.updated_at;

      // Calculate edit distance from decisions
      const relatedDecisions = decisions.filter((d) =>
        episodes.some((e) => e.id === d.proposal_id)
      );

      if (relatedDecisions.length > 0) {
        const avgEdit = relatedDecisions
          .map((d) => d.edit_distance || 0)
          .reduce((a, b) => a + b, 0) / relatedDecisions.length;
        pattern.avgEditDistance = avgEdit;

        const successes = relatedDecisions.filter((d) => d.execution_result === 'success').length;
        pattern.successRate = successes / relatedDecisions.length;
      }
    }

    return Array.from(patterns.values());
  }

  suggestPlaybook(candidate: PatternCandidate): Playbook | null {
    // Check thresholds
    if (candidate.occurrences < this.minOccurrences) return null;
    if (candidate.avgEditDistance > this.maxEditDistance) return null;
    if (candidate.successRate < this.minSuccessRate) return null;

    // Check time span
    const firstDate = new Date(candidate.firstSeen);
    const lastDate = new Date(candidate.lastSeen);
    const daysDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff < this.minDaysSpan) return null;

    return {
      id: uuidv7(),
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      name: this.generatePlaybookName(candidate),
      description: `Auto-detected pattern: ${candidate.intent} with ${candidate.occurrences} occurrences`,
      trigger: {
        app_pattern: candidate.appPattern,
        url_pattern: candidate.urlPattern,
        context_signals: [],
      },
      actions: [],
      mode: 'suggest',
      max_daily_executions: 50,
      stats: {
        total_executions: 0,
        successful_executions: 0,
        avg_edit_distance: candidate.avgEditDistance,
        dry_runs_completed: 0,
      },
    };
  }

  private getPatternKey(episode: TaskEpisode): string {
    const apps = (episode.context.apps as string[]) || [];
    const urls = (episode.context.urls as string[]) || [];

    return `${episode.intent}:${apps.sort().join(',')}:${urls.map((u) => new URL(u).hostname).sort().join(',')}`;
  }

  private extractAppPattern(episode: TaskEpisode): string {
    const apps = (episode.context.apps as string[]) || [];
    if (apps.length === 0) return '.*';

    // Find common prefix
    const bundleIds = apps.map((a) => a.toLowerCase());
    return bundleIds[0].replace(/\./g, '\\.');
  }

  private extractUrlPattern(episode: TaskEpisode): string | undefined {
    const urls = (episode.context.urls as string[]) || [];
    if (urls.length === 0) return undefined;

    try {
      const hostnames = urls.map((u) => new URL(u).hostname);
      const common = hostnames[0];
      return common.replace(/\./g, '\\.');
    } catch {
      return undefined;
    }
  }

  private generatePlaybookName(candidate: PatternCandidate): string {
    const intentName = candidate.intent.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return `Auto: ${intentName}`;
  }
}
