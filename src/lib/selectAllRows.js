// Supabase/PostgREST silently caps every select at 1,000 rows. Any table that
// can grow past that (contacts, mailer list members, tasks, …) must be read in
// pages or the app quietly loads a truncated database. `buildQuery` is a
// factory because PostgREST query builders are single-use — a fresh builder is
// needed for each page request.
const PAGE_SIZE = 1000;

export async function selectAllRows(buildQuery) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) {
      // Surface the error with whatever loaded so callers keep their existing
      // `if (!error && data)` handling; a first-page failure yields data: null.
      return { data: from === 0 ? null : rows, error };
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: rows, error: null };
}
