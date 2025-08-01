/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializableRecord } from '@kbn/utility-types';
import { MigrateFunctionsObject } from '@kbn/kibana-utils-plugin/common';
import type { SavedObjectReference } from '@kbn/core/server';
import { DependencyList } from 'react';
import type { LocatorDependencies } from './locator';
import type {
  LocatorDefinition,
  LocatorPublic,
  ILocatorClient,
  LocatorData,
  LocatorGetUrlParams,
} from './types';
import { Locator } from './locator';
import { LocatorMigrationFunction, LocatorsMigrationMap, useLocatorUrl } from '.';

export type LocatorClientDependencies = LocatorDependencies;

export class LocatorClient implements ILocatorClient {
  /**
   * Collection of registered locators.
   */
  protected locators: Map<string, Locator<any>> = new Map();

  constructor(protected readonly deps: LocatorClientDependencies) {}

  /**
   * Creates and register a URL locator.
   *
   * @param definition A definition of URL locator.
   * @returns A public interface of URL locator.
   */
  public create<P extends SerializableRecord>(definition: LocatorDefinition<P>): LocatorPublic<P> {
    const locator = new Locator<P>(definition, this.deps);

    this.locators.set(definition.id, locator);

    return locator;
  }

  /**
   * Returns a previously registered URL locator.
   *
   * @param id ID of a URL locator.
   * @returns A public interface of a registered URL locator.
   */
  public get<P extends SerializableRecord>(id: string): undefined | LocatorPublic<P> {
    return this.locators.get(id);
  }

  public readonly useUrl = <P extends SerializableRecord>(
    params: () => { id: string; params: P },
    deps?: DependencyList,
    getUrlParams?: LocatorGetUrlParams
  ): string | undefined => {
    const { id, params: locatorParams } = params();
    const locator = this.get<P>(id);
    // if useLocatorUrl returns an empty string, we return undefined. This is done to make sure the consumer
    // checks whether the url has been resolved or not.
    return useLocatorUrl(locator, locatorParams, getUrlParams, deps) || undefined;
  };

  protected getOrThrow<P extends SerializableRecord>(id: string): LocatorPublic<P> {
    const locator = this.locators.get(id);
    if (!locator) throw new Error(`Locator [ID = "${id}"] is not registered.`);
    return locator;
  }

  public migrations(): { [locatorId: string]: MigrateFunctionsObject } {
    const migrations: { [locatorId: string]: MigrateFunctionsObject } = {};

    for (const locator of this.locators.values()) {
      migrations[locator.id] =
        typeof locator.migrations === 'function' ? locator.migrations() : locator.migrations;
    }

    return migrations;
  }

  // PersistableStateService<LocatorData> ----------------------------------------------------------

  public telemetry(
    state: LocatorData,
    collector: Record<string, unknown>
  ): Record<string, unknown> {
    for (const locator of this.locators.values()) {
      collector = locator.telemetry(state.state, collector);
    }

    return collector;
  }

  public inject(state: LocatorData, references: SavedObjectReference[]): LocatorData {
    const locator = this.getOrThrow(state.id);
    const filteredReferences = references
      .filter((ref) => ref.name.startsWith('params:'))
      .map((ref) => ({
        ...ref,
        name: ref.name.substr('params:'.length),
      }));
    return {
      ...state,
      state: locator.inject(state.state, filteredReferences),
    };
  }

  public extract(state: LocatorData): { state: LocatorData; references: SavedObjectReference[] } {
    const locator = this.getOrThrow(state.id);
    const extracted = locator.extract(state.state);
    return {
      state: {
        ...state,
        state: extracted.state,
      },
      references: extracted.references.map((ref) => ({
        ...ref,
        name: 'params:' + ref.name,
      })),
    };
  }

  public readonly getAllMigrations = (): LocatorsMigrationMap => {
    const locatorParamsMigrations = this.migrations();
    const locatorMigrations: LocatorsMigrationMap = {};
    const versions = new Set<string>();

    for (const migrationMap of Object.values(locatorParamsMigrations))
      for (const version of Object.keys(migrationMap)) versions.add(version);

    for (const version of versions.values()) {
      const migration: LocatorMigrationFunction = (locator) => {
        const locatorMigrationsMap = locatorParamsMigrations[locator.id];
        if (!locatorMigrationsMap) return locator;

        const migrationFunction = locatorMigrationsMap[version];
        if (!migrationFunction) return locator;

        return {
          ...locator,
          version,
          state: migrationFunction(locator.state),
        };
      };

      locatorMigrations[version] = migration;
    }

    return locatorMigrations;
  };
}
