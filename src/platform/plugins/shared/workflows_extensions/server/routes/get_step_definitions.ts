/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema as configSchema } from '@kbn/config-schema';
import type { IRouter, Logger } from '@kbn/core/server';
import { createSHA256Hash } from '@kbn/crypto';
import { stableStringify } from '@kbn/std';
import type { StabilityLevel, StepDeprecationInfo, StepDocumentation } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import { type SchemaProperty, schemaToProperties } from './schema_properties';
import type { ServerStepRegistry } from '../step_registry';
import type { ServerStepDefinition } from '../step_registry/types';

const ROUTE_PATH = '/internal/workflows_extensions/step_definitions';

export type { SchemaProperty };

/**
 * Response shape for one step: id and definitionHash (for approval tests), plus optional
 * reference-doc fields from the server registry when `includeDocs=true`.
 * Icons are public-only and are not included.
 */
export interface StepDefinitionResponseItem {
  id: string;
  definitionHash: string;
  stepCategory?: string;
  label?: string;
  description?: string;
  stability?: StabilityLevel;
  deprecation?: StepDeprecationInfo;
  documentation?: StepDocumentation;
  input?: SchemaProperty[];
  config?: SchemaProperty[];
  output?: SchemaProperty[];
}

/**
 * Converts a zod schema to a stable JSON Schema representation for hashing.
 * Falls back to a deterministic marker so an unconvertible schema still
 * contributes to (and changes) the hash when it changes.
 */
function schemaToJson(schema?: z.ZodType): unknown {
  if (!schema) {
    return undefined;
  }
  return z.toJSONSchema(schema);
}

/**
 * Computes a hash over the serializable contract of a step definition: its
 * schemas (inputSchema/outputSchema/configSchema) and metadata. `id` is excluded
 * since it's the lookup key.
 */
function computeDefinitionHash(definition: ServerStepDefinition, logger: Logger): string {
  const {
    label,
    description,
    category,
    stability,
    deprecation,
    inputSchema,
    outputSchema,
    configSchema,
  } = definition;

  try {
    const canonical = {
      label,
      description,
      category,
      stability,
      deprecation,
      inputSchema: schemaToJson(inputSchema),
      outputSchema: schemaToJson(outputSchema),
      configSchema: schemaToJson(configSchema),
    };
    return createSHA256Hash(stableStringify(canonical));
  } catch (error) {
    logger.error(`Failed to compute definition hash for step ${definition.id}`, { error });
    return 'definition-hashing-error';
  }
}

function toDocResponseItem(
  definition: ServerStepDefinition,
  logger: Logger
): StepDefinitionResponseItem {
  const {
    id,
    label,
    description,
    category,
    stability,
    deprecation,
    documentation,
    inputSchema,
    outputSchema,
    configSchema,
  } = definition;

  const item: StepDefinitionResponseItem = {
    id,
    definitionHash: computeDefinitionHash(definition, logger),
    stepCategory: category,
    label,
    description,
  };

  if (stability) {
    item.stability = stability;
  }
  if (deprecation) {
    item.deprecation = deprecation;
  }
  if (documentation) {
    item.documentation = documentation;
  }

  const inputProps = schemaToProperties(inputSchema);
  if (inputProps !== null && inputProps.length > 0) {
    item.input = inputProps;
  }

  const configProps = configSchema ? schemaToProperties(configSchema) : null;
  if (configProps !== null && configProps.length > 0) {
    item.config = configProps;
  }

  const outputProps = outputSchema ? schemaToProperties(outputSchema) : null;
  if (outputProps !== null && outputProps.length > 0) {
    item.output = outputProps;
  }

  return item;
}

/**
 * Registers the route to get all registered step definitions.
 * Scout approval tests use the default response (`id` + `definitionHash`).
 * The workflow-step-docs generator calls with `?includeDocs=true` to read label,
 * schemas, and documentation from the server registry (icons are public-only).
 */
export function registerGetStepDefinitionsRoute(
  router: IRouter,
  registry: ServerStepRegistry,
  logger: Logger
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
      const allStepDefinitions = registry.getAll();
      const steps = allStepDefinitions
        .map((definition) => {
          if (includeDocs) {
            return toDocResponseItem(definition, logger);
          }
          return {
            id: definition.id,
            definitionHash: computeDefinitionHash(definition, logger),
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id));

      return response.ok({ body: { steps } });
    }
  );
}
