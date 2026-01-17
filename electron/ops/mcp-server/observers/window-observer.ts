import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface WindowInfo {
  title: string;
  window_id: number;
  app_name: string;
}

export class WindowObserver {
  private intervalId: NodeJS.Timeout | null = null;
  private lastWindow: string | null = null;
  private lastWindowId: number = 0;
  private pollInterval: number = 500; // 500ms

  constructor(private onWindowChange: (title: string, windowId: number, url?: string) => void) {}

  start(): void {
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const window = await this.getFrontmostWindow();

      if (window && window.title !== this.lastWindow) {
        this.lastWindow = window.title;
        this.lastWindowId = window.window_id;
        this.onWindowChange(window.title, window.window_id);
      }
    } catch (error) {
      // Silently ignore polling errors
    }
  }

  private async getFrontmostWindow(): Promise<WindowInfo | null> {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        try
          set windowTitle to name of front window of frontApp
        on error
          set windowTitle to ""
        end try
        return appName & "|" & windowTitle
      end tell
    `;

    try {
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      const [app_name, title] = stdout.trim().split('|');
      return { title: title || '', window_id: 0, app_name };
    } catch {
      return null;
    }
  }

  getCurrentWindow(): WindowInfo | null {
    return this.lastWindow ? { title: this.lastWindow, window_id: this.lastWindowId, app_name: '' } : null;
  }
}
