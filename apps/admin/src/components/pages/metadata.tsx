import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@typhoon/ui';
import { apiFetch, Button, DataTable, EmptyState, LoadingSpinner, PageHeader } from '@typhoon/ui';
import { LayersIcon, PlusIcon, TagsIcon } from 'lucide-react';
import { usePageTitle } from '../../hooks/use-page-title';
import { FieldBadgePopover } from '../shared/field-badge-popover';
import { FieldGroupBadgePopover } from '../shared/field-group-badge-popover';
import type { MetadataSchema } from '../shared/field-schema-editor';

// =============================================================================
// Types
// =============================================================================

interface FieldGroup {
  id: string;
  name: string;
  description: string | null;
  fields: MetadataSchema;
  createdAt: string;
  updatedAt: string;
}

interface MetadataTemplate {
  id: string;
  name: string;
  description: string | null;
  fieldGroupIds: string[];
  customFields: MetadataSchema;
  effectiveSchema?: MetadataSchema;
  syncTargetCount?: number;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Shared column helpers
// =============================================================================

function fieldsCell(fields: MetadataSchema) {
  const entries = Object.entries(fields);
  if (entries.length === 0) return <span className="text-muted-foreground">{'\u2014'}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([name, field]) => (
        <FieldBadgePopover key={name} name={name} field={field} />
      ))}
    </div>
  );
}

// =============================================================================
// Field Groups Page
// =============================================================================

const groupColumns: ColumnDef<FieldGroup, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        {row.original.description && <div className="text-xs text-muted-foreground">{row.original.description}</div>}
      </div>
    ),
  },
  {
    id: 'fields',
    header: 'Fields',
    cell: ({ row }) => fieldsCell(row.original.fields),
  },
  {
    id: 'fieldCount',
    header: 'Count',
    cell: ({ row }) => (
      <span className="tabular-nums text-sm text-muted-foreground">{Object.keys(row.original.fields).length}</span>
    ),
  },
];

export function MetadataFieldGroupsPage() {
  usePageTitle('Field Groups');
  const navigate = useNavigate();

  const { data: groups, isLoading } = useQuery<FieldGroup[]>({
    queryKey: ['metadata-field-groups'],
    queryFn: () => apiFetch('/api/v1/metadata-field-groups'),
  });

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Metadata Field Groups"
          description="Reusable groups of metadata fields. Templates compose these groups."
          actions={
            <Button asChild>
              <Link to="/metadata/field-groups/create">
                <PlusIcon className="mr-2 size-4" />
                Create Group
              </Link>
            </Button>
          }
        />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && groups && groups.length > 0 && (
          <div className="mt-6">
            <DataTable
              data={groups}
              columns={groupColumns}
              enableSorting
              enableFiltering
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate({ to: '/metadata/field-groups/$groupId', params: { groupId: row.id } })}
              showRowCount
            />
          </div>
        )}

        {!isLoading && groups?.length === 0 && (
          <div className="mt-6">
            <EmptyState
              icon={<LayersIcon className="size-8" />}
              title="No field groups yet"
              description="Create a group to define reusable metadata fields."
            />
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Metadata Templates Page
// =============================================================================

export function MetadataTemplatesPage() {
  usePageTitle('Metadata Templates');
  const navigate = useNavigate();

  const { data: templates, isLoading } = useQuery<MetadataTemplate[]>({
    queryKey: ['metadata-templates'],
    queryFn: () => apiFetch('/api/v1/metadata-templates'),
  });

  const { data: groups = [] } = useQuery<FieldGroup[]>({
    queryKey: ['metadata-field-groups'],
    queryFn: () => apiFetch('/api/v1/metadata-field-groups'),
  });

  const templateColumns: ColumnDef<MetadataTemplate, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          {row.original.description && <div className="text-xs text-muted-foreground">{row.original.description}</div>}
        </div>
      ),
    },
    {
      id: 'groups',
      header: 'Groups',
      cell: ({ row }) => {
        if (row.original.fieldGroupIds.length === 0) {
          return <span className="text-muted-foreground">{'\u2014'}</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {row.original.fieldGroupIds.map((gid) => {
              const g = groups.find((gr) => gr.id === gid);
              if (!g) return null;
              return <FieldGroupBadgePopover key={gid} group={g} />;
            })}
          </div>
        );
      },
    },
    {
      id: 'effectiveFields',
      header: 'Effective Fields',
      cell: ({ row }) => {
        const schema = row.original.effectiveSchema;
        if (!schema || Object.keys(schema).length === 0) {
          return <span className="text-muted-foreground">{'\u2014'}</span>;
        }
        return fieldsCell(schema);
      },
    },
  ];

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Metadata Templates"
          description="Templates define what metadata fields are available for documents in a sync source."
          actions={
            <Button asChild>
              <Link to="/metadata/templates/create">
                <PlusIcon className="mr-2 size-4" />
                Create Template
              </Link>
            </Button>
          }
        />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && templates && templates.length > 0 && (
          <div className="mt-6">
            <DataTable
              data={templates}
              columns={templateColumns}
              enableSorting
              enableFiltering
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate({ to: '/metadata/templates/$templateId', params: { templateId: row.id } })}
              showRowCount
            />
          </div>
        )}

        {!isLoading && templates?.length === 0 && (
          <div className="mt-6">
            <EmptyState
              icon={<TagsIcon className="size-8" />}
              title="No templates yet"
              description="Create a template and assign it to a sync source."
            />
          </div>
        )}
      </div>
    </div>
  );
}
