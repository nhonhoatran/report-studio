import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/api/client';
import { RESOURCE_ACTIONS, type AccessPolicy, type AccessPolicyInput, type PolicyAction, type ResourceType } from '@/api/types';
import { toast } from '@/store/toast';
import { useT } from '@/i18n';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, ErrorBox, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { AttributesEditor, fromRows, toRows, type AttributeRow } from './AttributesEditor';
import { roleLabel } from './RolesPanel';

const POLICY_FORM_ID = 'policy-form';

interface PolicyForm {
  name: string; enabled: boolean; effect: 'allow' | 'deny';
  roles: string[]; attributes: AttributeRow[];
  type: ResourceType; ids: number[]; actions: PolicyAction[];
  rowFilters: { field: string; attribute: string }[];
}

const toForm = (p: AccessPolicy | null): PolicyForm => p
  ? { name: p.name, enabled: p.enabled, effect: p.effect, roles: p.subject.roles, attributes: toRows(p.subject.attributes), type: p.resource.type, ids: p.resource.ids, actions: p.actions, rowFilters: p.rowFilters }
  : { name: '', enabled: true, effect: 'allow', roles: [], attributes: [], type: 'dashboard', ids: [], actions: ['view'], rowFilters: [] };

const toInput = (f: PolicyForm): AccessPolicyInput => ({
  name: f.name.trim(), enabled: f.enabled, effect: f.effect,
  subject: { roles: f.roles, attributes: fromRows(f.attributes) },
  resource: { type: f.type, ids: f.ids },
  actions: f.actions,
  rowFilters: f.type === 'datasource' && f.effect === 'allow' ? f.rowFilters.filter((r) => r.field.trim() && r.attribute.trim()) : [],
});

/** Add / edit one policy: who, what, which actions, allow or deny, and for a data source the row filters. */
function PolicyModal({ open, initial, onClose }: { open: boolean; initial: AccessPolicy | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState<PolicyForm>(toForm(initial));
  const set = (patch: Partial<PolicyForm>) => setForm((f) => ({ ...f, ...patch }));
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.roles.list().then((r) => r.roles), enabled: open });
  const dashboards = useQuery({ queryKey: ['dashboards'], queryFn: () => api.dashboards.list().then((r) => r.dashboards), enabled: open && form.type === 'dashboard' });
  const datasources = useQuery({ queryKey: ['datasources'], queryFn: () => api.datasources.list().then((r) => r.datasources), enabled: open && form.type === 'datasource' });
  const save = useMutation({
    mutationFn: () => (initial ? api.policies.update(initial.id, toInput(form)) : api.policies.create(toInput(form))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['policies'] }); onClose(); },
  });
  const setType = (type: ResourceType) => set({ type, ids: [], actions: [RESOURCE_ACTIONS[type][0]!], rowFilters: [] });
  const toggleAction = (a: PolicyAction, on: boolean) => set({ actions: on ? [...form.actions, a] : form.actions.filter((x) => x !== a) });
  const targets = form.type === 'dashboard' ? (dashboards.data ?? []).map((d) => ({ value: d.id, label: d.name })) : (datasources.data ?? []).map((d) => ({ value: d.id, label: d.name }));
  const valid = form.name.trim().length > 0 && form.actions.length > 0;
  const rowFiltersApply = form.type === 'datasource' && form.effect === 'allow';

  return (
    <Modal open={open} wide title={initial ? t('policies.editTitle') : t('policies.addTitle')} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form={POLICY_FORM_ID} variant="primary" disabled={!valid} loading={save.isPending}>{t('common.save')}</Button></>}>
      <form id={POLICY_FORM_ID} className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); if (valid) save.mutate(); }}>
        <p className="text-sm text-muted">{t('policies.howItWorks')}</p>
        <div className="form-grid">
          <Input label={t('policies.name')} required value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          <Select label={t('policies.effect')} value={form.effect} onChange={(e) => set({ effect: e.target.value as 'allow' | 'deny' })}>
            <option value="allow">{t('policies.effectAllow')}</option>
            <option value="deny">{t('policies.effectDeny')}</option>
          </Select>
          <Checkbox className="span-2" label={t('policies.enabled')} checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        </div>

        <div className="pane__section-title">{t('policies.subject')}</div>
        <MultiSelect label={t('policies.subjectRoles')} value={form.roles} onChange={(roles) => set({ roles })} allLabel={t('policies.anyone')} summary={t('filters.selected', { count: form.roles.length })}
          options={(roles.data ?? []).map((r) => ({ value: r.name, label: roleLabel(r, r.name, t) }))} />
        <div className="field">
          <span className="field__label">{t('policies.subjectAttributes')}</span>
          <AttributesEditor rows={form.attributes} onChange={(attributes) => set({ attributes })} />
        </div>

        <div className="pane__section-title">{t('policies.resource')}</div>
        <div className="form-grid">
          <Select label={t('policies.resourceType')} value={form.type} onChange={(e) => setType(e.target.value as ResourceType)}>
            <option value="dashboard">{t('policies.resourceTypes.dashboard')}</option>
            <option value="datasource">{t('policies.resourceTypes.datasource')}</option>
          </Select>
          <MultiSelect label={t('policies.resourceIds')} value={form.ids} onChange={(ids) => set({ ids })} allLabel={t('policies.allResources')} summary={t('filters.selected', { count: form.ids.length })} options={targets} />
        </div>
        <div className="field">
          <span className="field__label">{t('policies.actions')}</span>
          <div className="row row--wrap">
            {RESOURCE_ACTIONS[form.type].map((a) => <Checkbox key={a} label={t(`policies.actionLabels.${a}`)} checked={form.actions.includes(a)} onChange={(e) => toggleAction(a, e.target.checked)} />)}
          </div>
        </div>

        {rowFiltersApply && (
          <>
            <div className="pane__section-title">{t('policies.rowFilters')}</div>
            <p className="text-sm text-muted">{t('policies.rowFiltersHint')}</p>
            {form.rowFilters.map((r, i) => (
              <div key={i} className="attr-row">
                <Input size="sm" aria-label={t('policies.rowField')} placeholder={t('policies.rowField')} className="mono" value={r.field} onChange={(e) => set({ rowFilters: form.rowFilters.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })} />
                <Input size="sm" aria-label={t('policies.rowAttribute')} placeholder={t('policies.rowAttribute')} value={r.attribute} onChange={(e) => set({ rowFilters: form.rowFilters.map((x, j) => (j === i ? { ...x, attribute: e.target.value } : x)) })} />
                <Button variant="ghost" size="sm" iconOnly icon={<X size={14} />} onClick={() => set({ rowFilters: form.rowFilters.filter((_, j) => j !== i) })}>{t('common.delete')}</Button>
              </div>
            ))}
            <div><Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => set({ rowFilters: [...form.rowFilters, { field: '', attribute: '' }] })}>{t('policies.addRowFilter')}</Button></div>
          </>
        )}
        {save.error && <ErrorBox error={save.error} />}
      </form>
    </Modal>
  );
}

/** Settings › access policies: the ABAC rules, one row each. */
export function PoliciesPanel() {
  const t = useT();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AccessPolicy | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<AccessPolicy | null>(null);
  const policies = useQuery({ queryKey: ['policies'], queryFn: () => api.policies.list().then((r) => r.policies) });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.roles.list().then((r) => r.roles) });
  const remove = useMutation({
    mutationFn: (id: number) => api.policies.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['policies'] }); setToDelete(null); toast.success(t('common.deleted')); },
    onError: (e) => toast.error(e),
  });
  const subjectText = (p: AccessPolicy) => {
    const parts = [
      ...p.subject.roles.map((r) => roleLabel(roles.data?.find((x) => x.name === r), r, t)),
      ...Object.entries(p.subject.attributes).map(([k, v]) => `${k} = ${v.join(', ')}`),
    ];
    return parts.length ? parts.join(' · ') : t('policies.anyone');
  };

  return (
    <Panel title={t('policies.title')} actions={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>{t('policies.add')}</Button>} flush>
      {policies.isLoading && <Spinner block />}
      {policies.error && <div className="panel__body"><ErrorBox error={policies.error} /></div>}
      {policies.data && policies.data.length === 0 && <EmptyState compact title={t('policies.empty')} hint={t('policies.emptyHint')} />}
      {policies.data && policies.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('policies.name')}</th><th>{t('policies.effect')}</th><th>{t('policies.subject')}</th><th>{t('policies.resource')}</th><th>{t('policies.actions')}</th><th className="num">{t('common.actions')}</th></tr></thead>
            <tbody>
              {policies.data.map((p) => (
                <tr key={p.id}>
                  <td>{p.name} {!p.enabled && <span className="badge">{t('policies.disabled')}</span>}</td>
                  <td><span className={['badge', p.effect === 'deny' ? 'badge--date' : 'badge--number'].join(' ')}>{p.effect === 'deny' ? t('policies.effectDeny') : t('policies.effectAllow')}</span></td>
                  <td>{subjectText(p)}</td>
                  <td>
                    {t(`policies.resourceTypes.${p.resource.type}`)} · {p.resource.ids.length ? t('filters.selected', { count: p.resource.ids.length }) : t('policies.allResources')}
                    {p.rowFilters.length > 0 && <> · {t('policies.rowFilterCount', { count: p.rowFilters.length })}</>}
                  </td>
                  <td>{p.actions.map((a) => t(`policies.actionLabels.${a}`)).join(', ')}</td>
                  <td className="num">
                    <div className="row row--end">
                      <Button variant="ghost" size="sm" iconOnly icon={<Pencil size={15} />} onClick={() => setEditing(p)}>{t('common.edit')}</Button>
                      <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={15} />} onClick={() => setToDelete(p)}>{t('common.delete')}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PolicyModal key={editing === 'new' ? 'new' : editing?.id ?? 'closed'} open={editing !== null} initial={editing === 'new' || editing === null ? null : editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!toDelete} title={t('common.delete')} message={t('common.confirmDelete', { name: toDelete?.name ?? '' })} confirmLabel={t('common.delete')}
        loading={remove.isPending} onConfirm={() => toDelete && remove.mutate(toDelete.id)} onClose={() => setToDelete(null)} />
    </Panel>
  );
}
