import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { metadataApi } from './metadata.api';

/** TanStack Query option factories for metadata field groups and templates. */
export const metadataQueries = {
  /** List all field groups. */
  fieldGroups: () =>
    queryOptions({
      queryKey: queryKeys.metadata.fieldGroups(),
      queryFn: () => metadataApi.listFieldGroups(),
    }),

  /** Single field group detail. */
  fieldGroup: (id: string) =>
    queryOptions({
      queryKey: queryKeys.metadata.fieldGroup(id),
      queryFn: () => metadataApi.getFieldGroup(id),
      enabled: !!id,
    }),

  /** List all metadata templates. */
  templates: () =>
    queryOptions({
      queryKey: queryKeys.metadata.templates(),
      queryFn: () => metadataApi.listTemplates(),
    }),

  /** Single template detail. */
  template: (id: string) =>
    queryOptions({
      queryKey: queryKeys.metadata.template(id),
      queryFn: () => metadataApi.getTemplate(id),
      enabled: !!id,
    }),
};
