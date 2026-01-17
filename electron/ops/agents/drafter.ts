import type { TaskEpisode, ProposedAction } from '../../../src/types/ops';
import { v7 as uuidv7 } from 'uuid';

interface DraftTemplate {
  intent: string;
  actionType: ProposedAction['action_type'];
  generateDraft: (episode: TaskEpisode) => Partial<ProposedAction>;
}

const TEMPLATES: DraftTemplate[] = [
  {
    intent: 'email_interaction',
    actionType: 'email_draft',
    generateDraft: (episode) => ({
      title: 'Reply to email',
      summary: `Draft reply based on: ${episode.context.content_preview || 'email content'}`,
      draft_content: generateEmailReply(episode),
    }),
  },
  {
    intent: 'calendar_interaction',
    actionType: 'calendar_event',
    generateDraft: (episode) => ({
      title: 'Schedule meeting',
      summary: 'Create calendar event',
      draft_content: JSON.stringify({
        summary: 'New Meeting',
        duration: 30,
      }),
    }),
  },
  {
    intent: 'notion_interaction',
    actionType: 'notion_page',
    generateDraft: (episode) => ({
      title: 'Create note',
      summary: 'Create new Notion page',
      draft_content: '',
    }),
  },
];

function generateEmailReply(episode: TaskEpisode): string {
  // Simple template - in production, this would call an LLM
  const preview = episode.context.content_preview as string || '';

  return `Hi,

Thank you for your email.

[Draft reply to: "${preview.substring(0, 100)}..."]

Best regards`;
}

export class DraftingAgent {
  async createDraft(episode: TaskEpisode): Promise<ProposedAction | null> {
    const template = TEMPLATES.find((t) => t.intent === episode.intent);

    if (!template) {
      return null;
    }

    const draftFields = template.generateDraft(episode);

    return {
      id: uuidv7(),
      created_at: new Date().toISOString(),
      episode_id: episode.id,
      action_type: template.actionType,
      title: draftFields.title || 'Untitled',
      summary: draftFields.summary || '',
      draft_content: draftFields.draft_content || '',
      confidence: this.calculateConfidence(episode),
      risk_level: this.assessRisk(template.actionType),
      status: 'pending',
      metadata: {
        episode_context: episode.context,
      },
    };
  }

  private calculateConfidence(episode: TaskEpisode): number {
    let confidence = 50;

    // More observations = higher confidence
    confidence += Math.min(episode.observation_ids.length * 5, 20);

    // Content preview = higher confidence
    if (episode.context.content_preview) {
      confidence += 15;
    }

    // Longer duration = higher confidence (more deliberate action)
    const duration = episode.context.duration_ms as number || 0;
    if (duration > 10000) confidence += 10;

    return Math.min(confidence, 95);
  }

  private assessRisk(actionType: ProposedAction['action_type']): 'low' | 'medium' | 'high' {
    switch (actionType) {
      case 'email_draft':
        return 'low'; // Draft only, not sent
      case 'calendar_event':
        return 'medium'; // Sends invites
      case 'notion_page':
        return 'low';
      default:
        return 'medium';
    }
  }
}
