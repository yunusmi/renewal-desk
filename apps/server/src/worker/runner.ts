import type { Logger } from 'pino';
import type { Sequelize } from 'sequelize-typescript';
import type { WorkerConfig } from '../config/env';

/**
 * Poll loop. Job processing is added in stage 4; for now it verifies DB
 * connectivity on each tick so the process lifecycle can be exercised.
 */
export class WorkerRunner {
  private running = false;
  private loop?: Promise<void>;

  constructor(
    private readonly sequelize: Sequelize,
    private readonly cfg: WorkerConfig,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    await this.sequelize.authenticate();
    this.running = true;
    this.loop = this.run();
    await this.loop;
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        this.logger.error({ err: { message: (err as Error).message } }, 'worker tick failed');
      }
      await new Promise((r) => setTimeout(r, this.cfg.workerPollMs));
    }
  }

  protected async tick(): Promise<void> {
    await this.sequelize.authenticate();
  }
}
