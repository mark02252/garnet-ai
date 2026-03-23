import type { ICollector } from './types';

export class CollectorRegistry {
  private collectors = new Map<string, ICollector>();

  register(collector: ICollector): void {
    this.collectors.set(collector.id, collector);
  }

  get(id: string): ICollector | undefined {
    return this.collectors.get(id);
  }

  getAll(): ICollector[] {
    return Array.from(this.collectors.values());
  }

  getConfigured(): ICollector[] {
    return this.getAll().filter((c) => c.isConfigured());
  }
}

export const collectorRegistry = new CollectorRegistry();
