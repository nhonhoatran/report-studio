import { describe, expect, it } from 'vitest';
import {
  displayNameFromClaims, domainAllowed, emailFromClaims, expectedIssuer, pkcePair, roleFromClaims, safeReturnTo, usernameFromClaims,
} from '../src/auth/entraMapping.js';
import { createHash } from 'node:crypto';

const mapping = { admin: ['ReportStudio.Admin'], editor: ['ReportStudio.Editor', 'a1b2c3d4-0000-0000-0000-000000000001'], viewer: ['ReportStudio.Viewer'] };

describe('emailFromClaims', () => {
  it('prefers email, then preferred_username, then upn, lower-cased', () => {
    expect(emailFromClaims({ email: 'An.Nguyen@Corp.VN', preferred_username: 'other@corp.vn' })).toBe('an.nguyen@corp.vn');
    expect(emailFromClaims({ preferred_username: 'An@corp.vn' })).toBe('an@corp.vn');
    expect(emailFromClaims({ upn: 'an@corp.vn' })).toBe('an@corp.vn');
  });
  it('ignores values that are not addresses', () => {
    expect(emailFromClaims({ preferred_username: 'live.com#an@corp' })).toBe('live.com#an@corp');
    expect(emailFromClaims({ preferred_username: 'no-at-sign' })).toBeNull();
    expect(emailFromClaims({})).toBeNull();
  });
});

describe('domainAllowed', () => {
  it('accepts everyone when the list is empty', () => {
    expect(domainAllowed(null, [])).toBe(true);
  });
  it('matches the e-mail domain case-insensitively', () => {
    expect(domainAllowed('an@corp.vn', ['corp.vn'])).toBe(true);
    expect(domainAllowed('an@CORP.vn', ['Corp.VN', 'other.com'])).toBe(true);
    expect(domainAllowed('an@evil-corp.vn', ['corp.vn'])).toBe(false);
    expect(domainAllowed(null, ['corp.vn'])).toBe(false);
  });
});

describe('roleFromClaims', () => {
  it('returns the highest mapped role across roles and groups', () => {
    expect(roleFromClaims({ roles: ['ReportStudio.Viewer', 'ReportStudio.Admin'] }, mapping)).toBe('admin');
    expect(roleFromClaims({ groups: ['A1B2C3D4-0000-0000-0000-000000000001'] }, mapping)).toBe('editor');
    expect(roleFromClaims({ roles: ['reportstudio.viewer'] }, mapping)).toBe('viewer');
  });
  it('returns null when nothing matches or no claim is present', () => {
    expect(roleFromClaims({ roles: ['Something.Else'] }, mapping)).toBeNull();
    expect(roleFromClaims({}, mapping)).toBeNull();
    expect(roleFromClaims({ roles: ['ReportStudio.Admin'] }, { admin: [], editor: [], viewer: [] })).toBeNull();
  });
});

describe('usernameFromClaims / displayNameFromClaims', () => {
  it('uses the UPN and falls back to the object id', () => {
    expect(usernameFromClaims({ preferred_username: 'An.Nguyen@corp.vn' })).toBe('an.nguyen@corp.vn');
    expect(usernameFromClaims({ oid: '11111111-2222-3333-4444-555555555555' })).toBe('entra-11111111-2222-3333-4444-555555555555');
  });
  it('fits the users.username column', () => {
    const long = `${'a'.repeat(80)}@corp.vn`;
    expect(usernameFromClaims({ preferred_username: long })).toHaveLength(64);
  });
  it('prefers the name claim for display', () => {
    expect(displayNameFromClaims({ name: ' Nguyễn Văn An ', email: 'an@corp.vn' })).toBe('Nguyễn Văn An');
    expect(displayNameFromClaims({ email: 'an@corp.vn' })).toBe('an@corp.vn');
  });
});

describe('safeReturnTo', () => {
  it('keeps same-origin paths', () => {
    expect(safeReturnTo('/dashboards/3/edit')).toBe('/dashboards/3/edit');
    expect(safeReturnTo('/settings?tab=users')).toBe('/settings?tab=users');
  });
  it('rejects anything that could leave the app', () => {
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'dashboards', '/x\r\nSet-Cookie: a=b', '/api/auth/logout', undefined, 42]) {
      expect(safeReturnTo(bad)).toBe('/dashboards');
    }
  });
});

describe('expectedIssuer', () => {
  it('substitutes the tenant id into multi-tenant issuer templates', () => {
    expect(expectedIssuer('https://login.microsoftonline.com/{tenantid}/v2.0', 'abc')).toBe('https://login.microsoftonline.com/abc/v2.0');
    expect(expectedIssuer('https://login.microsoftonline.com/{tenantid}/v2.0', undefined)).toBeNull();
    expect(expectedIssuer('https://login.microsoftonline.com/abc/v2.0', 'other')).toBe('https://login.microsoftonline.com/abc/v2.0');
  });
});

describe('pkcePair', () => {
  it('produces an S256 challenge of the verifier', () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(pkcePair().verifier).not.toBe(verifier);
  });
});
