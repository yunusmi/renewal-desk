import type { Logger } from 'pino';
import type { Sequelize } from 'sequelize-typescript';
import type { WorkerConfig } from '../config/env';
import { Jobs } from './jobs';
import { ProviderClient } from './provider';

/** Bounded poll lanes; network calls always happen outside database transactions. */
export class WorkerRunner {
  private running = false;
  private loop?: Promise<void[]>;
  private readonly jobs: Jobs;
  private readonly provider: ProviderClient;

  constructor(
    private readonly sequelize: Sequelize,
    private readonly cfg: WorkerConfig,
    private readonly logger: Logger,
  ) {
    this.jobs = new Jobs(sequelize, cfg);
    this.provider = new ProviderClient(cfg);
  }

  async start(): Promise<void> {
    await this.sequelize.authenticate();
    this.running = true;
    this.loop = Promise.all(Array.from({ length: this.cfg.workerConcurrency }, () => this.run()));
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
        this.logger.error(
          {
            error_code: 'worker_tick_failed',
            error_type: err instanceof Error ? err.name : 'unknown',
          },
          'worker tick failed',
        );
      }
      await new Promise((r) => setTimeout(r, this.cfg.workerPollMs));
    }
  }

  protected async tick(): Promise<void> {
    const claim = await this.jobs.claim();
    if (!claim) return;
    const prepared = await this.jobs.prepare(claim);
    if (!prepared) return;
    const result = await this.provider.call(
      prepared.method,
      prepared.req.idempotencyKey,
      prepared.job,
    );
    await this.jobs.record(claim, prepared.method, result);
  }
}
