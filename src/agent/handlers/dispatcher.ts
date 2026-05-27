import { logger } from '../services/logger.js';

type CommandHandler = (payload: unknown) => Promise<unknown>;

export class CommandDispatcher {
  private handlers = new Map<string, CommandHandler>();

  register(command: string, handler: CommandHandler): void {
    this.handlers.set(command, handler);
  }

  async dispatch(command: string, payload: unknown): Promise<unknown> {
    const handler = this.handlers.get(command);
    if (!handler) {
      throw new Error(`No handler registered for command: ${command}`);
    }

    logger.info('Dispatching command', { command });
    const start = Date.now();

    try {
      const result = await handler(payload);
      logger.info('Command completed', { command, durationMs: Date.now() - start });
      return result;
    } catch (err) {
      logger.error('Command failed', { command, error: (err as Error).message, durationMs: Date.now() - start });
      throw err;
    }
  }
}
