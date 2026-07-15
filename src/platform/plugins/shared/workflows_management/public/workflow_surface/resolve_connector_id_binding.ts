/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document } from 'yaml';
import { getConnectorActionTypeIdForEventTriggerId } from '../../common/inbound_webhook/connector_trigger_events';
import type { StepInfo, StepPropInfo } from '../entities/workflows/store';
import {
  getTriggerConnectorIdBlockIndex,
  getTriggerTypeAtIndex,
} from '../widgets/workflow_yaml_editor/lib/autocomplete/context/triggers_utils';
import { resolveConnectorIdStepType } from '../widgets/workflow_yaml_editor/lib/autocomplete/suggestions/connector_id/resolve_connector_id_step_type';
import type { ConnectorIdBinding } from './connector_id_binding';
import { resolveConnectorIdBindingFromStepType } from './connector_id_binding';

export interface ResolveConnectorIdBindingContext {
  readonly focusedStepInfo: StepInfo | null;
  readonly focusedYamlPair: StepPropInfo | null;
  readonly path: ReadonlyArray<string | number>;
  readonly yamlDocument?: Document | null;
}

/**
 * Resolves connector-id binding for trigger connector-event fields first, then step fields.
 */
export const resolveConnectorIdBinding = (
  context: ResolveConnectorIdBindingContext
): ConnectorIdBinding | undefined => {
  const triggerBlockIndex = getTriggerConnectorIdBlockIndex(context.path);
  if (triggerBlockIndex !== null && context.yamlDocument) {
    const triggerType = getTriggerTypeAtIndex(context.yamlDocument, triggerBlockIndex);
    const connectorTypeId = triggerType
      ? getConnectorActionTypeIdForEventTriggerId(triggerType)
      : undefined;
    if (connectorTypeId) {
      return {
        connectorTypeId,
        lookupKey: connectorTypeId.replace(/^\./, ''),
      };
    }
    return undefined;
  }

  const stepType = resolveConnectorIdStepType(
    context.focusedStepInfo,
    context.path,
    context.focusedYamlPair
  );
  if (!stepType) {
    return undefined;
  }

  return resolveConnectorIdBindingFromStepType(stepType);
};
