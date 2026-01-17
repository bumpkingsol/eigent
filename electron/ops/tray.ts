import { Tray, Menu, nativeImage, Notification, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class OpsTray {
  private tray: Tray | null = null;
  private pendingCount: number = 0;

  constructor(private onOpenOpsInbox: () => void) {}

  init(): void {
    // Create tray icon - use app icon if tray-icon doesn't exist
    const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
    let icon: Electron.NativeImage;

    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        // Fallback to app icon or create empty
        icon = nativeImage.createEmpty();
      }
    } catch {
      icon = nativeImage.createEmpty();
    }

    this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
    this.tray.setToolTip('Eigent Ops');
    this.updateMenu();

    this.tray.on('click', () => {
      this.onOpenOpsInbox();
    });
  }

  updatePendingCount(count: number): void {
    this.pendingCount = count;
    this.updateMenu();

    if (this.tray) {
      this.tray.setTitle(count > 0 ? `${count}` : '');
    }
  }

  private updateMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Ops Inbox ${this.pendingCount > 0 ? `(${this.pendingCount})` : ''}`,
        click: () => this.onOpenOpsInbox(),
      },
      { type: 'separator' },
      {
        label: 'Pause Observation',
        type: 'checkbox',
        checked: false,
        click: (menuItem) => {
          // TODO: Emit pause event
          console.log('Pause:', menuItem.checked);
        },
      },
      {
        label: 'Private Mode',
        type: 'checkbox',
        checked: false,
        accelerator: 'CmdOrCtrl+Shift+P',
        click: (menuItem) => {
          // TODO: Emit private mode event
          console.log('Private Mode:', menuItem.checked);
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Eigent',
        click: () => app.quit(),
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  showProposalNotification(title: string, body: string, proposalId: string): void {
    if (!Notification.isSupported()) return;

    const notification = new Notification({
      title,
      body,
      silent: false,
    });

    notification.on('click', () => {
      this.onOpenOpsInbox();
    });

    notification.show();
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
