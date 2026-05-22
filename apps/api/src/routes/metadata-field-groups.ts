import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';
import { createMetadataFieldGroupSchema, updateMetadataFieldGroupSchema } from '@typhoon/types';

import { errorResponse } from '../lib/error-response';
import { requireAuth } from '../middleware/require-auth';
import { getMetadataService } from '../services';

export const metadataFieldGroupRoutes = [
  registerApiRoute('/v1/metadata-field-groups', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getMetadataService();
      const result = await svc.listFieldGroups();
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/metadata-field-groups', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getMetadataService();
      const body = createMetadataFieldGroupSchema.parse(await c.req.json());
      const result = await svc.createFieldGroup(body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data.group, 201);
    },
  }),

  registerApiRoute('/v1/metadata-field-groups/:id', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getMetadataService();
      const result = await svc.getFieldGroup(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/metadata-field-groups/:id', {
    method: 'PATCH',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getMetadataService();
      const body = updateMetadataFieldGroupSchema.parse(await c.req.json());
      const result = await svc.updateFieldGroup(c.req.param('id'), body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/metadata-field-groups/:id', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getMetadataService();
      const result = await svc.deleteFieldGroup(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
