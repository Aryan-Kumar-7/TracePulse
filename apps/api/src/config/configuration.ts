export interface AppConfig {
  port: number;
  nodeEnv: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    streamKey: string;
  };
  clickhouse: {
    host: string;
    db: string;
    user: string;
    password?: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    streamKey: process.env.REDIS_STREAM_KEY || 'tracepulse:stream:traces',
  },
  clickhouse: {
    host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
    db: process.env.CLICKHOUSE_DB || 'default',
    user: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || undefined,
  },
});
