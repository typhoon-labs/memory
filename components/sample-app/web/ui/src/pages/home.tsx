import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { useFeatured, usePageTitle, useSite, useStatus } from '@/lib/queries';
import { SearchField } from '@/components/search-field';
import { ShapeTile, TILE_GRID, TileSkeletons } from '@/components/shape';
import { Unavailable } from '@/components/unavailable';
import { Button } from '@/components/ui/button';

/** `null`: the service could not say. `undefined`: not known yet. */
function Count({ value, one, many }: { value: number | null | undefined; one: string; many: string }) {
  const unavailable = value === null;
  return (
    // The width is fixed so that the next count does not move when this one becomes unavailable.
    <div className={cn('w-60', unavailable && 'text-destructive')}>
      <p className="text-4xl font-semibold tracking-tight tabular-nums">{value == null ? '–' : value.toLocaleString()}</p>
      <p className={cn('mt-1', unavailable ? 'font-semibold' : 'text-muted-foreground')}>
        {unavailable ? `${many}: unavailable` : value === 1 ? one : many}
      </p>
    </div>
  );
}

export function Home() {
  const site = useSite().data;
  const featured = useFeatured();
  const status = useStatus().data;
  const navigate = useNavigate();
  usePageTitle('Home');

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    navigate(q ? `/search?${new URLSearchParams({ q })}` : '/search');
  };
  // The count comes through the search API itself, so it fails when search fails.
  const indexed = featured.isError ? null : featured.data?.indexed;

  return (
    <>
      {/* The header already carries the name, so the page opens with what the app is. */}
      <h1 className="max-w-2xl text-4xl leading-[1.15] font-semibold tracking-[-0.03em] text-balance">{site?.description}</h1>
      <form role="search" onSubmit={search} className="mt-6 flex max-w-2xl gap-2">
        <SearchField aria-label="Search the catalog" className="flex-1" />
        <Button type="submit" className="h-12 px-6 text-base">
          Search
        </Button>
      </form>

      <section aria-labelledby="featured" className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="featured" className="text-xl font-semibold">
            From the catalog
          </h2>
          {indexed != null && (
            <Link to="/search" className="font-medium underline underline-offset-4">
              See all {indexed.toLocaleString()}
            </Link>
          )}
        </div>
        <div className="mt-4">
          {featured.isError ? (
            <Unavailable what="The catalog" />
          ) : featured.data ? (
            <ul className={TILE_GRID}>
              {featured.data.results.map((record) => (
                <ShapeTile key={record.id} record={record} />
              ))}
            </ul>
          ) : (
            <TileSkeletons count={12} />
          )}
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-x-10 gap-y-6">
        <Count value={indexed} one="record indexed" many="records indexed" />
        <Count value={status?.registrations_today} one="registration today" many="registrations today" />
      </div>
    </>
  );
}
