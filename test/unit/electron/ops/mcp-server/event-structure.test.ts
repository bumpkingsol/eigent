import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process with default export
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: vi.fn(),
  };
});

// Mock util with default export
vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return {
    ...actual,
    promisify: vi.fn(() => vi.fn()),
  };
});

// Mock uuid
vi.mock('uuid', () => ({
  v7: vi.fn(() => 'test-uuid-123'),
}));

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: {},
  ListToolsRequestSchema: {},
}));

// Import after mocks are set up
import { ComputerMcpServer } from '../../../../../electron/ops/mcp-server/index';

describe('ComputerMcpServer event structure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits events with source at top level', () => {
    const server = new ComputerMcpServer();
    const events: any[] = [];

    server.onEvent((event) => events.push(event));

    // Trigger an event via the exposed test method
    server.testEmitEvent('app_activated', {
      app_bundle_id: 'com.google.Chrome',
      app_name: 'Google Chrome',
      window_title: 'Test',
      window_id: 1,
    }, {});

    expect(events).toHaveLength(1);
    expect(events[0].source).toBeDefined();
    expect(events[0].source.app_bundle_id).toBe('com.google.Chrome');
    expect(events[0].source.app_name).toBe('Google Chrome');
    expect(events[0].event_type).toBe('app_activated');
  });
});
