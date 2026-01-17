import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { v7 as uuidv7 } from 'uuid';
import { AppObserver } from './observers/app-observer.js';
import { WindowObserver } from './observers/window-observer.js';
import type { ObservationEvent, ObservationEventType } from '../../../src/types/ops';

export interface CurrentContext {
  app_bundle_id: string;
  app_name: string;
  window_title: string;
  window_id: number;
  url?: string;
}

interface ObservationCallback {
  (event: ObservationEvent): void;
}

export class ComputerMcpServer {
  private server: Server;
  private appObserver: AppObserver;
  private windowObserver: WindowObserver;
  private sessionId: string;
  private isObserving: boolean = false;
  private isPrivateMode: boolean = false;
  private callbacks: ObservationCallback[] = [];
  private currentContext: CurrentContext = {
    app_bundle_id: '',
    app_name: '',
    window_title: '',
    window_id: 0,
  };

  constructor() {
    this.sessionId = uuidv7();
    this.server = new Server(
      { name: 'eigent-computer', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.appObserver = new AppObserver(this.updateAppContext.bind(this));
    this.windowObserver = new WindowObserver(this.updateWindowContext.bind(this));

    this.setupHandlers();
  }

  private updateAppContext(bundleId: string, appName: string): void {
    const previousBundleId = this.currentContext.app_bundle_id;
    this.currentContext.app_bundle_id = bundleId;
    this.currentContext.app_name = appName;

    // Emit app_activated event when app changes
    if (previousBundleId !== bundleId) {
      this.emitEvent('app_activated', {});
    }
  }

  private updateWindowContext(title: string, windowId: number, url?: string): void {
    const previousTitle = this.currentContext.window_title;
    this.currentContext.window_title = title;
    this.currentContext.window_id = windowId;
    if (url !== undefined) {
      this.currentContext.url = url;
    }

    // Emit window_focused event when window changes
    if (previousTitle !== title) {
      this.emitEvent('window_focused', {});
    }
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

  private emitEvent(eventType: ObservationEventType, payload: ObservationEvent['payload']): void {
    if (!this.isObserving || this.isPrivateMode) return;

    const event: ObservationEvent = {
      id: uuidv7(),
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      source: {
        app_bundle_id: this.currentContext.app_bundle_id,
        app_name: this.currentContext.app_name,
        window_title: this.currentContext.window_title,
        window_id: this.currentContext.window_id,
        url: this.currentContext.url,
      },
      event_type: eventType,
      payload,
      redaction_applied: [],
      confidence: 1.0,
    };

    for (const callback of this.callbacks) {
      callback(event);
    }
  }

  /**
   * Test helper method to emit events with custom context.
   * Used for testing to verify event structure without relying on observers.
   */
  testEmitEvent(
    eventType: ObservationEventType,
    context: CurrentContext,
    payload: ObservationEvent['payload']
  ): void {
    // Temporarily set the context and enable observing
    const wasObserving = this.isObserving;
    this.isObserving = true;
    this.currentContext = { ...context };
    this.emitEvent(eventType, payload);
    this.isObserving = wasObserving;
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
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(this.currentContext, null, 2),
      }],
    };
  }

  private setPrivateMode(enabled: boolean) {
    this.isPrivateMode = enabled;
    if (!enabled) {
      // When exiting private mode, start a fresh session
      this.sessionId = uuidv7();
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
