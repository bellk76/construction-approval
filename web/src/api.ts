const BASE = '/api';

export interface User {
  id: number;
  login: string;
  fullName: string;
  roleCodes: string[];
  permissions: string[];
}

export interface Step {
  id: number;
  order: number;
  status: string;
  dueAt: string;
  requiredRole: { code: string; name: string };
}

export interface PurchaseRequest {
  id: number;
  number: string;
  amount: string | number;
  status: string;
  version: number;
  steps: Step[];
}

async function http<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface RefItem {
  id: number;
  name: string;
}

export const api = {
  login: (login: string, password: string) =>
    http<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) }),
  logout: () => http<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => http<{ user: User }>('/auth/me'),
  projects: () => http<RefItem[]>('/catalog/projects'),
  contractors: () => http<RefItem[]>('/catalog/contractors'),
  request: (id: number) => http<PurchaseRequest>(`/approval/requests/${id}`),
  create: (data: { projectId: number; contractorId: number; amount: number }) =>
    http<{ id: number }>('/approval/requests', { method: 'POST', body: JSON.stringify(data) }),
  submit: (id: number) => http<PurchaseRequest>(`/approval/requests/${id}/submit`, { method: 'POST' }),
  approve: (stepId: number) => http<PurchaseRequest>(`/approval/steps/${stepId}/approve`, { method: 'POST' }),
  reject: (stepId: number, reason: string) =>
    http<PurchaseRequest>(`/approval/steps/${stepId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};
