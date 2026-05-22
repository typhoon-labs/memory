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
  Checkbox,
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
import { FieldBadgePopover } from '../shared/field-badge-popover';
import { FieldSchemaEditor, type MetadataSchema } from '../shared/field-schema-editor';

interface FieldGroup {
  id: string;
  name: string;
  description: string | null;
  fields: MetadataSchema;
}

interface MetadataTemplate {
  id: string;
  name: string;
  description: string | null;
  fieldGroupIds: string[];
  customFields: MetadataSchema;
  effectiveSchema?: MetadataSchema;
  createdAt: string;
  updatedAt: string;
}

export function MetadataTemplateDetailPage() {
  const { templateId } = useParams({ strict: false }) as { templateId?: string };
  const isCreateMode = !templateId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<MetadataSchema>({});

  const { data: template, isLoading: templateLoading } = useQuery<MetadataTemplate>({
    queryKey: ['metadata-templates', templateId],
    queryFn: () => apiFetch(`/api/v1/metadata-templates/${templateId}`),
    enabled: !isCreateMode,
  });

  const { data: groups = [] } = useQuery<FieldGroup[]>({
    queryKey: ['metadata-field-groups'],
    queryFn: () => apiFetch('/api/v1/metadata-field-groups'),
  });

  usePageTitle(isCreateMode ? 'Create Template' : detailTitle('Templates', template?.name));

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description ?? '');
      setSelectedGroupIds(template.fieldGroupIds);
      setCustomFields(template.customFields);
    }
  }, [template]);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>('/api/v1/metadata-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          fieldGroupIds: selectedGroupIds,
          customFields,
        }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['metadata-templates'] });
      navigate({ to: '/metadata/templates/$templateId', params: { templateId: data.id } });
    },
  });

  const [affectedSyncTargetCount, setAffectedSyncTargetCount] = useState(0);

  const updateMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ syncTargetCount?: number }>(`/api/v1/metadata-templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          fieldGroupIds: selectedGroupIds,
          customFields,
        }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['metadata-templates'] });
      queryClient.invalidateQueries({ queryKey: ['metadata-templates', templateId] });
      setAffectedSyncTargetCount(data?.syncTargetCount ?? 0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/v1/metadata-templates/${templateId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metadata-templates'] });
      navigate({ to: '/metadata/templates' });
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
    : name.trim() !== (template?.name ?? '') ||
      (description.trim() || '') !== (template?.description ?? '') ||
      JSON.stringify(selectedGroupIds) !== JSON.stringify(template?.fieldGroupIds ?? []) ||
      JSON.stringify(customFields) !== JSON.stringify(template?.customFields ?? {});

  if (!isCreateMode && templateLoading) {
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
              <Link to="/metadata/templates" className="text-muted-foreground hover:text-foreground transition-colors">
                Templates
              </Link>
              <ChevronRightIcon className="text-muted-foreground/50 size-3.5" />
              {isCreateMode ? 'Create' : (template?.name ?? '...')}
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
                    <AlertDialogTitle>Delete template?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete &ldquo;{template?.name}&rdquo;.
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
            <p className="text-muted-foreground mt-0.5 text-sm">Basic information about this template.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. US Legal Docs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-description">Description (optional)</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this template is for"
              rows={2}
            />
          </div>

          <div className="pt-4">
            <h2 className="text-sm font-semibold">Field Groups</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">Include fields from existing groups.</p>
          </div>
          {groups.length === 0 ? (
            <p className="text-muted-foreground text-sm">No field groups exist yet. Create one first.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.id} className="flex items-start gap-3">
                  <div className="flex h-5 items-center">
                    <Checkbox
                      id={`group-${group.id}`}
                      checked={selectedGroupIds.includes(group.id)}
                      onCheckedChange={() => toggleGroup(group.id)}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`group-${group.id}`} className="cursor-pointer leading-5">
                      {group.name}
                    </Label>
                    {group.description && <p className="text-muted-foreground mt-0.5 text-sm">{group.description}</p>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(group.fields).map(([f, def]) => (
                        <FieldBadgePopover key={f} name={f} field={def} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4">
            <h2 className="text-sm font-semibold">Custom Fields</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">Additional fields specific to this template.</p>
          </div>
          <FieldSchemaEditor fields={customFields} onChange={setCustomFields} />

          <Separator />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: '/metadata/templates' })}>
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
