import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';
import { createMetadataTemplateSchema, updateMetadataTemplateSchema } from '@typhoon/types';

import { errorResponse } from '../lib/error-response';
import { requireAuth } from '../middleware/require-auth';
import { getMetadataService } from '../services';

export const metadataTemplateRoutes = [
  registerApiRoute('/v1/metadata-templates', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getMetadataService();
      const result = await svc.listTemplates();
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/metadata-templates', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getMetadataService();
      const body = createMetadataTemplateSchema.parse(await c.req.json());
      const result = await svc.createTemplate(body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(
        { ...(result.data.template as Record<string, unknown>), effectiveSchema: result.data.effectiveSchema },
        201,
      );
    },
  }),

  registerApiRoute('/v1/metadata-templates/:id', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getMetadataService();
      const result = await svc.getTemplate(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/metadata-templates/:id', {
    method: 'PATCH',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getMetadataService();
      const body = updateMetadataTemplateSchema.parse(await c.req.json());
      const result = await svc.updateTemplate(c.req.param('id'), body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/metadata-templates/:id', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getMetadataService();
      const result = await svc.deleteTemplate(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
