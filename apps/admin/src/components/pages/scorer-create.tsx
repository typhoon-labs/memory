import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  apiFetch,
  Button,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
} from '@typhoon/ui';
import { ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { usePageTitle } from '../../hooks/use-page-title';

const SCORER_TYPES = [
  { value: 'faithfulness', label: 'Faithfulness' },
  { value: 'hallucination', label: 'Hallucination' },
  { value: 'answerRelevancy', label: 'Answer Relevancy' },
  { value: 'contextRelevance', label: 'Context Relevance' },
  { value: 'contextPrecision', label: 'Context Precision' },
  { value: 'custom', label: 'Custom (LLM Judge)' },
];

export function ScorerCreatePage() {
  usePageTitle('Create Scorer');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState('faithfulness');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiFetch<{ id: string }>('/api/v1/admin/scorers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          description: description.trim() || undefined,
          instructions: type === 'custom' ? instructions.trim() || undefined : undefined,
        }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-scorers'] });
      navigate({ to: '/scorers/$scorerId', params: { scorerId: data.id } });
    },
  });

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <Link to="/scorers" className="text-muted-foreground transition-colors hover:text-foreground">
                Scorers
              </Link>
              <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
              Create
            </span>
          }
        />

        <div className="mt-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold">Details</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Configure the scorer name, type, and evaluation criteria.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scorer-name">Name</Label>
            <Input
              id="scorer-name"
              placeholder="e.g. tone-checker"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scorer-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="scorer-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCORER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scorer-description">Description (optional)</Label>
            <Textarea
              id="scorer-description"
              placeholder="What does this scorer evaluate?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          {type === 'custom' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scorer-instructions">Instructions</Label>
              <Textarea
                id="scorer-instructions"
                placeholder="Evaluation criteria for the LLM judge..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
              />
            </div>
          )}

          <Separator />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: '/scorers' })}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
