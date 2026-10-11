import { Injectable } from '@nestjs/common';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus-метрики для дашборда (scraping с /metrics внутри кластера).
 */
@Injectable()
export class MetricsService {
  readonly registry: Registry;

  readonly wsConnectTotal: Counter;
  readonly wsDisconnectTotal: Counter;
  readonly wsHandshakeFailTotal: Counter;

  readonly submitAnswerTotal: Counter;

  /** labels event + result */
  readonly hostCommandTotal: Counter;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry, prefix: 'quiz_node_' });

    this.wsConnectTotal = new Counter({
      name: 'quiz_ws_connect_total',
      help: 'WS /game: успешное подключение после handshake',
      labelNames: ['role'],
      registers: [this.registry],
    });

    this.wsDisconnectTotal = new Counter({
      name: 'quiz_ws_disconnect_total',
      help: 'WS /game: отключение клиента',
      labelNames: ['role'],
      registers: [this.registry],
    });

    this.wsHandshakeFailTotal = new Counter({
      name: 'quiz_ws_handshake_fail_total',
      help: 'WS /game: отказ handshake',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.submitAnswerTotal = new Counter({
      name: 'quiz_submit_answer_total',
      help: 'submit_answer: успех или ошибка',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.hostCommandTotal = new Counter({
      name: 'quiz_host_command_total',
      help: 'Хост-команды WS: ok или error',
      labelNames: ['event', 'result'],
      registers: [this.registry],
    });
  }
}
