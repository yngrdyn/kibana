/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema as configSchema } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import { createSHA256Hash } from '@kbn/crypto';
import { stableStringify } from '@kbn/std';
import type { StabilityLevel } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import { type SchemaProperty, schemaToProperties } from './schema_properties';
import type { TriggerDocumentation, TriggerSnippets } from '../../common/trigger_registry/types';
import type { TriggerRegistry } from '../trigger_registry';
import type { ServerTriggerDefinition } from '../types';

const ROUTE_PATH = '/internal/workflows_extensions/trigger_definitions';

export interface TriggerDefinitionResponseItem {
  id: string;
  schemaHash: string;
  title?: string;
  description?: string;
  stability?: StabilityLevel;
  documentation?: TriggerDocumentation;
  snippets?: TriggerSnippets;
  eventPayload?: SchemaProperty[];
}

function eventSchemaToJsonSchema(eventSchema: z.ZodType): Record<string, unknown> | null {
  try {
    return z.toJSONSchema(eventSchema) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hashJsonSchema(jsonSchema: Record<string, unknown>): string {
  return createSHA256Hash(stableStringify(jsonSchema));
}

function toDocResponseItem(trigger: ServerTriggerDefinition): TriggerDefinitionResponseItem {
  const { id, title, description, stability, documentation, snippets, eventSchema } = trigger;
  const jsonSchema = eventSchemaToJsonSchema(eventSchema);
  const schemaHash = jsonSchema !== null ? hashJsonSchema(jsonSchema) : '';

  const item: TriggerDefinitionResponseItem = {
    id,
    schemaHash,
    title,
    description,
  };

  if (stability) {
    item.stability = stability;
  }
  if (documentation) {
    item.documentation = documentation;
  }
  if (snippets) {
    item.snippets = snippets;
  }

  const eventPayload = schemaToProperties(eventSchema);
  if (eventPayload !== null && eventPayload.length > 0) {
    item.eventPayload = eventPayload;
  }

  return item;
}

/**
 * Registers the route to get all registered trigger definitions.
 * Scout approval tests use the default response (`id` + `schemaHash`).
 * The workflow-trigger-docs generator calls with `?includeDocs=true` to read title,
 * event schema, and documentation from the server registry (icons are public-only).
 */
export function registerGetTriggerDefinitionsRoute(
  router: IRouter,
  registry: TriggerRegistry
): void {
  router.get(
    {
      path: ROUTE_PATH,
      options: {
        access: 'internal',
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route is used for testing purposes only. No sensitive data is exposed.',
        },
      },
      validate: {
        query: configSchema.object({
          includeDocs: configSchema.maybe(configSchema.boolean({ defaultValue: false })),
        }),
      },
    },
    async (_context, request, response) => {
      const includeDocs = request.query.includeDocs === true;
      const triggers = registry
        .list()
        .map((trigger) => {
          if (includeDocs) {
            return toDocResponseItem(trigger);
          }
          const jsonSchema = eventSchemaToJsonSchema(trigger.eventSchema);
          const schemaHash = jsonSchema !== null ? hashJsonSchema(jsonSchema) : '';
          return { id: trigger.id, schemaHash };
        })
        .sort((a, b) => a.id.localeCompare(b.id));

      return response.ok({ body: { triggers } });
    }
  );
}
