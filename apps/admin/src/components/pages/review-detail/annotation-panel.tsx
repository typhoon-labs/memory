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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useAuth,
} from '@typhoon/ui';
import { CheckIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type AnnotationTag, ISSUE_TAGS, type ReviewScore, SEVERITY_LEVELS, type Severity, TAG_LABELS } from './shared';

interface AnnotationPanelProps {
  threadId: string;
  messageId: string;
  annotations: ReviewScore[];
}

function AnnotationDisplay({
  annotation,
  onEdit,
  onDelete,
}: {
  annotation: ReviewScore;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const meta = annotation.metadata as {
    tags?: string[];
    severity?: string;
    annotatorId?: string;
    annotatorName?: string;
  } | null;
  const tags = (meta?.tags ?? []) as AnnotationTag[];
  const severity = meta?.severity as Severity | undefined;
  const annotatorName = meta?.annotatorName ?? '?';
  const initial = annotatorName.charAt(0).toUpperCase();
  const isCorrect = tags.includes('correct');

  const headerColor = isCorrect
    ? 'text-emerald-400'
    : severity === 'critical'
      ? 'text-red-400'
      : severity === 'major'
        ? 'text-orange-400'
        : 'text-amber-400';

  const headerText = isCorrect ? 'Correct' : severity ? `Has ${severity} issues` : 'Has issues';

  return (
    <div>
      {/* Bubble */}
      <div className="border-border rounded-lg border px-3 py-2.5 text-xs">
        {/* Header: verdict + actions */}
        <div className="flex items-center justify-between">
          <span className={`font-semibold ${headerColor}`}>{headerText}</span>
          {(onEdit || onDelete) && (
            <div className="flex gap-1.5">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                >
                  <PencilIcon className="size-3" />
                </button>
              )}
              {onDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete annotation?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently remove your annotation.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>
        {/* Issue tags list */}
        {tags.filter((t) => t !== 'correct').length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {tags
              .filter((t) => t !== 'correct')
              .map((tag) => (
                <li key={tag} className="text-foreground flex items-center gap-1.5">
                  <span className="bg-muted-foreground/40 size-1 shrink-0 rounded-full" />
                  {TAG_LABELS[tag] ?? tag}
                </li>
              ))}
          </ul>
        )}
        {/* Comment */}
        {annotation.reason && <p className="text-foreground mt-2">{annotation.reason}</p>}
      </div>
      {/* Arrow — rotated square overlapping bubble border, bg matches page */}
      <div className="border-border bg-background -mt-[5px] ml-[13px] size-2.5 rotate-45 border-r border-b" />
      {/* Avatar + name */}
      <div className="mt-2.5 flex items-center gap-1.5 pl-2">
        <div className="bg-muted text-muted-foreground ring-border flex size-5 shrink-0 items-center justify-center rounded-full text-[8px] font-medium ring-1">
          {initial}
        </div>
        <span className="text-2xs text-muted-foreground/70 font-medium">{annotatorName}</span>
      </div>
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

  const [step, setStep] = useState<'initial' | 'correct' | 'issues'>('initial');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTags, setSelectedTags] = useState<AnnotationTag[]>([]);
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    setStep('initial');
    setIsEditing(false);
    setSelectedTags(((myAnnotation?.metadata as Record<string, unknown> | null)?.tags as AnnotationTag[]) ?? []);
    setSeverity(((myAnnotation?.metadata as Record<string, unknown> | null)?.severity as Severity) ?? '');
    setComment(myAnnotation?.reason ?? '');
  }, [messageId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally reset form only on messageId change

  function startEdit() {
    const meta = myAnnotation?.metadata as Record<string, unknown> | null;
    const tags = (meta?.tags as AnnotationTag[]) ?? [];
    setSelectedTags(tags);
    setSeverity((meta?.severity as Severity) ?? '');
    setComment(myAnnotation?.reason ?? '');
    setStep(tags.includes('correct') ? 'correct' : 'issues');
    setIsEditing(true);
  }

  function toggleTag(tag: AnnotationTag) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const saveMutation = useMutation({
    mutationFn: async ({ method, tags }: { method: 'POST' | 'PATCH'; tags: AnnotationTag[] }) => {
      return apiFetch(`/api/v1/admin/reviews/${threadId}/messages/${messageId}/annotate`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags,
          ...(severity ? { severity } : {}),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reviews', threadId] });
      setIsEditing(false);
      setStep('initial');
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
      setStep('initial');
    },
  });

  function handleCorrect() {
    saveMutation.mutate({ method: myAnnotation ? 'PATCH' : 'POST', tags: ['correct'] });
  }

  function handleSubmitIssues() {
    saveMutation.mutate({ method: myAnnotation ? 'PATCH' : 'POST', tags: selectedTags });
  }

  const showForm = !myAnnotation || isEditing;

  return (
    <div className="space-y-3">
      {/* Other annotators' reviews */}
      {otherAnnotations.map((a) => (
        <AnnotationDisplay key={a.id} annotation={a} />
      ))}

      {/* Current user's annotation (read-only) */}
      {myAnnotation && !isEditing && (
        <AnnotationDisplay annotation={myAnnotation} onEdit={startEdit} onDelete={() => deleteMutation.mutate()} />
      )}

      {/* Annotation form — Yes/No always visible, details expand below */}
      {showForm && (
        <div className="space-y-3 text-xs">
          <p className="text-foreground/70">Is this response correct?</p>
          <div className="flex gap-1.5">
            <Button
              variant={step === 'correct' ? 'default' : 'outline'}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                if (step === 'correct') {
                  setStep('initial');
                } else {
                  setStep('correct');
                  setSelectedTags([]);
                  setSeverity('');
                  setComment('');
                }
              }}
            >
              <CheckIcon className="size-3" />
              Yes
            </Button>
            <Button
              variant={step === 'issues' ? 'default' : 'outline'}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                if (step === 'issues') {
                  setStep('initial');
                } else {
                  setStep('issues');
                  setSelectedTags([]);
                  setSeverity('');
                  setComment('');
                }
              }}
            >
              <XIcon className="size-3" />
              No
            </Button>
          </div>

          {/* Correct: comment + submit */}
          {step === 'correct' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-foreground/70">Any additional notes?</p>
                <Textarea
                  rows={2}
                  placeholder="Optional..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="text-xs md:text-xs"
                />
              </div>
              <div className="flex justify-end gap-1.5">
                {isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setIsEditing(false);
                      setStep('initial');
                    }}
                  >
                    Cancel
                  </Button>
                )}
                <Button size="sm" className="h-7 text-xs" disabled={saveMutation.isPending} onClick={handleCorrect}>
                  {saveMutation.isPending ? 'Saving...' : isEditing ? 'Update' : 'Submit'}
                </Button>
              </div>
              {saveMutation.isError && <p className="text-destructive">{saveMutation.error.message}</p>}
            </div>
          )}

          {/* Issues: tags + severity + comment + submit */}
          {step === 'issues' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-foreground/70">What issues are present?</p>
                {ISSUE_TAGS.map((tag) => {
                  const id = `annotation-tag-${tag}`;
                  return (
                    <label key={tag} htmlFor={id} className="flex cursor-pointer items-center gap-1.5">
                      <Checkbox id={id} checked={selectedTags.includes(tag)} onCheckedChange={() => toggleTag(tag)} />
                      {TAG_LABELS[tag]}
                    </label>
                  );
                })}
              </div>
              <div className="space-y-1.5">
                <p className="text-foreground/70">How severe is this?</p>
                <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                  <SelectTrigger size="sm" className="text-xs!">
                    <SelectValue placeholder="Select severity..." />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    {SEVERITY_LEVELS.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-foreground/70">Any additional notes?</p>
                <Textarea
                  rows={2}
                  placeholder="Optional..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="text-xs md:text-xs"
                />
              </div>
              <div className="flex justify-end gap-1.5">
                {isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setIsEditing(false);
                      setStep('initial');
                    }}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={selectedTags.length === 0 || saveMutation.isPending}
                  onClick={handleSubmitIssues}
                >
                  {saveMutation.isPending ? 'Saving...' : isEditing ? 'Update' : 'Submit'}
                </Button>
              </div>
              {saveMutation.isError && <p className="text-destructive">{saveMutation.error.message}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
