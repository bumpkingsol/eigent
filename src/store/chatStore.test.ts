import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from './chatStore';
import * as fetchEventSourceModule from '@microsoft/fetch-event-source';

// Mock dependencies
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}));

vi.mock('@/api/http', () => ({
  fetchPost: vi.fn(),
  fetchPut: vi.fn(),
  getBaseURL: vi.fn().mockResolvedValue('http://localhost:3000'),
  proxyFetchPost: vi.fn().mockResolvedValue({}),
  proxyFetchPut: vi.fn(),
  proxyFetchGet: vi.fn().mockImplementation((url) => {
    if (url === '/api/providers') {
      return Promise.resolve({
        items: [{
          api_key: 'test',
          model_type: 'gpt-4',
          provider_name: 'openai',
          api_url: 'http://test',
          encrypted_config: {}
        }]
      });
    }
    return Promise.resolve({});
  }),
  uploadFile: vi.fn(),
  fetchDelete: vi.fn(),
  waitForBackendReady: vi.fn().mockResolvedValue(true),
}));

vi.mock('./projectStore', () => ({
  useProjectStore: {
    getState: vi.fn().mockReturnValue({
      activeProjectId: 'project-123',
      appendInitChatStore: vi.fn(),
      getHistoryId: vi.fn(),
      setHistoryId: vi.fn(),
    }),
  },
}));

vi.mock('./authStore', () => ({
  getAuthStore: vi.fn().mockReturnValue({
    token: 'test-token',
    language: 'en',
    modelType: 'custom',
    email: 'test@example.com',
  }),
  useWorkerList: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib', () => ({
  generateUniqueId: () => 'unique-id-' + Math.random(),
  uploadLog: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), dismiss: vi.fn() },
}));

// Mock window.ipcRenderer
Object.defineProperty(window, 'ipcRenderer', {
  value: {
    invoke: vi.fn().mockResolvedValue([]),
  },
  writable: true,
});

describe('chatStore', () => {
  let storeApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    storeApi = useChatStore();
  });

  it('handles reasoning_step SSE event', async () => {
    const store = storeApi.getState();
    const taskId = store.create('test-task');
    store.setActiveTaskId(taskId);

    let capturedOnMessage: any;
    vi.mocked(fetchEventSourceModule.fetchEventSource).mockImplementation(async (url, options: any) => {
       capturedOnMessage = options.onmessage;
    });

    await store.startTask(taskId);

    expect(capturedOnMessage).toBeDefined();

    const eventData = {
        step: 'reasoning_step',
        data: {
            thought: 'Thinking process...',
            step_number: 1,
            agent_name: 'ReasoningAgent'
        }
    };

    const mockEvent = {
        data: JSON.stringify(eventData)
    };

    await capturedOnMessage(mockEvent);

    const updatedTask = storeApi.getState().tasks[taskId];
    expect(updatedTask.cotList).toHaveLength(1);
    expect(updatedTask.cotList[0]).toBe('Step 1: Thinking process...');
  });
});
