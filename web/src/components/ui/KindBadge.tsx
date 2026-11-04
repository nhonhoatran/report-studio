import { Calendar, Hash, ToggleLeft, Type, CircleHelp } from 'lucide-react';
import type { FieldKind } from '@/api/types';

const icons: Record<FieldKind, typeof Hash> = { number: Hash, date: Calendar, string: Type, boolean: ToggleLeft, other: CircleHelp };

export function KindIcon({ kind, size = 14 }: { kind: FieldKind; size?: number }) {
  const Icon = icons[kind] ?? CircleHelp;
  return <Icon size={size} aria-hidden className={`kind-icon kind-icon--${kind}`} />;
}

export function KindBadge({ kind, label }: { kind: FieldKind; label: string }) {
  const cls = kind === 'number' ? 'badge--number' : kind === 'date' ? 'badge--date' : 'badge--string';
  return <span className={`badge ${cls}`}><KindIcon kind={kind} size={11} />{label}</span>;
}
