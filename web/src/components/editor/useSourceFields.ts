import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { QuerySource } from '@/api/types';

/** `table:v_sales` / `dataset:3`: the part of a cache key that names a source. */
export const sourceKeyOf = (source: QuerySource | null | undefined): string =>
  !source ? '' : source.type === 'table' ? `table:${source.table}` : `dataset:${source.datasetId}`;

/**
 * The columns of a table or dataset, cached once per source: the fields pane lists them, the
 * filter dialog picks from them, and every widget checks them before a dashboard filter is applied.
 */
export function useSourceFields(datasourceId: number | null | '', source: QuerySource | null | undefined) {
  const key = sourceKeyOf(source);
  return useQuery({
    queryKey: ['fields', datasourceId || '', key],
    queryFn: () => (source!.type === 'table'
      ? api.datasources.columns(Number(datasourceId), source!.table).then((r) => r.columns)
      : api.datasets.fields(source!.datasetId).then((r) => r.fields)),
    enabled: !!datasourceId && !!source,
    staleTime: 5 * 60_000,
  });
}
