import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  apiFetch,
  Button,
  Checkbox,
  SectionLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Textarea,
  useAuth,
} from '@typhoon/ui';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import {
  type AnnotationTag,
  ISSUE_TAGS,
  type ReviewScore,
  SEVERITY_LEVELS,
  SEVERITY_VARIANT_MAP,
  type Severity,
  TAG_LABELS,
} from './shared';

interface AnnotationPanelProps {
  threadId: string;
  messageId: string;
  annotations: ReviewScore[];
}

function AnnotationDisplay({ annotation }: { annotation: ReviewScore }) {
  const meta = annotation.metadata as { tags?: string[]; severity?: string; annotatorId?: string } | null;
  const tags = (meta?.tags ?? []) as AnnotationTag[];
  const severity = meta?.severity as Severity | undefined;

  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {tags.map((tag) => (
          <StatusBadge key={tag} variant={tag === 'correct' ? 'success' : 'error'}>
            {TAG_LABELS[tag] ?? tag}
          </StatusBadge>
        ))}
        {severity && (
          <StatusBadge variant={SEVERITY_VARIANT_MAP[severity]}>
            {severity.charAt(0).toUpperCase() + severity.slice(1)}
          </StatusBadge>
        )}
      </div>
      {annotation.reason && <p className="mt-1 text-muted-foreground">{annotation.reason}</p>}
    </div>
  );
}

export function AnnotationPanel({ threadId, messageId, annotations }: AnnotationPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const myAnnotation = annotations.find((a) => (a.metadata as Record<string, unknown> | null)?.annotatorId === userId);
  const otherAnnotations = annotations.filter(
    (a) => (a.metadata as Record<string, unknown> | null)?.annotatorId !== userId,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [selectedTags, setSelectedTags] = useState<AnnotationTag[]>(
    () => ((myAnnotation?.metadata as Record<string, unknown> | null)?.tags as AnnotationTag[]) ?? [],
  );
  const [severity, setSeverity] = useState<Severity | ''>(() => {
    const s = (myAnnotation?.metadata as Record<string, unknown> | null)?.severity as string | undefined;
    return (s as Severity) ?? '';
  });
  const [comment, setComment] = useState(() => myAnnotation?.reason ?? '');

  const showForm = !myAnnotation || isEditing;

  function toggleTag(tag: AnnotationTag) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const saveMutation = useMutation({
    mutationFn: async (method: 'POST' | 'PATCH') => {
      return apiFetch(`/api/v1/admin/reviews/${threadId}/messages/${messageId}/annotate`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: selectedTags,
          ...(severity ? { severity } : {}),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reviews', threadId] });
      setIsEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/admin/reviews/${threadId}/messages/${messageId}/annotate`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reviews', threadId] });
      setSelectedTags([]);
      setSeverity('');
      setComment('');
      setIsEditing(false);
    },
  });

  return (
    <div className="mt-2 space-y-2">
      {/* Other annotators' reviews */}
      {otherAnnotations.map((a) => (
        <AnnotationDisplay key={a.id} annotation={a} />
      ))}

      {/* Current user's annotation (read-only) */}
      {myAnnotation && !isEditing && (
        <div className="space-y-1">
          <AnnotationDisplay annotation={myAnnotation} />
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setIsEditing(true)}>
              <PencilIcon className="mr-1 size-3" />
              Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive">
                  <Trash2Icon className="mr-1 size-3" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete annotation?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently remove your annotation.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {/* Annotation form */}
      {showForm && (
        <div className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
          <SectionLabel>{myAnnotation ? 'Edit annotation' : 'Add annotation'}</SectionLabel>

          {/* Issue tags */}
          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-muted-foreground">Issues</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {ISSUE_TAGS.map((tag) => {
                const id = `annotation-tag-${tag}`;
                return (
                  <label key={tag} htmlFor={id} className="flex cursor-pointer items-center gap-1.5 text-xs">
                    <Checkbox id={id} checked={selectedTags.includes(tag)} onCheckedChange={() => toggleTag(tag)} />
                    {TAG_LABELS[tag]}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Quality tag */}
          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-muted-foreground">Quality</p>
            <label htmlFor="annotation-tag-correct" className="flex cursor-pointer items-center gap-1.5 text-xs">
              <Checkbox
                id="annotation-tag-correct"
                checked={selectedTags.includes('correct')}
                onCheckedChange={() => toggleTag('correct')}
              />
              {TAG_LABELS.correct}
            </label>
          </div>

          {/* Severity */}
          <Select value={severity} onValueChange={(v) => setSeverity(v as Severity | '')}>
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_LEVELS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Comment */}
          <Textarea
            rows={2}
            placeholder="Optional comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="text-xs"
          />

          {/* Actions */}
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={selectedTags.length === 0 || saveMutation.isPending}
              onClick={() => saveMutation.mutate(myAnnotation ? 'PATCH' : 'POST')}
            >
              {saveMutation.isPending ? 'Saving...' : myAnnotation ? 'Update' : 'Submit'}
            </Button>
            {isEditing && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            )}
            {saveMutation.isError && <span className="text-xs text-destructive">{saveMutation.error.message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
