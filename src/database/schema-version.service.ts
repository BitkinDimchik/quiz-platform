import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** При старте пишет путь к локальному SQLite — схема создаётся synchronize. */
@Injectable()
export class SchemaVersionService implements OnModuleInit {
  private readonly logger = new Logger(SchemaVersionService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const db = (this.dataSource.options as { database?: string }).database ?? 'sqlite';
    this.logger.log(`SQLite schema ready: ${db}`);
  }
}
