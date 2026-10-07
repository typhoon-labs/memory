import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { clock, type SearchResult } from '@/lib/api';
import { usePageTitle, useSearch, useSite } from '@/lib/queries';
import { SearchField } from '@/components/search-field';
import { ShapeTile, TILE_GRID, TileSkeletons } from '@/components/shape';
import { Unavailable } from '@/components/unavailable';
import { Button } from '@/components/ui/button';

/** `value`, once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function matches({ query, count, results }: SearchResult): string {
  if (query && count === 0) return `No record matches “${query}”. Try a color, a shape or a size.`;
  const first = count > results.length ? ` Showing the first ${results.length}.` : '';
  return query ? `${count} ${count === 1 ? 'match' : 'matches'} for “${query}”.${first}` : first.trim();
}

export function Search() {
  const site = useSite().data;
  // The query lives in the address, so a search can be linked to and reloaded.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const typed = q.trim();
  const search = useSearch(useSettled(typed, 200));
  usePageTitle('Search');

  const setQ = (value: string) => setParams(value ? { q: value } : {}, { replace: true });
  // Old results next to an error would read as "still working": they are not shown.
  const result = search.isError ? undefined : search.data;

  return (
    <>
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <h1 className="text-4xl font-semibold tracking-[-0.03em]">
          <label htmlFor="q">Search the catalog</label>
        </h1>
        <SearchField id="q" autoFocus value={q} onChange={(event) => setQ(event.target.value)} className="mt-5 max-w-2xl" />
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Try</span>
        {site?.suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant={suggestion === typed ? 'default' : 'outline'}
            aria-pressed={suggestion === typed}
            className="rounded-full px-3.5"
            onClick={() => setQ(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>

      {search.isError ? (
        <div className="mt-8">
          <Unavailable what="Results" />
        </div>
      ) : (
        <>
          <div className="mt-8 flex min-h-7 flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
            {result && (
              <>
                <p className="text-lg tabular-nums">
                  <strong className="font-semibold">{result.indexed.toLocaleString()}</strong> records indexed. {matches(result)}
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">Updated {clock(search.dataUpdatedAt)}</p>
              </>
            )}
          </div>
          <div className="mt-4">
            {result ? (
              <ol className={TILE_GRID}>
                {result.results.map((record) => (
                  <ShapeTile key={record.id} record={record} />
                ))}
              </ol>
            ) : (
              <TileSkeletons count={12} />
            )}
          </div>
        </>
      )}
    </>
  );
}
