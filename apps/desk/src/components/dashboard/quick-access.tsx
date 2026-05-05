import { Link } from '@tanstack/react-router';
import { Button } from '@typhoon/ui';
import { PlusIcon, SearchIcon } from 'lucide-react';

/** Action entry points: new chat + search. */
export function QuickAccess() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" asChild>
        <Link to="/chat">
          <PlusIcon className="mr-1.5 size-3.5" />
          New chat
        </Link>
      </Button>
      <Button size="sm" variant="outline" asChild>
        <Link to="/search">
          <SearchIcon className="mr-1.5 size-3.5" />
          Search KB
        </Link>
      </Button>
    </div>
  );
}
