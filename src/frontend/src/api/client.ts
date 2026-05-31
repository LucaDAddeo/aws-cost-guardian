import type { CostBreakdown, RegionScanResult } from '../types/resource';
import { dispatchNotification } from '../components/Notification';
import { amplifyFetchSession } from '../auth/amplify-adapter';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://api.example.com';

interface CostQueryParams {
  region?: string;
  service?: string;
  startDate?: string;
  endDate?: string;
  granularity?: 'DAILY' | 'MONTHLY';
}

interface AgentResponse {
  message: string;
  status: 'success' | 'error' | 'clarification';
}

interface ActionRecord {
  operationType: string;
  targetResourceId: string;
  targetResourceType: string;
  approvalDecision: 'approved' | 'rejected' | 'timed_out';
  outcome: 'success' | 'failure';
  actionTimestamp: string;
}

interface ScanResponse {
  scanId: string;
  results: RegionScanResult[];
}

async function getToken(): Promise<string | null> {
  try {
    const session = await amplifyFetchSession();
    return session.accessToken;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${BASE_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (error) {
    dispatchNotification('error', 'Network error. Please check your connection and try again.');
    throw error;
  }

  if (response.status === 401) {
    dispatchNotification('error', 'Session expired. Please sign in again.');
    throw new Error('Unauthorized');
  }

  if (response.status === 403) {
    dispatchNotification('error', 'You do not have permission to perform this action.');
    throw new Error('Forbidden');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    dispatchNotification('error', `Request failed: ${errorText}`);
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  /** Trigger a multi-region resource scan. */
  async triggerScan(): Promise<{ scanId: string }> {
    return request<{ scanId: string }>('/scans', { method: 'POST' });
  },

  /** Get the most recent scan results. */
  async getLatestScan(): Promise<ScanResponse> {
    return request<ScanResponse>('/scans/latest');
  },

  /** Get cost data with optional filters. */
  async getCosts(params?: CostQueryParams): Promise<CostBreakdown> {
    const searchParams = new URLSearchParams();
    if (params?.region) searchParams.set('region', params.region);
    if (params?.service) searchParams.set('service', params.service);
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.granularity) searchParams.set('granularity', params.granularity);

    const query = searchParams.toString();
    const path = query ? `/costs?${query}` : '/costs';
    return request<CostBreakdown>(path);
  },

  /** Send a natural language query to the agent. */
  async sendAgentQuery(message: string): Promise<AgentResponse> {
    return request<AgentResponse>('/agent/query', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  /** Get action history for the current user. */
  async getHistory(): Promise<ActionRecord[]> {
    return request<ActionRecord[]>('/history');
  },
};
