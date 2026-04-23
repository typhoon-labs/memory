import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  apiFetch,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  formatRelativeTime,
  Input,
  Label,
  LoadingSpinner,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Textarea,
} from '@typhoon/ui';
import { ChevronRightIcon, Loader2Icon, PlayIcon, SaveIcon, TrashIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

const SCORER_TYPES = [
  { value: 'faithfulness', label: 'Faithfulness' },
  { value: 'hallucination', label: 'Hallucination' },
  { value: 'answerRelevancy', label: 'Answer Relevancy' },
  { value: 'contextRelevance', label: 'Context Relevance' },
  { value: 'contextPrecision', label: 'Context Precision' },
  { value: 'custom', label: 'Custom (LLM Judge)' },
];

const STATUS_VARIANT: Record<string, 'success' | 'pending' | 'warning'> = {
  active: 'success',
  draft: 'pending',
  archived: 'warning',
};

interface ScorerData {
  id: string;
  status: 'draft' | 'active' | 'archived';
  activeVersionId: string | null;
  name: string | null;
  description: string | null;
  type: string | null;
  model: Record<string, unknown> | null;
  instructions: string | null;
  scoreRange: { min: number; max: number } | null;
  defaultSampling: Record<string, unknown> | null;
  versionNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Version {
  id: string;
  versionNumber: number;
  name: string;
  type: string;
  description: string | null;
  changeMessage: string | null;
  createdAt: string;
}

interface PreviewResult {
  score: number;
  reason: string | null;
  durationMs: number;
}

export function ScorerDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { scorerId } = useParams({ strict: false }) as { scorerId: string };

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('faithfulness');
  const [formDescription, setFormDescription] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formScoreMin, setFormScoreMin] = useState('0');
  const [formScoreMax, setFormScoreMax] = useState('1');

  // Save version dialog
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [changeMessage, setChangeMessage] = useState('');

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Preview state
  const [previewQuestion, setPreviewQuestion] = useState('');
  const [previewResponse, setPreviewResponse] = useState('');
  const [previewContext, setPreviewContext] = useState('');
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);

  // Fetch scorer data
  const { data: scorer, isLoading } = useQuery<ScorerData>({
    queryKey: ['admin-scorer', scorerId],
    queryFn: () => apiFetch(`/api/v1/admin/scorers/${scorerId}`),
  });

  // Fetch version history
  const { data: versionsData } = useQuery<{ versions: Version[] }>({
    queryKey: ['admin-scorer-versions', scorerId],
    queryFn: () => apiFetch(`/api/v1/admin/scorers/${scorerId}/versions`),
  });

  // Populate form when data loads
  useEffect(() => {
    if (scorer) {
      setFormName(scorer.name ?? '');
      setFormType(scorer.type ?? 'faithfulness');
      setFormDescription(scorer.description ?? '');
      setFormInstructions(scorer.instructions ?? '');
      setFormModel(scorer.model ? JSON.stringify(scorer.model) : '');
      setFormScoreMin(String(scorer.scoreRange?.min ?? 0));
      setFormScoreMax(String(scorer.scoreRange?.max ?? 1));
    }
  }, [scorer]);

  // Mutations
  const saveVersion = useMutation({
    mutationFn: async () => {
      return apiFetch(`/api/v1/admin/scorers/${scorerId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          type: formType,
          description: formDescription || null,
          instructions: formType === 'custom' ? formInstructions || null : null,
          model: formModel ? JSON.parse(formModel) : null,
          scoreRange: formScoreMin || formScoreMax ? { min: Number(formScoreMin), max: Number(formScoreMax) } : null,
          changeMessage: changeMessage || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-scorer', scorerId] });
      queryClient.invalidateQueries({ queryKey: ['admin-scorer-versions', scorerId] });
      setSaveDialogOpen(false);
      setChangeMessage('');
    },
  });

  const publish = useMutation({
    mutationFn: async (versionId?: string) => {
      return apiFetch(`/api/v1/admin/scorers/${scorerId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(versionId ? { versionId } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-scorer', scorerId] });
      queryClient.invalidateQueries({ queryKey: ['admin-scorers'] });
    },
  });

  const archive = useMutation({
    mutationFn: async () => {
      return apiFetch(`/api/v1/admin/scorers/${scorerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-scorer', scorerId] });
      queryClient.invalidateQueries({ queryKey: ['admin-scorers'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/v1/admin/scorers/${scorerId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-scorers'] });
      navigate({ to: '/scorers' });
    },
  });

  const runPreview = useMutation({
    mutationFn: async () => {
      const contextChunks = previewContext
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      return apiFetch<PreviewResult>(`/api/v1/admin/scorers/${scorerId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: previewQuestion,
          response: previewResponse,
          context: contextChunks,
        }),
      });
    },
    onSuccess: (result) => {
      setPreviewResult(result);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!scorer) {
    return <div className="p-8 text-center text-muted-foreground">Scorer not found</div>;
  }

  const versions = versionsData?.versions ?? [];

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <a href="/scorers" className="text-muted-foreground transition-colors hover:text-foreground">
                Scorers
              </a>
              <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
              {scorer.name ?? 'Unnamed Scorer'}
            </span>
          }
          description={scorer.description ?? undefined}
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge variant={STATUS_VARIANT[scorer.status] ?? 'pending'}>{scorer.status}</StatusBadge>
              {scorer.versionNumber != null && (
                <span className="text-sm text-muted-foreground">v{scorer.versionNumber}</span>
              )}
              {scorer.status !== 'archived' && (
                <Button variant="outline" size="sm" onClick={() => archive.mutate()} disabled={archive.isPending}>
                  Archive
                </Button>
              )}
              <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                  <TrashIcon className="mr-1.5 size-3.5" />
                  Delete
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Scorer</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    This will permanently delete the scorer and all its versions. This action cannot be undone.
                  </p>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button size="sm" onClick={() => publish.mutate(undefined)} disabled={publish.isPending}>
                {publish.isPending ? 'Publishing...' : 'Publish'}
              </Button>
            </div>
          }
        />

        {/* Configuration */}
        <div className="mt-6 rounded-lg border p-6">
          <h3 className="mb-4 text-sm font-semibold">Configuration</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-type">Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger id="edit-type">
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
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>
            {formType === 'custom' && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="edit-instructions">Instructions (LLM Judge Prompt)</Label>
                <Textarea
                  id="edit-instructions"
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  rows={6}
                  placeholder="Evaluation criteria for the LLM judge..."
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-model">Model (optional, JSON)</Label>
              <Input
                id="edit-model"
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                placeholder='{"provider":"openai","name":"gpt-4o-mini"}'
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-score-min">Score Min</Label>
                <Input
                  id="edit-score-min"
                  type="number"
                  value={formScoreMin}
                  onChange={(e) => setFormScoreMin(e.target.value)}
                  className="w-20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-score-max">Score Max</Label>
                <Input
                  id="edit-score-max"
                  type="number"
                  value={formScoreMax}
                  onChange={(e) => setFormScoreMax(e.target.value)}
                  className="w-20"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <Button variant="outline" onClick={() => setSaveDialogOpen(true)}>
                <SaveIcon className="mr-1.5 size-3.5" />
                Save as New Version
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save New Version</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-1.5 py-4">
                  <Label htmlFor="change-message">Change Message (optional)</Label>
                  <Input
                    id="change-message"
                    placeholder="What changed?"
                    value={changeMessage}
                    onChange={(e) => setChangeMessage(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={() => saveVersion.mutate()} disabled={saveVersion.isPending}>
                    {saveVersion.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-6 rounded-lg border p-6">
          <h3 className="mb-4 text-sm font-semibold">Preview</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Test this scorer against sample data. Results are not saved.
          </p>
          <div className="grid gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preview-question">Question</Label>
              <Textarea
                id="preview-question"
                value={previewQuestion}
                onChange={(e) => setPreviewQuestion(e.target.value)}
                rows={2}
                placeholder="What did the user ask?"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preview-response">Response</Label>
              <Textarea
                id="preview-response"
                value={previewResponse}
                onChange={(e) => setPreviewResponse(e.target.value)}
                rows={3}
                placeholder="What did the agent respond?"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preview-context">Context Chunks (one per line)</Label>
              <Textarea
                id="preview-context"
                value={previewContext}
                onChange={(e) => setPreviewContext(e.target.value)}
                rows={3}
                placeholder="Paste retrieved context chunks, one per line..."
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => runPreview.mutate()}
                disabled={!previewQuestion.trim() || !previewResponse.trim() || runPreview.isPending}
              >
                {runPreview.isPending ? (
                  <>
                    <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <PlayIcon className="mr-1.5 size-3.5" />
                    Run Preview
                  </>
                )}
              </Button>
              {runPreview.isError && <span className="text-sm text-destructive">{runPreview.error.message}</span>}
            </div>
            {previewResult && (
              <div className="rounded-md border bg-muted/50 p-4">
                <div className="flex items-baseline gap-4">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Score</span>
                    <div className="text-2xl font-bold tabular-nums">{previewResult.score.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Duration</span>
                    <div className="text-sm">{previewResult.durationMs}ms</div>
                  </div>
                </div>
                {previewResult.reason && (
                  <div className="mt-3">
                    <span className="text-xs font-medium text-muted-foreground">Reason</span>
                    <p className="mt-1 text-sm">{previewResult.reason}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Version History */}
        <div className="mt-6 rounded-lg border p-6">
          <h3 className="mb-4 text-sm font-semibold">Version History</h3>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions yet.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-sm font-medium">v{v.versionNumber}</span>
                    {v.id === scorer.activeVersionId && <StatusBadge variant="success">active</StatusBadge>}
                    {v.changeMessage && <span className="text-sm text-muted-foreground">{v.changeMessage}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(v.createdAt)}</span>
                    {v.id !== scorer.activeVersionId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => publish.mutate(v.id)}
                        disabled={publish.isPending}
                      >
                        Publish
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
