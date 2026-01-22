/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import { WorkflowContextSchema } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import { inferZodType } from '../../../../common/lib/zod';
import { stepSchemas } from '../../../../common/step_schemas';

/**
 * Built-in trigger types that are not event-driven.
 * Event-driven triggers are any trigger type that is NOT in this list.
 */
const BUILT_IN_TRIGGER_TYPES = new Set(['alert', 'scheduled', 'manual']);

/**
 * Check if a trigger type is event-driven (not a built-in trigger).
 */
function isEventDrivenTrigger(triggerType: string): boolean {
  return !BUILT_IN_TRIGGER_TYPES.has(triggerType);
}

/**
 * Get the event schema for a trigger type.
 * The event schema is just the payload schema defined by the trigger.
 */
function getEventSchemaForTrigger(triggerType: string | undefined): z.ZodType | null {
  // If trigger type is event-driven, get its event schema
  if (triggerType && isEventDrivenTrigger(triggerType)) {
    const registeredTriggers = stepSchemas.getAllRegisteredTriggers();
    const trigger = registeredTriggers.find((t) => t.id === triggerType);
    
    if (trigger && trigger.eventSchema) {
      // Return the trigger's event schema directly (this is the payload schema)
      return trigger.eventSchema;
    }
  }

  return null;
}

export function getWorkflowContextSchema(definition: WorkflowYaml) {
  // Check if workflow has an "alert" trigger type
  const hasAlertTrigger = definition.triggers?.some((trigger) => trigger.type === 'alert');
  
  // Extract ALL unique event-driven trigger types from workflow definition
  const eventDrivenTriggerTypes = new Set(
    definition.triggers
      ?.filter((trigger) => isEventDrivenTrigger(trigger.type))
      .map((trigger) => trigger.type) ?? []
  );

  // Get the event schema for each unique event-driven trigger type
  const eventDrivenTriggerSchemas: z.ZodType[] = [];
  for (const triggerType of eventDrivenTriggerTypes) {
    const triggerEventSchema = getEventSchemaForTrigger(triggerType);
    if (triggerEventSchema) {
      eventDrivenTriggerSchemas.push(triggerEventSchema);
    }
  }

  // Define AlertingEventSchema
  const AlertSchema = z.object({
    _id: z.string(),
    _index: z.string(),
    kibana: z.object({
      alert: z.any(),
    }),
    '@timestamp': z.string(),
  });

  const RuleSchema = z.object({
    id: z.string(),
    name: z.string(),
    tags: z.array(z.string()),
    consumer: z.string(),
    producer: z.string(),
    ruleTypeId: z.string(),
  });

  const AlertingEventSchema = z.object({
    alerts: z.array(z.union([AlertSchema, z.any()])),
    rule: RuleSchema,
    spaceId: z.string(),
    params: z.any(),
  });

  // Build union of all available event schemas
  // Include AlertingEventSchema if alert trigger is present
  // Include all event-driven trigger schemas (one per trigger type)
  // Include fallback for other cases
  const eventSchemaOptions: z.ZodType[] = [];
  
  if (hasAlertTrigger) {
    eventSchemaOptions.push(AlertingEventSchema);
  }
  
  eventSchemaOptions.push(...eventDrivenTriggerSchemas);
  
  // Fallback to allow any object structure for future event types or dynamic properties
  eventSchemaOptions.push(z.record(z.string(), z.any()));

  // Create union schema with all available event schemas
  const dynamicEventSchema = z.union(eventSchemaOptions);

  return WorkflowContextSchema.extend({
    // Override event schema with dynamic schema based on trigger types
    event: dynamicEventSchema.optional(),
    // transform an array of inputs to an object
    // with the input name as the key and the defined type as the value
    inputs: z.object({
      ...Object.fromEntries(
        (definition.inputs || []).map((input) => {
          let valueSchema: z.ZodType;
          switch (input.type) {
            case 'string':
              valueSchema = z.string();
              break;
            case 'number':
              valueSchema = z.number();
              break;
            case 'boolean':
              valueSchema = z.boolean();
              break;
            case 'choice':
              const opts = input.options ?? [];
              valueSchema = z.any();
              if (opts.length > 0) {
                const literals = opts.map((o) => z.literal(o));
                valueSchema = z.union(literals);
              }
              break;
            case 'array': {
              // Create a union of all possible array types to show comprehensive type information
              // This allows the type description to show "string[] | number[] | boolean[]"
              const arraySchemas = [z.array(z.string()), z.array(z.number()), z.array(z.boolean())];
              const { minItems, maxItems } = input;
              const applyConstraints = (
                schema: z.ZodArray<z.ZodString | z.ZodNumber | z.ZodBoolean>
              ) => {
                let s = schema;
                if (minItems != null) s = s.min(minItems);
                if (maxItems != null) s = s.max(maxItems);
                return s;
              };
              valueSchema = z.union(
                arraySchemas.map(applyConstraints) as [
                  z.ZodArray<z.ZodString>,
                  z.ZodArray<z.ZodNumber>,
                  z.ZodArray<z.ZodBoolean>
                ]
              );
              break;
            }
            default:
              valueSchema = z.any();
              break;
          }
          if (input.default) {
            valueSchema = valueSchema.default(input.default);
          }
          return [input.name, valueSchema];
        })
      ),
    }),
    // transform an object of consts to an object
    // with the const name as the key and inferred type as the value
    consts: z.object({
      ...Object.fromEntries(
        Object.entries(definition.consts ?? {}).map(([key, value]) => [
          key,
          inferZodType(value, { isConst: true }),
        ])
      ),
    }),
  });
}
