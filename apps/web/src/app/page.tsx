import { Activity, Cpu, Database, Flame, Layers, Radio, ShieldCheck, Terminal } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-gray-200">
      {/* Header */}
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-gray-800/80 bg-[#090d16]/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20">
            <Activity className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              TracePulse
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400 border border-blue-500/20">
                v0.1.0-alpha
              </span>
            </h1>
            <p className="text-xs text-gray-400">OpenTelemetry Ingestion & AI Incident Diagnosis</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            Ingestion Gateway Active
          </div>
        </div>
      </header>

      {/* Hero / System Status */}
      <main className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gray-800 bg-[#0f172a]/60 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Gateway Engine</span>
              <Radio className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-xl font-bold text-white">NestJS + Fastify</div>
            <div className="text-xs text-gray-400 mt-1">OTLP/HTTP JSON (Port 4000)</div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#0f172a]/60 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Buffer Pipeline</span>
              <Layers className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white">Redis Streams</div>
            <div className="text-xs text-gray-400 mt-1">tracepulse:stream:traces</div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#0f172a]/60 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Trace Storage</span>
              <Database className="h-4 w-4 text-purple-400" />
            </div>
            <div className="text-xl font-bold text-white">ClickHouse 24.3</div>
            <div className="text-xs text-gray-400 mt-1">MergeTree partitioned by month</div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#0f172a]/60 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Metadata & Incidents</span>
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white">Postgres 16 + Prisma</div>
            <div className="text-xs text-gray-400 mt-1">Projects, Alerts, Root-Causes</div>
          </div>
        </div>

        {/* Phase Progress Card */}
        <div className="rounded-2xl border border-gray-800 bg-[#0f172a]/40 p-6">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-blue-400" />
            Phase 1 Infrastructure & Ingestion Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-lg bg-gray-900/60 border border-gray-800">
              <div className="font-medium text-emerald-400 mb-1">✔ Ingestion Gateway Scaffolded</div>
              <p className="text-xs text-gray-400">
                OTLP endpoint accepts standard <code className="text-blue-300">POST /v1/traces</code> payloads,
                normalizes attributes, timestamps, and UUIDs, and buffers them into Redis Streams with capped memory.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-gray-900/60 border border-gray-800">
              <div className="font-medium text-emerald-400 mb-1">✔ Local Distributed Stack Running</div>
              <p className="text-xs text-gray-400">
                ClickHouse, PostgreSQL, and Redis containers healthy and initialized via Docker Compose.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
