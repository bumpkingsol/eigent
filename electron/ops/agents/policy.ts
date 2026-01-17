import type { ProposedAction } from '../../../src/types/ops';

export type PolicyDecision = {
  action: 'auto_decline' | 'require_approval' | 'one_click_approve' | 'eligible_shadow' | 'eligible_autopilot';
  reason: string;
  warnings: string[];
};

export class PolicyAgent {
  private thresholds = {
    autoDecline: 30,
    requireApproval: 60,
    oneClick: 70,
    shadow: 85,
    autopilot: 90,
  };

  evaluate(proposal: ProposedAction): PolicyDecision {
    const warnings: string[] = [];

    // Check confidence thresholds
    if (proposal.confidence < this.thresholds.autoDecline) {
      return {
        action: 'auto_decline',
        reason: `Low confidence (${proposal.confidence}%) - below ${this.thresholds.autoDecline}% threshold`,
        warnings: [],
      };
    }

    // Add warnings for risk factors
    if (proposal.risk_level === 'high') {
      warnings.push('High risk action - review carefully');
    }

    if (!proposal.draft_content || proposal.draft_content.length < 10) {
      warnings.push('Draft content is empty or very short');
    }

    // Determine action based on confidence + risk
    if (proposal.confidence >= this.thresholds.autopilot && proposal.risk_level === 'low') {
      return {
        action: 'eligible_autopilot',
        reason: `Very high confidence (${proposal.confidence}%) with low risk`,
        warnings,
      };
    }

    if (proposal.confidence >= this.thresholds.shadow && proposal.risk_level !== 'high') {
      return {
        action: 'eligible_shadow',
        reason: `High confidence (${proposal.confidence}%) - eligible for shadow mode`,
        warnings,
      };
    }

    if (proposal.confidence >= this.thresholds.oneClick && proposal.risk_level === 'low') {
      return {
        action: 'one_click_approve',
        reason: `High confidence (${proposal.confidence}%) with low risk`,
        warnings,
      };
    }

    return {
      action: 'require_approval',
      reason: `Medium confidence (${proposal.confidence}%) - requires explicit approval`,
      warnings,
    };
  }

  adjustConfidence(
    proposal: ProposedAction,
    historicalAccuracy: number,
    recentEditDistance: number
  ): number {
    let adjusted = proposal.confidence;

    // Boost if historically accurate
    if (historicalAccuracy > 0.8) {
      adjusted += 10;
    } else if (historicalAccuracy < 0.5) {
      adjusted -= 15;
    }

    // Penalize if recent edits were heavy
    if (recentEditDistance > 0.3) {
      adjusted -= 10;
    }

    return Math.max(0, Math.min(100, adjusted));
  }

  isAutopilotAllowed(
    proposal: ProposedAction,
    playbookMode: string,
    dailyExecutions: number,
    maxDaily: number
  ): boolean {
    if (playbookMode !== 'autopilot') return false;
    if (dailyExecutions >= maxDaily) return false;
    if (proposal.risk_level === 'high') return false;
    if (proposal.confidence < this.thresholds.autopilot) return false;

    return true;
  }
}
