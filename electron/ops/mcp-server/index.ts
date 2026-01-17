import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { v7 as uuidv7 } from 'uuid';
import { AppObserver } from './observers/app-observer.js';
import { WindowObserver } from './observers/window-observer.js';

interface ObservationCallback {
  (event: any): void;
}

export class ComputerMcpServer {
  private server: Server;
  private appObserver: AppObserver;
  private windowObserver: WindowObserver;
  private sessionId: string;
  private isObserving: boolean = false;
  private isPrivateMode: boolean = false;
  private callbacks: ObservationCallback[] = [];

  constructor() {
    this.sessionId = uuidv7();
    this.server = new Server(
      { name: 'eigent-computer', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.appObserver = new AppObserver(this.emitEvent.bind(this));
    this.windowObserver = new WindowObserver(this.emitEvent.bind(this));

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'start_observation',
          description: 'Start observing user activity',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'stop_observation',
          description: 'Stop observing user activity',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'get_current_context',
          description: 'Get current app and window context',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'set_private_mode',
          description: 'Enable or disable private mode',
          inputSchema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
            },
            required: ['enabled'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'start_observation':
          return this.startObservation();
        case 'stop_observation':
          return this.stopObservation();
        case 'get_current_context':
          return this.getCurrentContext();
        case 'set_private_mode':
          return this.setPrivateMode((args as any).enabled);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private emitEvent(eventType: string, payload: any): void {
    if (!this.isObserving || this.isPrivateMode) return;

    const event = {
      id: uuidv7(),
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      event_type: eventType,
      payload,
      redaction_applied: [],
      confidence: 1.0,
    };

    for (const callback of this.callbacks) {
      callback(event);
    }
  }

  private startObservation() {
    this.isObserving = true;
    this.appObserver.start();
    this.windowObserver.start();
    return { content: [{ type: 'text', text: 'Observation started' }] };
  }

  private stopObservation() {
    this.isObserving = false;
    this.appObserver.stop();
    this.windowObserver.stop();
    return { content: [{ type: 'text', text: 'Observation stopped' }] };
  }

  private getCurrentContext() {
    const appContext = this.appObserver.getCurrentApp();
    const windowContext = this.windowObserver.getCurrentWindow();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ app: appContext, window: windowContext }, null, 2),
      }],
    };
  }

  private setPrivateMode(enabled: boolean) {
    this.isPrivateMode = enabled;
    if (enabled) {
      // In private mode, we don't emit events
      this.sessionId = uuidv7(); // New session when exiting
    }
    return {
      content: [{
        type: 'text',
        text: `Private mode ${enabled ? 'enabled' : 'disabled'}`,
      }],
    };
  }

  onEvent(callback: ObservationCallback): void {
    this.callbacks.push(callback);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const server = new ComputerMcpServer();
  server.start().catch(console.error);
}
