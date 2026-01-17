import { describe, it, expect, vi } from 'vitest';
import { IntegrationManager } from '../../../../../electron/ops/integrations/manager';

describe('IntegrationManager', () => {
  it('routes email_draft to gmail', async () => {
    const manager = new IntegrationManager();

    // Mock gmail integration
    const mockGmail = {
      createDraft: vi.fn().mockResolvedValue('draft-123'),
    };
    (manager as any).gmail = mockGmail;

    const result = await manager.execute('email_draft', 'Hello...', {
      to: 'test@example.com',
      subject: 'Test',
    });

    expect(result.draft_id).toBe('draft-123');
    expect(mockGmail.createDraft).toHaveBeenCalled();
  });

  it('throws for unknown action type', async () => {
    const manager = new IntegrationManager();

    await expect(
      manager.execute('unknown_type', '', {})
    ).rejects.toThrow('Unknown action type');
  });

  it('throws when integration not configured', async () => {
    const manager = new IntegrationManager();

    await expect(
      manager.execute('email_draft', '', {})
    ).rejects.toThrow('Gmail not configured');
  });
});
