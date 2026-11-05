import type {
  AccessPolicy, AccessPolicyInput, AiProvider, AiProviderInput, AiSuggestRequest, AiSuggestResponse, Dashboard, DashboardInput, Dataset, Datasource, DatasourceInput, FieldInfo,
  Permission, PolicyAction, QueryRequest, QueryResult, ResourceType, RoleDefinition, TableInfo, TestResult, User, UserAttributes, AuthProviders, UserPreferences,
} from './types';

/** `code` is the server's stable error code; `lib/errors.ts` translates it. `message` is the English fallback. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

async function request<T>(method: string, url: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = { error: text }; }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/login')) unauthorizedListeners.forEach((fn) => fn());
    const err = (data as { error?: string; code?: string; details?: unknown }) ?? {};
    throw new ApiError(res.status, err.error ?? res.statusText, err.details, err.code);
  }
  return data as T;
}

export const api = {
  auth: {
    providers: () => request<AuthProviders>('GET', '/auth/providers'),
    /** Full-page navigation target that starts the Microsoft Entra sign-in. */
    entraLoginUrl: (returnTo: string) => `/api/auth/entra/login?returnTo=${encodeURIComponent(returnTo)}`,
    login: (username: string, password: string) => request<{ user: User }>('POST', '/auth/login', { username, password }),
    logout: () => request<void>('POST', '/auth/logout'),
    me: () => request<{ user: User }>('GET', '/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) => request<void>('POST', '/auth/change-password', { currentPassword, newPassword }),
    users: () => request<{ users: User[] }>('GET', '/auth/users'),
    createUser: (input: { username: string; displayName: string; password: string; role: string; attributes?: UserAttributes }) => request<{ id: number }>('POST', '/auth/users', input),
    updateUser: (id: number, input: { displayName?: string; password?: string; role?: string; attributes?: UserAttributes }) => request<void>('PUT', `/auth/users/${id}`, input),
    deleteUser: (id: number) => request<void>('DELETE', `/auth/users/${id}`),
  },
  roles: {
    list: () => request<{ roles: RoleDefinition[]; permissions: Permission[] }>('GET', '/roles'),
    create: (input: { name: string; label: string; permissions: Permission[] }) => request<{ role: RoleDefinition }>('POST', '/roles', input),
    update: (name: string, input: { label?: string; permissions?: Permission[] }) => request<{ role: RoleDefinition }>('PUT', `/roles/${encodeURIComponent(name)}`, input),
    remove: (name: string) => request<void>('DELETE', `/roles/${encodeURIComponent(name)}`),
  },
  policies: {
    list: () => request<{ policies: AccessPolicy[]; actions: Record<ResourceType, PolicyAction[]> }>('GET', '/policies'),
    create: (input: AccessPolicyInput) => request<{ policy: AccessPolicy }>('POST', '/policies', input),
    update: (id: number, input: AccessPolicyInput) => request<{ policy: AccessPolicy }>('PUT', `/policies/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/policies/${id}`),
  },
  preferences: {
    get: () => request<{ preferences: UserPreferences }>('GET', '/preferences'),
    update: (preferences: UserPreferences) => request<{ preferences: UserPreferences }>('PUT', '/preferences', { preferences }),
  },
  datasources: {
    list: () => request<{ datasources: Datasource[] }>('GET', '/datasources'),
    get: (id: number) => request<{ datasource: Datasource }>('GET', `/datasources/${id}`),
    create: (input: DatasourceInput) => request<{ datasource: Datasource }>('POST', '/datasources', input),
    update: (id: number, input: Partial<DatasourceInput>) => request<{ datasource: Datasource }>('PUT', `/datasources/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/datasources/${id}`),
    test: (input: Omit<DatasourceInput, 'name'> & { id?: number }) => request<TestResult>('POST', '/datasources/test', input),
    tables: (id: number) => request<{ tables: TableInfo[] }>('GET', `/datasources/${id}/tables`),
    columns: (id: number, table: string) => request<{ columns: FieldInfo[] }>('GET', `/datasources/${id}/tables/${encodeURIComponent(table)}/columns`),
  },
  datasets: {
    list: (datasourceId?: number) => request<{ datasets: Dataset[] }>('GET', datasourceId ? `/datasets?datasourceId=${datasourceId}` : '/datasets'),
    fields: (id: number) => request<{ fields: FieldInfo[] }>('GET', `/datasets/${id}/fields`),
    previewFields: (datasourceId: number, sql: string) => request<{ fields: FieldInfo[] }>('POST', '/datasets/preview-fields', { datasourceId, sql }),
    create: (input: { datasourceId: number; name: string; description?: string; sql: string }) => request<{ dataset: Dataset }>('POST', '/datasets', input),
    update: (id: number, input: { name?: string; description?: string; sql?: string }) => request<{ dataset: Dataset }>('PUT', `/datasets/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/datasets/${id}`),
  },
  dashboards: {
    list: () => request<{ dashboards: Dashboard[] }>('GET', '/dashboards'),
    get: (id: number) => request<{ dashboard: Dashboard & { definition: NonNullable<Dashboard['definition']> } }>('GET', `/dashboards/${id}`),
    create: (input: DashboardInput) => request<{ dashboard: Dashboard }>('POST', '/dashboards', input),
    update: (id: number, input: DashboardInput) => request<{ dashboard: Dashboard }>('PUT', `/dashboards/${id}`, input),
    duplicate: (id: number) => request<{ dashboard: Dashboard }>('POST', `/dashboards/${id}/duplicate`),
    remove: (id: number) => request<void>('DELETE', `/dashboards/${id}`),
  },
  query: {
    run: (req: QueryRequest, signal?: AbortSignal) => request<QueryResult>('POST', '/query', req, { signal }),
    explain: (req: QueryRequest) => request<{ sql: string; params: unknown[] }>('POST', '/query/explain', req),
  },
  ai: {
    providers: () => request<{ providers: AiProvider[] }>('GET', '/ai/providers'),
    createProvider: (input: AiProviderInput) => request<{ provider: AiProvider }>('POST', '/ai/providers', input),
    updateProvider: (id: number, input: Partial<AiProviderInput>) => request<{ provider: AiProvider }>('PUT', `/ai/providers/${id}`, input),
    removeProvider: (id: number) => request<void>('DELETE', `/ai/providers/${id}`),
    testProvider: (input: Partial<AiProviderInput> & { kind: AiProviderInput['kind']; model: string; id?: number }) => request<TestResult>('POST', '/ai/providers/test', input),
    suggest: (req: AiSuggestRequest, signal?: AbortSignal) => request<AiSuggestResponse>('POST', '/ai/suggest', req, { signal }),
  },
};
