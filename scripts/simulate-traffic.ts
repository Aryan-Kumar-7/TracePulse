import * as crypto from 'crypto';
import {
  ExportTraceServiceRequest,
  OtlpResourceSpan,
  OtlpSpan,
} from '@tracepulse/shared';

// CLI Arguments
const args = process.argv.slice(2);
const isChaos = args.includes('--chaos');
const rpsArgIndex = args.indexOf('--rps');
const rps = rpsArgIndex !== -1 ? parseInt(args[rpsArgIndex + 1], 10) : 8; // 8 traces/sec * 5 spans = 40 spans/sec
const durationArgIndex = args.indexOf('--duration');
const durationSec = durationArgIndex !== -1 ? parseInt(args[durationArgIndex + 1], 10) : 10;
const endpointArgIndex = args.indexOf('--endpoint');
const endpoint =
  endpointArgIndex !== -1
    ? args[endpointArgIndex + 1]
    : 'http://localhost:4000/v1/traces';

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

interface SimulatedSpanConfig {
  serviceName: string;
  name: string;
  kind: number; // 1: INTERNAL, 2: SERVER, 3: CLIENT
  spanId: string;
  parentSpanId: string;
  durationMs: number;
  statusCode: number; // 1: OK, 2: ERROR
  statusMessage?: string;
  attributes: Record<string, string | number | boolean>;
}

function buildResourceSpan(
  serviceName: string,
  traceId: string,
  configs: SimulatedSpanConfig[],
  traceStartNano: bigint,
): OtlpResourceSpan {
  const spans: OtlpSpan[] = configs.map((c, index) => {
    const startNano = traceStartNano + BigInt(index * 2_000_000); // 2ms offset per hop
    const endNano = startNano + BigInt(Math.round(c.durationMs * 1_000_000));

    return {
      traceId,
      spanId: c.spanId,
      parentSpanId: c.parentSpanId || undefined,
      name: c.name,
      kind: c.kind,
      startTimeUnixNano: startNano.toString(),
      endTimeUnixNano: endNano.toString(),
      attributes: Object.entries(c.attributes).map(([key, val]) => {
        if (typeof val === 'number') {
          return { key, value: { intValue: val } };
        }
        if (typeof val === 'boolean') {
          return { key, value: { boolValue: val } };
        }
        return { key, value: { stringValue: String(val) } };
      }),
      status: {
        code: c.statusCode,
        message: c.statusMessage || '',
      },
      events:
        c.statusCode === 2
          ? [
              {
                timeUnixNano: endNano.toString(),
                name: 'exception',
                attributes: [
                  {
                    key: 'exception.message',
                    value: { stringValue: c.statusMessage || 'Unknown error' },
                  },
                ],
              },
            ]
          : [],
    };
  });

  return {
    resource: {
      attributes: [
        { key: 'service.name', value: { stringValue: serviceName } },
        { key: 'deployment.environment', value: { stringValue: 'production' } },
        { key: 'host.name', value: { stringValue: `node-${serviceName}-01` } },
      ],
    },
    scopeSpans: [
      {
        scope: {
          name: `@tracepulse/sim-${serviceName}`,
          version: '1.0.0',
        },
        spans,
      },
    ],
  };
}

/**
 * Generates an end-to-end distributed trace simulating:
 * client-web -> api-gateway -> order-service -> payment-service -> postgres
 */
function generateDistributedTrace(injectChaos: boolean): ExportTraceServiceRequest {
  const traceId = randomHex(16);
  const sClient = randomHex(8);
  const sGateway = randomHex(8);
  const sOrder = randomHex(8);
  const sPayment = randomHex(8);
  const sDatabase = randomHex(8);

  const nowMs = Date.now();
  const traceStartNano = BigInt(nowMs) * 1_000_000n;

  // Randomize chaos type if chaos mode is active
  const isTraceFailing = injectChaos && Math.random() < 0.45; // 45% failure rate in chaos mode
  const isLatencySpike = injectChaos && Math.random() < 0.4; // 40% latency surge in chaos mode

  // Database Query duration
  const dbDurationMs = isLatencySpike
    ? 2200 + Math.random() * 800 // 2.2s - 3.0s regression!
    : 8 + Math.random() * 20;

  // Payment service duration
  const paymentDurationMs = dbDurationMs + (isTraceFailing ? 450 : 25 + Math.random() * 30);

  // Order service duration
  const orderDurationMs = paymentDurationMs + (15 + Math.random() * 25);

  // Gateway duration
  const gatewayDurationMs = orderDurationMs + 10;

  // Client duration
  const clientDurationMs = gatewayDurationMs + 15;

  const dbConfig: SimulatedSpanConfig = {
    serviceName: 'postgres',
    name: isLatencySpike
      ? 'SELECT * FROM orders WHERE status = PENDING FOR UPDATE'
      : 'INSERT INTO orders (id, amount, status) VALUES ($1, $2, $3)',
    kind: 3, // CLIENT
    spanId: sDatabase,
    parentSpanId: sPayment,
    durationMs: dbDurationMs,
    statusCode: isTraceFailing ? 2 : 1,
    statusMessage: isTraceFailing
      ? 'QueryTimeoutException: Lock wait timeout exceeded'
      : undefined,
    attributes: {
      'db.system': 'postgresql',
      'db.name': 'tracepulse',
      'db.operation': isLatencySpike ? 'SELECT' : 'INSERT',
      ...(isTraceFailing && {
        'error': 'true',
        'exception.type': 'QueryTimeoutException',
      }),
    },
  };

  const paymentConfig: SimulatedSpanConfig = {
    serviceName: 'payment-service',
    name: 'process_payment_charge',
    kind: 2, // SERVER
    spanId: sPayment,
    parentSpanId: sOrder,
    durationMs: paymentDurationMs,
    statusCode: isTraceFailing ? 2 : 1,
    statusMessage: isTraceFailing
      ? 'PaymentGatewayTimeoutException: Upstream payment provider unreachable'
      : undefined,
    attributes: {
      'payment.provider': 'stripe',
      'payment.method': 'card',
      'http.status_code': isTraceFailing ? 502 : 200,
      ...(isTraceFailing && {
        'error': 'true',
        'exception.type': 'PaymentGatewayTimeoutException',
      }),
    },
  };

  const orderConfig: SimulatedSpanConfig = {
    serviceName: 'order-service',
    name: 'create_order',
    kind: 2, // SERVER
    spanId: sOrder,
    parentSpanId: sGateway,
    durationMs: orderDurationMs,
    statusCode: isTraceFailing ? 2 : 1,
    statusMessage: isTraceFailing ? 'InternalServerError: Downstream payment failed' : undefined,
    attributes: {
      'order.id': `ord_${randomHex(4)}`,
      'order.amount': Math.round((20 + Math.random() * 180) * 100) / 100,
      'http.status_code': isTraceFailing ? 500 : 201,
      ...(isTraceFailing && {
        'error': 'true',
        'exception.type': 'InternalServerError',
      }),
    },
  };

  const gatewayConfig: SimulatedSpanConfig = {
    serviceName: 'api-gateway',
    name: 'POST /v1/checkout',
    kind: 2, // SERVER
    spanId: sGateway,
    parentSpanId: sClient,
    durationMs: gatewayDurationMs,
    statusCode: isTraceFailing ? 2 : 1,
    statusMessage: isTraceFailing ? 'HTTP 500: Internal Server Error' : undefined,
    attributes: {
      'http.method': 'POST',
      'http.route': '/v1/checkout',
      'http.status_code': isTraceFailing ? 500 : 200,
    },
  };

  const clientConfig: SimulatedSpanConfig = {
    serviceName: 'client-web',
    name: 'checkout_button_click',
    kind: 3, // CLIENT
    spanId: sClient,
    parentSpanId: '',
    durationMs: clientDurationMs,
    statusCode: isTraceFailing ? 2 : 1,
    attributes: {
      'http.url': 'https://app.tracepulse.io/checkout',
      'http.status_code': isTraceFailing ? 500 : 200,
    },
  };

  return {
    resourceSpans: [
      buildResourceSpan('client-web', traceId, [clientConfig], traceStartNano),
      buildResourceSpan('api-gateway', traceId, [gatewayConfig], traceStartNano),
      buildResourceSpan('order-service', traceId, [orderConfig], traceStartNano),
      buildResourceSpan('payment-service', traceId, [paymentConfig, dbConfig], traceStartNano),
    ],
  };
}

async function sendTraceBatch(request: ExportTraceServiceRequest): Promise<boolean> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return res.ok;
  } catch (err: any) {
    console.error(`Failed to send trace batch: ${err?.message || err}`);
    return false;
  }
}

async function main() {
  console.log('====================================================');
  console.log('⚡ TracePulse Realistic Microservice Traffic Generator');
  console.log('====================================================');
  console.log(`Endpoint:    ${endpoint}`);
  console.log(`Target Rate: ${rps} traces/sec (~${rps * 5} spans/sec)`);
  console.log(`Duration:    ${durationSec > 0 ? `${durationSec} seconds` : 'Continuous'}`);
  console.log(`Chaos Mode:  ${isChaos ? '🔥 ENABLED (Spiking 500s & >2s latency)' : '🟢 DISABLED (Healthy normal traffic)'}`);
  console.log('====================================================\n');

  let totalTracesSent = 0;
  let totalSpansSent = 0;
  let failedRequests = 0;

  const intervalMs = 1000 / rps;
  const startTime = Date.now();
  let isRunning = true;

  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Halting generator...');
    isRunning = false;
  });

  const timer = setInterval(async () => {
    if (!isRunning) {
      clearInterval(timer);
      return;
    }

    if (durationSec > 0 && (Date.now() - startTime) >= durationSec * 1000) {
      isRunning = false;
      clearInterval(timer);
      printSummary();
      process.exit(0);
    }

    const payload = generateDistributedTrace(isChaos);
    const success = await sendTraceBatch(payload);

    if (success) {
      totalTracesSent++;
      totalSpansSent += 5;
    } else {
      failedRequests++;
    }

    // Print live status ticker every 20 traces
    if (totalTracesSent > 0 && totalTracesSent % 20 === 0) {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const currentRate = (totalSpansSent / Math.max(1, Number(elapsedSec))).toFixed(1);
      process.stdout.write(
        `\r🚀 Dispatched: ${totalTracesSent} traces | ${totalSpansSent} spans (${currentRate} spans/sec) | Errors: ${failedRequests} | Elapsed: ${elapsedSec}s`,
      );
    }
  }, intervalMs);

  function printSummary() {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n\n================ Traffic Simulation Summary ================');
    console.log(`Total Traces Sent:   ${totalTracesSent}`);
    console.log(`Total Spans Sent:    ${totalSpansSent}`);
    console.log(`Average Throughput:  ${(totalSpansSent / Number(elapsedSec)).toFixed(1)} spans/sec`);
    console.log(`Duration Elapsed:    ${elapsedSec}s`);
    console.log(`Failed HTTP Dispatches: ${failedRequests}`);
    console.log('============================================================\n');
  }
}

main().catch(console.error);
