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
 * Registry for public-side workflow trigger definitions.
 * Stores UI-related information for trigger types.
 */
export class PublicTriggerRegistry {
  private readonly registry = new Map<string, TriggerDefinition>();

  /**
   * Register trigger definition.
   * @param definition - The trigger definition to register
   * @throws Error if definition for the same trigger ID is already registered
   */
  public register(definition: TriggerDefinition): void {
    const triggerId = String(definition.id);
    if (this.registry.has(triggerId)) {
      throw new Error(
        `Trigger definition for type "${triggerId}" is already registered. Each trigger type must have unique definition.`
      );
    }
    this.registry.set(triggerId, definition);
  }

  /**
   * Get definition for a specific trigger type.
   * @param triggerId - The trigger type identifier
   * @returns The trigger definition, or undefined if not found
   */
  public get(triggerId: string): TriggerDefinition | undefined {
    return this.registry.get(triggerId);
  }

  /**
   * Check if definition for a trigger type is registered.
   * @param triggerId - The trigger type identifier
   * @returns True if definition for the trigger type is registered, false otherwise
   */
  public has(triggerId: string): boolean {
    return this.registry.has(triggerId);
  }

  /**
   * Get all registered trigger definitions.
   * @returns Array of all registered trigger definitions
   */
  public getAll(): TriggerDefinition[] {
    return Array.from(this.registry.values());
  }
}
