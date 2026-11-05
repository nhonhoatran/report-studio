import { describe, expect, it } from 'vitest';
import { decide, normalizeAttributes, rowFiltersFor, subjectMatches, type Policy, type Subject } from '../src/auth/abac.js';
import { checkPolicyInput, policyInputSchema } from '../src/auth/policies.js';
import { BUILTIN_ROLES, PERMISSIONS } from '../src/auth/permissions.js';
import { HttpError } from '../src/lib/errors.js';

const policy = (over: Partial<Policy>): Policy => ({
  id: 1, name: 'p', enabled: true, effect: 'allow',
  subject: { roles: [], attributes: {} }, resource: { type: 'dashboard', ids: [] }, actions: ['view'], rowFilters: [],
  ...over,
});
const hanoi: Subject = { role: 'viewer', attributes: { region: ['Hà Nội'], dept: ['sales'] } };
const danang: Subject = { role: 'viewer', attributes: { region: ['Đà Nẵng'] } };
const editor: Subject = { role: 'editor', attributes: {} };

describe('subjectMatches', () => {
  it('matches on role, on attribute values, on "any value", and needs every listed attribute', () => {
    expect(subjectMatches({ roles: ['viewer'], attributes: {} }, hanoi)).toBe(true);
    expect(subjectMatches({ roles: ['editor'], attributes: {} }, hanoi)).toBe(false);
    expect(subjectMatches({ roles: [], attributes: { region: ['Hà Nội', 'Hồ Chí Minh'] } }, hanoi)).toBe(true);
    expect(subjectMatches({ roles: [], attributes: { region: ['Hồ Chí Minh'] } }, hanoi)).toBe(false);
    expect(subjectMatches({ roles: [], attributes: { dept: ['*'] } }, hanoi)).toBe(true);
    expect(subjectMatches({ roles: [], attributes: { dept: ['*'] } }, danang)).toBe(false);
    expect(subjectMatches({ roles: [], attributes: { region: ['Hà Nội'], dept: ['ops'] } }, hanoi)).toBe(false);
  });
});

describe('decide', () => {
  it('permits by default when no policy speaks', () => {
    expect(decide([], hanoi, 'dashboard', 7, 'view')).toBe('allow');
  });
  it('lets a deny win over any allow', () => {
    const policies = [policy({ id: 1, effect: 'allow' }), policy({ id: 2, effect: 'deny', subject: { roles: [], attributes: { region: ['Hà Nội'] } } })];
    expect(decide(policies, hanoi, 'dashboard', 7, 'view')).toBe('deny');
    expect(decide(policies, danang, 'dashboard', 7, 'view')).toBe('allow');
  });
  it('closes a dashboard that an allow policy lists by id to everybody else', () => {
    const policies = [policy({ resource: { type: 'dashboard', ids: [7] }, subject: { roles: [], attributes: { region: ['Hà Nội'] } } })];
    expect(decide(policies, hanoi, 'dashboard', 7, 'view')).toBe('allow');
    expect(decide(policies, danang, 'dashboard', 7, 'view')).toBe('deny');
    expect(decide(policies, editor, 'dashboard', 7, 'view')).toBe('deny');
    // other dashboards and other actions stay open
    expect(decide(policies, danang, 'dashboard', 8, 'view')).toBe('allow');
    expect(decide(policies, danang, 'dashboard', 7, 'edit')).toBe('allow');
  });
  it('ignores disabled policies and policies about another resource type', () => {
    const policies = [
      policy({ effect: 'deny', enabled: false }),
      policy({ effect: 'deny', resource: { type: 'datasource', ids: [] }, actions: ['query'] }),
    ];
    expect(decide(policies, hanoi, 'dashboard', 1, 'view')).toBe('allow');
    expect(decide(policies, hanoi, 'datasource', 1, 'query')).toBe('deny');
  });
});

describe('rowFiltersFor', () => {
  const policies = [
    policy({ resource: { type: 'datasource', ids: [3] }, actions: ['query'], subject: { roles: ['viewer'], attributes: {} }, rowFilters: [{ field: 'region', attribute: 'region' }] }),
    policy({ id: 2, resource: { type: 'datasource', ids: [] }, actions: ['query'], rowFilters: [{ field: 'department', attribute: 'dept' }] }),
  ];
  it("turns each row filter into an IN on the user's attribute values", () => {
    expect(rowFiltersFor(policies, hanoi, 3)).toEqual([
      { field: 'region', op: 'in', values: ['Hà Nội'] },
      { field: 'department', op: 'in', values: ['sales'] },
    ]);
  });
  it('yields an empty IN (no rows) for a user without the attribute, and nothing for a source the policy does not cover', () => {
    expect(rowFiltersFor(policies, danang, 3)).toEqual([
      { field: 'region', op: 'in', values: ['Đà Nẵng'] },
      { field: 'department', op: 'in', values: [] },
    ]);
    expect(rowFiltersFor(policies, editor, 4)).toEqual([{ field: 'department', op: 'in', values: [] }]);
  });
});

describe('normalizeAttributes', () => {
  it('keeps strings and string lists, trims, de-duplicates and drops the rest', () => {
    expect(normalizeAttributes({ region: ' Hà Nội ', dept: ['sales', 'sales', 7, null], empty: '', nested: { a: 1 } })).toEqual({ region: ['Hà Nội'], dept: ['sales', '7'] });
    expect(normalizeAttributes(null)).toEqual({});
    expect(normalizeAttributes(['x'])).toEqual({});
  });
});

describe('policy input', () => {
  it('rejects actions of the other resource type and row filters outside allow data-source policies', () => {
    const base = policyInputSchema.parse({ name: 'x', effect: 'allow', resource: { type: 'dashboard' }, actions: ['view'] });
    expect(() => checkPolicyInput({ ...base, actions: ['query'] })).toThrow(HttpError);
    expect(() => checkPolicyInput({ ...base, rowFilters: [{ field: 'f', attribute: 'a' }] })).toThrow(HttpError);
    expect(() => checkPolicyInput({ ...base, resource: { type: 'datasource', ids: [] }, actions: ['query'], effect: 'deny', rowFilters: [{ field: 'f', attribute: 'a' }] })).toThrow(HttpError);
    expect(() => checkPolicyInput({ ...base, resource: { type: 'datasource', ids: [1] }, actions: ['query'], rowFilters: [{ field: 'f', attribute: 'a' }] })).not.toThrow();
  });
});

describe('built-in roles', () => {
  it('give admin everything and viewer only dashboards.view', () => {
    expect(BUILTIN_ROLES.find((r) => r.name === 'admin')!.permissions).toEqual([...PERMISSIONS]);
    expect(BUILTIN_ROLES.find((r) => r.name === 'viewer')!.permissions).toEqual(['dashboards.view']);
    expect(BUILTIN_ROLES.find((r) => r.name === 'editor')!.permissions).not.toContain('dashboards.filters');
  });
});
