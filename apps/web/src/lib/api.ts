import type {
  HealthResponse,
  Incident,
  RecentTraceItem,
  ServiceMetrics,
  TraceTreeResponse,
} from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const headers: Record<string, string> = {
        ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options?.headers as Record<string, string>),
      };

      const res = await fetch(url, {
        headers,
        ...options,
        // Disable aggressive caching for real-time telemetry
        cache: 'no-store',
      });

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
        try {
          const body = await res.json();
          if (body?.message) {
            errorMsg = Array.isArray(body.message)
              ? body.message.join(', ')
              : body.message;
          }
        } catch {
          // ignore json parse error
        }
        throw new Error(errorMsg);
      }

      return (await res.json()) as T;
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message?.includes('fetch')) {
        throw new Error(
          `Unable to connect to TracePulse API at ${this.baseUrl}. Is the NestJS gateway running?`,
        );
      }
      throw err;
    }
  }

  /**
   * System health status (ClickHouse, Redis, PostgreSQL)
   */
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  /**
   * Moving-window service metrics (throughput, error rate, latency percentiles)
   */
  async getServiceMetrics(minutes = 5): Promise<ServiceMetrics[]> {
    try {
      return await this.request<ServiceMetrics[]>(
        `/anomalies/metrics?minutes=${minutes}`,
      );
    } catch {
      // Fallback to legacy moving-window route if needed
      return this.request<ServiceMetrics[]>(
        `/v1/metrics/moving-window?minutes=${minutes}`,
      );
    }
  }

  /**
   * List recent incidents with optional status or service filter
   */
  async getIncidents(params?: {
    status?: string;
    serviceName?: string;
    limit?: number;
  }): Promise<Incident[]> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.serviceName) searchParams.set('serviceName', params.serviceName);
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const query = searchParams.toString();
    return this.request<Incident[]>(`/incidents${query ? `?${query}` : ''}`);
  }

  /**
   * Single incident details including Markdown post-mortem
   */
  async getIncident(id: string): Promise<Incident> {
    return this.request<Incident>(`/incidents/${id}`);
  }

  /**
   * Re-synthesize root-cause post-mortem with AI
   */
  async diagnoseIncident(id: string, traceId?: string): Promise<Incident> {
    const query = traceId ? `?traceId=${encodeURIComponent(traceId)}` : '';
    return this.request<Incident>(`/incidents/${id}/diagnose${query}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /**
   * Fetch reconstructed span tree and critical failure path
   */
  async getTraceTree(traceId: string): Promise<TraceTreeResponse> {
    return this.request<TraceTreeResponse>(
      `/traces/${encodeURIComponent(traceId)}/tree`,
    );
  }

  /**
   * List recently ingested traces for one-click exploration
   */
  async getRecentTraces(limit = 20): Promise<RecentTraceItem[]> {
    return this.request<RecentTraceItem[]>(`/traces/recent?limit=${limit}`);
  }

  /**
   * Trigger immediate anomaly evaluation against ClickHouse
   */
  async triggerAnomalyCheck(): Promise<{
    evaluatedServices: number;
    anomaliesBreached: number;
    incidents: Incident[];
  }> {
    return this.request('/v1/anomaly/check', {
      method: 'POST',
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
export default api;
