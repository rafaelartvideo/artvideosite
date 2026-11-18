import { matchQuery, type QueryClient, type QueryKey } from '@tanstack/react-query';

/** Mark all affected caches stale, then refetch each foreground query once. */
export async function invalidateRealtimeBatch(
  client: QueryClient,
  keys: QueryKey[],
  isForeground: (key: QueryKey) => boolean,
) {
  if (!keys.length) return;
  const affected = (query: Parameters<typeof matchQuery>[1]) =>
    keys.some(queryKey => matchQuery({ queryKey }, query));
  await client.invalidateQueries({ predicate: affected, refetchType: 'none' });
  await client.refetchQueries({
    type: 'active',
    predicate: query => affected(query) && isForeground(query.queryKey),
  });
}
