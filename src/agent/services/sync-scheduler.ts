import type { WebSocketClient } from './ws-client.js';
import type { UserHandler } from '../handlers/user-handler.js';
import type { GroupHandler } from '../handlers/group-handler.js';
import { logger } from './logger.js';

export class SyncScheduler {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private wsClient: WebSocketClient,
    private userHandler: UserHandler,
    private groupHandler: GroupHandler,
    private intervalMinutes: number,
  ) {}

  start(): void {
    logger.info(`Starting sync scheduler (interval: ${this.intervalMinutes}m)`);

    setTimeout(() => this.runSync(), 10_000);

    this.interval = setInterval(
      () => this.runSync(),
      this.intervalMinutes * 60 * 1000,
    );
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async runSync(): Promise<void> {
    logger.info('Starting scheduled sync');
    const start = Date.now();

    try {
      const [users, groups] = await Promise.all([
        this.userHandler.listUsers(),
        this.groupHandler.listGroups(),
      ]);

      this.wsClient.sendData('sync', {
        users: { count: users.length, data: users },
        groups: { count: groups.length, data: groups },
        syncedAt: new Date(),
        durationMs: Date.now() - start,
      });

      logger.info('Sync completed', { users: users.length, groups: groups.length, durationMs: Date.now() - start });
    } catch (err) {
      logger.error('Sync failed', { error: (err as Error).message, durationMs: Date.now() - start });
    }
  }
}
