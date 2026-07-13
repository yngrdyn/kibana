/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getConnectorIdSuggestionsItems } from './get_connector_id_suggestions_items';
import { resolveConnectorIdActionTypeId } from '../../../../../../workflow_surface/connector_id_provider';
import type { AutocompleteContext } from '../../context/autocomplete.types';

export function getConnectorIdSuggestions({
  line,
  lineParseResult,
  range,
  focusedStepInfo,
  focusedYamlPair,
  path,
  yamlDocument,
  dynamicConnectorTypes,
}: AutocompleteContext) {
  const connectorActionTypeId = resolveConnectorIdActionTypeId({
    yamlDocument,
    path,
    focusedStepInfo,
    focusedYamlPair,
  });

  if (
    !connectorActionTypeId ||
    !lineParseResult ||
    lineParseResult.matchType !== 'connector-id' ||
    !dynamicConnectorTypes
  ) {
    return [];
  }

  // If the user has typed part of the connector-id, we replace from the start of the value to the end of the line
  if (lineParseResult.fullKey !== '') {
    const replaceRange = {
      ...range,
      startColumn: lineParseResult.valueStartIndex + 1,
      endColumn: line.length + 1,
    };
    return getConnectorIdSuggestionsItems(
      connectorActionTypeId,
      replaceRange,
      dynamicConnectorTypes
    );
  }

  return getConnectorIdSuggestionsItems(connectorActionTypeId, range, dynamicConnectorTypes);
}
