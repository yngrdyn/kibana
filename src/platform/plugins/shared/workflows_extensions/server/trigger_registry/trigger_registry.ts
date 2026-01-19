/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TriggerDefinition } from './types';

/**
 * Registry for workflow triggers.
 * Stores trigger definitions.
 */
export class TriggerRegistry {
  private readonly registry = new Map<string, TriggerDefinition>();

  /**
   * Register a trigger definition.
   * @param definition - The trigger definition to register
   * @throws Error if a trigger with the same ID is already registered
   */
  public registerTrigger(definition: TriggerDefinition): void {
    const triggerId = String(definition.id);
    if (this.registry.has(triggerId)) {
      throw new Error(
        `Trigger "${triggerId}" is already registered. Each trigger must have a unique identifier.`
      );
    }
    this.registry.set(triggerId, definition);
  }

  /**
   * Get a trigger definition for a given trigger ID.
   * @param triggerId - The trigger identifier
   * @returns The trigger definition, or undefined if not found
   */
  public getTrigger(triggerId: string): TriggerDefinition | undefined {
    return this.registry.get(triggerId);
  }

  /**
   * Check if a trigger is registered.
   * @param triggerId - The trigger identifier
   * @returns True if the trigger is registered, false otherwise
   */
  public hasTrigger(triggerId: string): boolean {
    return this.registry.has(triggerId);
  }

  /**
   * Get all registered trigger definitions.
   * @returns Array of registered trigger definitions
   */
  public getAllTriggers(): TriggerDefinition[] {
    return Array.from(this.registry.values());
  }
}
