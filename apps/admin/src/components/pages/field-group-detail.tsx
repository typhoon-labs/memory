import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
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
  Input,
  Label,
  LoadingSpinner,
  PageHeader,
  Separator,
  Textarea,
} from '@typhoon/ui';
import { AlertTriangleIcon, ChevronRightIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { detailTitle, usePageTitle } from '../../hooks/use-page-title';
import { FieldSchemaEditor, type MetadataSchema } from '../shared/field-schema-editor';

interface FieldGroup {
  id: string;
  name: string;
  description: string | null;
  fields: MetadataSchema;
  createdAt: string;
  updatedAt: string;
}

export function FieldGroupDetailPage() {
  const { groupId } = useParams({ strict: false }) as { groupId?: string };
  const isCreateMode = !groupId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<MetadataSchema>({});

  const { data: group, isLoading } = useQuery<FieldGroup>({
    queryKey: ['metadata-field-groups', groupId],
    queryFn: () => apiFetch(`/api/v1/metadata-field-groups/${groupId}`),
    enabled: !isCreateMode,
  });

  usePageTitle(isCreateMode ? 'Create Field Group' : detailTitle('Field Groups', group?.name));

  useEffect(() => {
    if (group) {
      setName(group.name);
      setDescription(group.description ?? '');
      setFields(group.fields);
    }
  }, [group]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>('/api/v1/metadata-field-groups', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, fields }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['metadata-field-groups'] });
      navigate({ to: '/metadata/field-groups/$groupId', params: { groupId: data.id } });
    },
  });

  const [affectedSyncTargetCount, setAffectedSyncTargetCount] = useState(0);

  const updateMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ affectedSyncTargetCount?: number }>(`/api/v1/metadata-field-groups/${groupId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, fields }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['metadata-field-groups'] });
      queryClient.invalidateQueries({ queryKey: ['metadata-field-groups', groupId] });
      setAffectedSyncTargetCount(data?.affectedSyncTargetCount ?? 0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/v1/metadata-field-groups/${groupId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata-field-groups'] });
      navigate({ to: '/metadata/field-groups' });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (isCreateMode) {
      createMutation.mutate();
    } else {
      updateMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const hasChanges = isCreateMode
    ? true
    : name.trim() !== (group?.name ?? '') ||
      (description.trim() || '') !== (group?.description ?? '') ||
      JSON.stringify(fields) !== JSON.stringify(group?.fields ?? {});

  if (!isCreateMode && isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <Link
                to="/metadata/field-groups"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Field Groups
              </Link>
              <ChevronRightIcon className="text-muted-foreground/50 size-3.5" />
              {isCreateMode ? 'Create' : (group?.name ?? '...')}
            </span>
          }
          actions={
            !isCreateMode ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Trash2Icon className="mr-1.5 size-3.5" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete field group?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete &ldquo;{group?.name}&rdquo; and remove it from all templates.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : undefined
          }
        />

        {updateMutation.isSuccess && affectedSyncTargetCount > 0 && (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangleIcon className="size-4 shrink-0" />
              <p>{affectedSyncTargetCount} sync source(s) affected. Run a sync to apply search index changes.</p>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold">Details</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">Basic information about this field group.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Region" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-description">Description (optional)</Label>
            <Textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this group is for"
              rows={2}
            />
          </div>

          <div className="pt-4">
            <h2 className="text-sm font-semibold">Fields</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">Define the metadata fields in this group.</p>
          </div>
          <FieldSchemaEditor fields={fields} onChange={setFields} />

          <Separator />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: '/metadata/field-groups' })}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!name.trim() || isPending || (!isCreateMode && !hasChanges)}>
              {isPending ? 'Saving...' : isCreateMode ? 'Create' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
