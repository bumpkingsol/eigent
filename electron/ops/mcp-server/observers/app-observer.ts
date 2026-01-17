import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface AppInfo {
  bundle_id: string;
  name: string;
  is_frontmost: boolean;
}

export class AppObserver {
  private intervalId: NodeJS.Timeout | null = null;
  private lastApp: string | null = null;
  private lastAppName: string | null = null;
  private pollInterval: number = 1000; // 1 second

  constructor(private onAppChange: (bundleId: string, appName: string) => void) {}

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
      const currentApp = await this.getFrontmostApp();

      if (currentApp && currentApp.bundle_id !== this.lastApp) {
        this.lastApp = currentApp.bundle_id;
        this.lastAppName = currentApp.name;
        this.onAppChange(currentApp.bundle_id, currentApp.name);
      }
    } catch (error) {
      // Silently ignore polling errors
    }
  }

  private async getFrontmostApp(): Promise<AppInfo | null> {
    // macOS AppleScript to get frontmost app
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set bundleId to bundle identifier of frontApp
        return bundleId & "|" & appName
      end tell
    `;

    try {
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      const [bundle_id, name] = stdout.trim().split('|');
      return { bundle_id, name, is_frontmost: true };
    } catch {
      return null;
    }
  }

  getCurrentApp(): AppInfo | null {
    if (!this.lastApp) return null;
    return {
      bundle_id: this.lastApp,
      name: this.lastAppName || '',
      is_frontmost: true,
    };
  }
}
