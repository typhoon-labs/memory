import type { CSSProperties } from 'react';
import type { CatalogRecord } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

// The catalog's shapes. Color, shape and size all come from the record.
const OUTLINE: Record<string, CSSProperties> = {
  square: {},
  circle: { borderRadius: '50%' },
  oval: { borderRadius: '50%' },
  triangle: { clipPath: 'polygon(50% 6%, 100% 94%, 0 94%)' },
  diamond: { clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' },
  pentagon: { clipPath: 'polygon(50% 2%, 100% 39%, 81% 98%, 19% 98%, 0 39%)' },
  hexagon: { clipPath: 'polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0 50%)' },
  octagon: { clipPath: 'polygon(29.3% 0, 70.7% 0, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0 70.7%, 0 29.3%)' },
  star: { clipPath: 'polygon(50% 2%, 61% 36%, 98% 36%, 68% 58%, 79% 93%, 50% 72%, 21% 93%, 32% 58%, 2% 36%, 39% 36%)' },
  cross: {
    clipPath: 'polygon(34% 0, 66% 0, 66% 34%, 100% 34%, 100% 66%, 66% 66%, 66% 100%, 34% 100%, 34% 66%, 0 66%, 0 34%, 34% 34%)',
  },
};
const REM: Record<string, number> = { tiny: 1.5, small: 2.25, medium: 3, large: 4, huge: 5 };
const UNKNOWN_COLOR = '#6b7280';

const colorOf = (record: CatalogRecord) => (/^#[0-9a-f]{6}$/i.test(record.hex) ? record.hex : UNKNOWN_COLOR);

function Shape({ record }: { record: CatalogRecord }) {
  const width = REM[record.size] ?? REM.medium;
  const height = record.shape === 'oval' ? width * 0.6 : width;
  return (
    <span
      aria-hidden
      className="block"
      style={{ width: `${width}rem`, height: `${height}rem`, background: colorOf(record), ...OUTLINE[record.shape] }}
    />
  );
}

/** One record: its shape on a tint of its own color, then its name and id. */
export function ShapeTile({ record }: { record: CatalogRecord }) {
  return (
    <li className="overflow-hidden rounded-lg border bg-card">
      <div
        className="flex h-24 items-center justify-center"
        style={{ background: `color-mix(in oklch, ${colorOf(record)} 10%, white)` }}
      >
        <Shape record={record} />
      </div>
      {/* Set so that a name such as "Large orange pentagon" stays on one line in a tile of the narrowest width. */}
      <div className="px-2.5 py-2.5">
        <p className="text-sm leading-snug font-medium tracking-[-0.01em]">{record.name}</p>
        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground tabular-nums">{record.id}</p>
      </div>
    </li>
  );
}

export const TILE_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3';

/** Stands in for the tiles until the first answer arrives. */
export function TileSkeletons({ count }: { count: number }) {
  return (
    <div className={TILE_GRID} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[10.25rem] rounded-lg" />
      ))}
    </div>
  );
}
