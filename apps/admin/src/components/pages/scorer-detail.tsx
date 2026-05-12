import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  apiFetch,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  formatRelativeTime,
  Input,
  Label,
  LoadingSpinner,
  PageHeader,
  SectionLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@typhoon/ui';
import {
  ArchiveIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  DiffIcon,
  Loader2Icon,
  PenLineIcon,
  PlayIcon,
  RotateCcwIcon,
  SaveIcon,
  TrashIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { detailTitle, usePageTitle } from '../../hooks/use-page-title';

const SCORER_TYPES = [
  { value: 'faithfulness', label: 'Faithfulness' },
  { value: 'hallucination', label: 'Hallucination' },
  { value: 'answerRelevancy', label: 'Answer Relevancy' },
  { value: 'contextRelevance', label: 'Context Relevance' },
  { value: 'contextPrecision', label: 'Context Precision' },
  { value: 'custom', label: 'Custom (LLM Judge)' },
];

/** Extract a model ID string from the stored JSONB model object. */
function extractModelId(model: Record<string, unknown> | null): string {
  if (!model) return '';
  if (typeof model.id === 'string') return model.id;
  if (typeof model.name === 'string') return model.name;
  return '';
}

/** Get a short display label from a model ID (last segment after /). */
function modelLabel(id: string): string {
  const parts = id.split('/');
  return parts[parts.length - 1];
}

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
  instructions: string | null;
  model: Record<string, unknown> | null;
  scoreRange: { min: number; max: number } | null;
  changedFields: string[] | null;
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

  // Tab state — URL-driven
  const { tab: activeTab } = useSearch({ strict: false }) as { tab: 'configuration' | 'versions' };
  function setActiveTab(next: string) {
    navigate({ to: '/scorers/$scorerId', params: { scorerId }, search: { tab: next }, replace: true });
  }

  // Version controls
  const [allExpanded, setAllExpanded] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState('');
  const [previewResponse, setPreviewResponse] = useState('');
  const [previewContext, setPreviewContext] = useState('');
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);

  /** Load a version's config into the editor form. */
  function loadVersion(v: Version) {
    setFormName(v.name);
    setFormType(v.type);
    setFormDescription(v.description ?? '');
    setFormInstructions(v.instructions ?? '');
    setFormModel(extractModelId(v.model));
    setFormScoreMin(String(v.scoreRange?.min ?? 0));
    setFormScoreMax(String(v.scoreRange?.max ?? 1));
    setActiveTab('configuration');
  }

  // Fetch scorer data
  const { data: scorer, isLoading } = useQuery<ScorerData>({
    queryKey: ['admin-scorer', scorerId],
    queryFn: () => apiFetch(`/api/v1/admin/scorers/${scorerId}`),
  });

  usePageTitle(detailTitle('Scorers', scorer ? (scorer.name ?? undefined) : undefined));

  // Fetch version history
  const { data: versionsData } = useQuery<{ versions: Version[] }>({
    queryKey: ['admin-scorer-versions', scorerId],
    queryFn: () => apiFetch(`/api/v1/admin/scorers/${scorerId}/versions`),
  });

  // Fetch available scorer models
  const { data: modelsData } = useQuery<{ models: string[]; defaultModel: string }>({
    queryKey: ['admin-scorer-models'],
    queryFn: () => apiFetch('/api/v1/admin/scorers/models'),
    staleTime: 5 * 60_000,
  });
  const availableModels = modelsData?.models ?? [];
  const defaultModel = modelsData?.defaultModel ?? '';

  // Populate form when data loads
  useEffect(() => {
    if (scorer) {
      setFormName(scorer.name ?? '');
      setFormType(scorer.type ?? 'faithfulness');
      setFormDescription(scorer.description ?? '');
      setFormInstructions(scorer.instructions ?? '');
      setFormModel(extractModelId(scorer.model));
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
          model: formModel ? { id: formModel } : null,
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
      const newStatus = scorer?.status === 'archived' ? 'draft' : 'archived';
      return apiFetch(`/api/v1/admin/scorers/${scorerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
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
    <div className="h-full overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <Link to="/scorers" className="text-muted-foreground transition-colors hover:text-foreground">
                Scorers
              </Link>
              <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
              {scorer.name ?? 'Unnamed Scorer'}
              {scorer.versionNumber != null && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                  v{scorer.versionNumber}
                </span>
              )}
              <StatusBadge variant={STATUS_VARIANT[scorer.status] ?? 'pending'}>{scorer.status}</StatusBadge>
            </span>
          }
          description={scorer.description ?? undefined}
          actions={
            <div className="flex items-center gap-2">
              {scorer.status === 'draft' && (
                <Button size="sm" onClick={() => publish.mutate(undefined)} disabled={publish.isPending}>
                  <PlayIcon className="mr-1.5 size-3.5" />
                  {publish.isPending ? 'Publishing...' : 'Publish'}
                </Button>
              )}
              {scorer.status === 'active' && (
                <Button variant="outline" size="sm" onClick={() => archive.mutate()} disabled={archive.isPending}>
                  <ArchiveIcon className="mr-1.5 size-3.5" />
                  Archive
                </Button>
              )}
              {scorer.status === 'archived' && (
                <Button variant="outline" size="sm" onClick={() => archive.mutate()} disabled={archive.isPending}>
                  <RotateCcwIcon className="mr-1.5 size-3.5" />
                  Restore
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                <TrashIcon className="mr-1.5 size-3.5" />
                Delete
              </Button>
              <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
            </div>
          }
        />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
              <TabsTrigger value="versions">Versions</TabsTrigger>
            </TabsList>
            {activeTab === 'versions' && versions.length > 0 && (
              <TooltipProvider delayDuration={300}>
                <div className="flex items-center gap-0.5">
                  {allExpanded && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={showDiff ? 'secondary' : 'ghost'}
                          size="icon"
                          className="size-7"
                          onClick={() => setShowDiff(!showDiff)}
                        >
                          <DiffIcon className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Highlight changes</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={allExpanded ? 'secondary' : 'ghost'}
                        size="icon"
                        className="size-7"
                        onClick={() => setAllExpanded(!allExpanded)}
                      >
                        {allExpanded ? (
                          <ChevronsDownUpIcon className="size-3.5" />
                        ) : (
                          <ChevronsUpDownIcon className="size-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{allExpanded ? 'Collapse all' : 'Expand all'}</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            )}
          </div>

          <TabsContent value="configuration" className="mt-4">
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold">Details</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Configure the scorer name, type, and evaluation criteria.
                </p>
              </div>
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                />
              </div>
              {formType === 'custom' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-instructions">Instructions</Label>
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
                <Label htmlFor="edit-model">Model</Label>
                <Select
                  value={formModel || '__default__'}
                  onValueChange={(v) => setFormModel(v === '__default__' ? '' : v)}
                >
                  <SelectTrigger id="edit-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Default ({modelLabel(defaultModel)})</SelectItem>
                    {availableModels.map((m) => (
                      <SelectItem key={m} value={m}>
                        {modelLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Score Range</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="edit-score-min"
                    type="number"
                    value={formScoreMin}
                    onChange={(e) => setFormScoreMin(e.target.value)}
                    className="w-20"
                    placeholder="Min"
                  />
                  <span className="text-sm text-muted-foreground">&ndash;</span>
                  <Input
                    id="edit-score-max"
                    type="number"
                    value={formScoreMax}
                    onChange={(e) => setFormScoreMax(e.target.value)}
                    className="w-20"
                    placeholder="Max"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                  <PlayIcon className="mr-1.5 size-3.5" />
                  Preview
                </Button>
                <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <SaveIcon className="mr-1.5 size-3.5" />
                      Save Version
                    </Button>
                  </DialogTrigger>
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
          </TabsContent>

          <TabsContent value="versions" className="mt-4">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No versions yet.</p>
            ) : (
              <div className="relative">
                {versions.map((v, idx) => {
                  const isActive = v.id === scorer.activeVersionId;
                  const isLast = idx === versions.length - 1;
                  const prev = versions[idx + 1] ?? null;
                  return (
                    <div key={v.id} className="flex gap-4 pb-6 last:pb-0">
                      {/* Left: time label — h-8 matches Button size="sm" */}
                      <div className="flex h-8 w-16 shrink-0 items-center justify-end text-xs text-muted-foreground">
                        {formatRelativeTime(v.createdAt)}
                      </div>

                      {/* Center: dot + connector line */}
                      <div className="relative flex w-3 shrink-0 justify-center">
                        {idx > 0 && (
                          <div className="absolute bottom-full left-1/2 h-6 w-px -translate-x-1/2 bg-border" />
                        )}
                        <div className="flex h-8 items-center">
                          <div
                            className={`z-10 size-2.5 rounded-full border-2 ${
                              isActive ? 'border-foreground bg-foreground' : 'border-muted-foreground/40 bg-background'
                            }`}
                          />
                        </div>
                        {!isLast && (
                          <div className="absolute top-8 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border" />
                        )}
                      </div>

                      {/* Right: content */}
                      <VersionEntry
                        version={v}
                        prev={prev}
                        isActive={isActive}
                        globalExpanded={allExpanded}
                        globalDiff={showDiff}
                        onRestore={() => loadVersion(v)}
                        onPublish={() => publish.mutate(v.id)}
                        publishPending={publish.isPending}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent resizable className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Preview</SheetTitle>
          </SheetHeader>
          <div className="space-y-5 px-4 pb-4">
            <PreviewPanel
              question={previewQuestion}
              onQuestionChange={setPreviewQuestion}
              response={previewResponse}
              onResponseChange={setPreviewResponse}
              context={previewContext}
              onContextChange={setPreviewContext}
              result={previewResult}
              onRun={() => runPreview.mutate()}
              isPending={runPreview.isPending}
              isError={runPreview.isError}
              errorMessage={runPreview.error?.message}
              disabled={!previewQuestion.trim() || !previewResponse.trim()}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PreviewPanel({
  question,
  onQuestionChange,
  response,
  onResponseChange,
  context,
  onContextChange,
  result,
  onRun,
  isPending,
  isError,
  errorMessage,
  disabled,
}: {
  question: string;
  onQuestionChange: (v: string) => void;
  response: string;
  onResponseChange: (v: string) => void;
  context: string;
  onContextChange: (v: string) => void;
  result: PreviewResult | null;
  onRun: () => void;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  disabled: boolean;
}) {
  return (
    <>
      {/* Input */}
      <div>
        <SectionLabel>Input</SectionLabel>
        <div className="mt-2 space-y-3">
          <Textarea
            id="preview-question"
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            rows={2}
            placeholder="What did the user ask?"
          />
        </div>
      </div>

      {/* Response */}
      <div>
        <SectionLabel>Response</SectionLabel>
        <div className="mt-2">
          <Textarea
            id="preview-response"
            value={response}
            onChange={(e) => onResponseChange(e.target.value)}
            rows={3}
            placeholder="What did the agent respond?"
          />
        </div>
      </div>

      {/* Context */}
      <div>
        <SectionLabel>Context Chunks</SectionLabel>
        <div className="mt-2">
          <Textarea
            id="preview-context"
            value={context}
            onChange={(e) => onContextChange(e.target.value)}
            rows={3}
            placeholder="One chunk per line..."
          />
        </div>
      </div>

      {/* Run */}
      <Button onClick={onRun} disabled={disabled || isPending} className="w-full">
        {isPending ? (
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
      {isError && errorMessage && <span className="text-sm text-destructive">{errorMessage}</span>}

      {/* Result */}
      {result && (
        <div>
          <SectionLabel>Result</SectionLabel>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Score</dt>
              <dd className="mt-0.5 text-2xl font-bold tabular-nums">{result.score.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Duration</dt>
              <dd className="mt-0.5">{result.durationMs}ms</dd>
            </div>
            {result.reason && (
              <div>
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="mt-0.5">{result.reason}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </>
  );
}

/** Simple word-level diff producing segments for inline highlighting. */
function wordDiff(oldStr: string, newStr: string): Array<{ text: string; type: 'same' | 'add' | 'remove' }> {
  const oldWords = oldStr.split(/(\s+)/);
  const newWords = newStr.split(/(\s+)/);
  const segments: Array<{ text: string; type: 'same' | 'add' | 'remove' }> = [];
  let oi = 0;
  let ni = 0;
  while (oi < oldWords.length && ni < newWords.length) {
    if (oldWords[oi] === newWords[ni]) {
      segments.push({ text: newWords[ni], type: 'same' });
      oi++;
      ni++;
    } else {
      const newIdx = newWords.indexOf(oldWords[oi], ni);
      if (newIdx !== -1 && newIdx - ni < 8) {
        for (let k = ni; k < newIdx; k++) segments.push({ text: newWords[k], type: 'add' });
        ni = newIdx;
      } else {
        const oldIdx = oldWords.indexOf(newWords[ni], oi);
        if (oldIdx !== -1 && oldIdx - oi < 8) {
          for (let k = oi; k < oldIdx; k++) segments.push({ text: oldWords[k], type: 'remove' });
          oi = oldIdx;
        } else {
          segments.push({ text: oldWords[oi], type: 'remove' });
          segments.push({ text: newWords[ni], type: 'add' });
          oi++;
          ni++;
        }
      }
    }
  }
  while (oi < oldWords.length) {
    segments.push({ text: oldWords[oi++], type: 'remove' });
  }
  while (ni < newWords.length) {
    segments.push({ text: newWords[ni++], type: 'add' });
  }
  return segments;
}

/** Render text with word-level diff highlights, or plain text if no previous version. */
function DiffText({ value, prevValue }: { value: string; prevValue?: string }) {
  if (!prevValue || prevValue === value) return <>{value}</>;

  const segments = wordDiff(prevValue, value);
  return (
    <>
      {segments.map((seg, i) => {
        const key = `${seg.type}-${i}`;
        if (seg.type === 'same') return <span key={key}>{seg.text}</span>;
        if (seg.type === 'add') {
          return (
            <span key={key} className="bg-emerald-400/60">
              {seg.text}
            </span>
          );
        }
        return (
          <span key={key} className="bg-red-400/60 line-through">
            {seg.text}
          </span>
        );
      })}
    </>
  );
}

function VersionEntry({
  version: v,
  prev,
  isActive,
  globalExpanded,
  globalDiff,
  onRestore,
  onPublish,
  publishPending,
}: {
  version: Version;
  prev: Version | null;
  isActive: boolean;
  globalExpanded: boolean;
  globalDiff: boolean;
  onRestore: () => void;
  onPublish: () => void;
  publishPending: boolean;
}) {
  const [localOpen, setLocalOpen] = useState<boolean | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset local override when global toggle changes
  useEffect(() => setLocalOpen(null), [globalExpanded]);
  const open = localOpen ?? globalExpanded;

  return (
    <div className="min-w-0 flex-1">
      {/* Header row — clickable to expand, h-8 for consistent alignment */}
      <div className="flex h-8 items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setLocalOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="shrink-0 tabular-nums text-sm font-medium">v{v.versionNumber}</span>
          {v.changeMessage && <span className="truncate text-sm text-muted-foreground">{v.changeMessage}</span>}
        </button>
        {!isActive && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onRestore}>
              <PenLineIcon className="mr-1 size-3" />
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onPublish} disabled={publishPending}>
              Publish
            </Button>
          </div>
        )}
      </div>

      {/* Expandable content */}
      {open && (
        <div className="mt-2">
          <VersionContent version={v} prev={globalDiff ? prev : null} />
        </div>
      )}
    </div>
  );
}

function VersionContent({ version: v, prev }: { version: Version; prev: Version | null }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-2xs font-medium text-muted-foreground">Type</p>
        <p className="mt-0.5 text-xs">
          <DiffText value={v.type} prevValue={prev?.type} />
        </p>
      </div>
      <div>
        <p className="text-2xs font-medium text-muted-foreground">Score Range</p>
        <p className="mt-0.5 text-xs">
          <DiffText
            value={fmtVal(v.scoreRange, 'scoreRange') || '0 \u2013 1'}
            prevValue={prev ? fmtVal(prev.scoreRange, 'scoreRange') || '0 \u2013 1' : undefined}
          />
        </p>
      </div>
      {(v.description || prev?.description) && (
        <div>
          <p className="text-2xs font-medium text-muted-foreground">Description</p>
          <p className="mt-0.5 text-xs leading-relaxed">
            <DiffText value={v.description ?? ''} prevValue={prev?.description ?? undefined} />
          </p>
        </div>
      )}
      {(v.instructions || prev?.instructions) && (
        <div>
          <p className="text-2xs font-medium text-muted-foreground">Instructions</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            <DiffText value={v.instructions ?? ''} prevValue={prev?.instructions ?? undefined} />
          </p>
        </div>
      )}
      {(v.model || prev?.model) && (
        <div>
          <p className="text-2xs font-medium text-muted-foreground">Model</p>
          <p className="mt-0.5 text-xs">
            <DiffText
              value={fmtVal(v.model, 'model')}
              prevValue={prev ? fmtVal(prev.model, 'model') || undefined : undefined}
            />
          </p>
        </div>
      )}
    </div>
  );
}

function fmtVal(val: unknown, key?: string): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (key === 'scoreRange' && typeof val === 'object') {
    const r = val as { min?: number; max?: number };
    return `${r.min ?? 0} \u2013 ${r.max ?? 1}`;
  }
  return JSON.stringify(val);
}
