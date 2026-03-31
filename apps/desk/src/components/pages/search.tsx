import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  LoadingSpinner,
  PageHeader,
} from '@typhoon/ui';
import { SearchIcon } from 'lucide-react';
import { useState } from 'react';

interface SearchResult {
  text: string;
  score: number;
  metadata: {
    documentId?: string;
    source?: string;
    title?: string;
  };
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch('/api/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topK: 10 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        console.error('Search failed', err);
        setResults([]);
        setHasSearched(true);
        return;
      }
      const data = await res.json();
      setResults(data.results ?? []);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Search Knowledge Base" description="Search across all ingested documents" />

        <form onSubmit={handleSearch} className="mt-6 flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents..."
            className="flex-1"
          />
          <Button type="submit" disabled={isSearching}>
            {isSearching ? <LoadingSpinner size="sm" /> : <SearchIcon className="mr-2 size-4" />}
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
        </form>

        <div className="mt-6 space-y-3">
          {isSearching && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {!isSearching &&
            results.map((result) => (
              <Card key={`${result.metadata.documentId}-${result.text.slice(0, 20)}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {result.metadata.title ?? result.metadata.source ?? 'Unknown'}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">Score: {(result.score * 100).toFixed(1)}%</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{result.text}</p>
                </CardContent>
              </Card>
            ))}

          {hasSearched && results.length === 0 && !isSearching && (
            <EmptyState
              icon={<SearchIcon className="size-8" />}
              title="No results found"
              description="Try adjusting your search query."
            />
          )}
        </div>
      </div>
    </div>
  );
}
