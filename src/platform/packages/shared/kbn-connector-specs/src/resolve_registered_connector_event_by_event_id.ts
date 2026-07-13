/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as connectorsSpecs from './all_specs';
import type { RegisteredConnectorEvent } from './connector_spec_events';
import { toRegisteredConnectorEvent } from './to_registered_connector_event';

export const resolveRegisteredConnectorEventByEventId = (
  eventId: string
): RegisteredConnectorEvent | undefined => {
  for (const spec of Object.values(connectorsSpecs)) {
    const definitions = spec.events?.definitions;
    if (!definitions) {
      continue;
    }

    for (const [eventKey, definition] of Object.entries(definitions)) {
      if (definition.eventId === eventId) {
        return toRegisteredConnectorEvent(spec.metadata, eventKey, definition);
      }
    }
  }

  return undefined;
};
