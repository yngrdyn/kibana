/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License v 1".
 */

import { monaco } from '@kbn/monaco';
import { extractSchemaPropertyPaths } from '@kbn/workflows/common/utils/extract_schema_property_paths/extract_schema_property_paths';
import { stepSchemas } from '../../../../../../../common/step_schemas';
import type { TriggerDefinition } from '@kbn/workflows-extensions/public';
import type { Document } from 'yaml';
import { getPathAtOffset } from '../../../../../../../common/lib/yaml';
import { isMap, isPair, isScalar, isSeq } from 'yaml';

/**
 * Extract trigger type from a trigger node
 */
function extractTriggerType(triggerNode: any): string | null {
  if (isMap(triggerNode)) {
    // Find the 'type' pair in the map
    for (const item of triggerNode.items || []) {
      if (isPair(item) && isScalar(item.key) && item.key.value === 'type') {
        if (isScalar(item.value)) {
          return String(item.value.value);
        }
      }
    }
  } else if (triggerNode && typeof triggerNode === 'object' && 'type' in triggerNode) {
    // Plain object (already parsed)
    return String(triggerNode.type);
  }
  return null;
}

/**
 * Get the trigger type for the trigger that contains the where clause at the given position
 */
function getTriggerTypeForWhereClause(
  yamlDocument: Document,
  absoluteOffset: number
): string | null {
  try {
    // Get the path at the cursor position
    // For a where clause, the path should be like: ['triggers', 0, 'where']
    // But when cursor is inside the string value, path might be different
    const path = getPathAtOffset(yamlDocument, absoluteOffset);
    
    // Check if we're in a trigger's where clause
    // Path should be: ['triggers', index, 'where'] or ['triggers', index]
    // Or when inside string value, might be ['triggers', index, 'where', 'value'] or similar
    if (path.length < 2 || path[0] !== 'triggers') {
      // Alternative: Try to find which trigger contains the cursor by checking all triggers
      // triggers is a sequence (array), not a map
      const triggersNode = yamlDocument.getIn(['triggers'], true);
      if (!triggersNode || !isSeq(triggersNode)) {
        console.log('[getTriggerTypeForWhereClause] Triggers node not found or not a sequence');
        return null;
      }
      
      // Iterate through all triggers to find one that has a 'where' clause
      // When path is empty, we'll use a more lenient approach:
      // 1. First try to find a trigger where the offset is within the where value's range
      // 2. If that fails, find any trigger with a 'where' clause (fallback)
      let bestMatch: { triggerType: string; index: number; distance: number } | null = null;
      
      for (let i = 0; i < triggersNode.items.length; i++) {
        const triggerNode = triggersNode.items[i];
        
        if (triggerNode && isMap(triggerNode)) {
          const triggerType = extractTriggerType(triggerNode);
          if (!triggerType || ['alert', 'scheduled', 'manual'].includes(triggerType)) {
            continue; // Skip built-in triggers
          }
          
          // Check if this trigger has a 'where' key
          for (const item of triggerNode.items || []) {
            if (isPair(item) && isScalar(item.key) && item.key.value === 'where') {
              const whereValue = item.value;
              
              // Check if cursor is within the where value's range
              if (whereValue && isScalar(whereValue) && whereValue.range) {
                const [whereStart, , whereEnd] = whereValue.range;
                if (absoluteOffset >= whereStart && absoluteOffset <= whereEnd) {
                  // Cursor is within this trigger's where clause - perfect match!
                  return triggerType;
                }
                
                // Track the closest trigger (smallest distance to where clause)
                const distance = absoluteOffset < whereStart 
                  ? whereStart - absoluteOffset 
                  : absoluteOffset > whereEnd 
                    ? absoluteOffset - whereEnd 
                    : 0;
                
                if (!bestMatch || distance < bestMatch.distance) {
                  bestMatch = { triggerType, index: i, distance };
                }
              } else {
                // Where value exists but no range info - still a candidate
                if (!bestMatch) {
                  bestMatch = { triggerType, index: i, distance: Infinity };
                }
              }
            }
          }
        }
      }
      
      // If we found a trigger (even if offset wasn't exactly in range), use it
      if (bestMatch) {
        return bestMatch.triggerType;
      }
      
      return null;
    }

    // Get the trigger index
    const triggerIndex = typeof path[1] === 'number' ? path[1] : null;
    if (triggerIndex === null) {
      return null;
    }

    // Get the trigger node at the specified index
    // Build path to the trigger: ['triggers', triggerIndex]
    const triggerPath = ['triggers', triggerIndex];
    const triggerNode = yamlDocument.getIn(triggerPath, true);
    
    if (!triggerNode) {
      return null;
    }

    // Extract the type from the trigger node
    const triggerType = extractTriggerType(triggerNode);
    
    if (!triggerType || typeof triggerType !== 'string') {
      return null;
    }

    // Check if it's an event-driven trigger (not built-in)
    const builtInTypes = ['alert', 'scheduled', 'manual'];
    if (builtInTypes.includes(triggerType)) {
      return null;
    }

    return triggerType;
  } catch (error) {
    // Log error for debugging
    console.error('[getTriggerTypeForWhereClause] Error:', error);
    return null;
  }
}

/**
 * Get suggestions for where clause based on the trigger's event schema
 */
export function getWhereClauseSuggestions(
  range: monaco.IRange,
  queryPrefix: string,
  yamlDocument: Document,
  absoluteOffset: number,
  needsClosingQuote: boolean = false
): monaco.languages.CompletionItem[] {
  const suggestions: monaco.languages.CompletionItem[] = [];

  // Get the trigger type for this where clause
  const triggerType = getTriggerTypeForWhereClause(yamlDocument, absoluteOffset);
  if (!triggerType) {
    return suggestions;
  }

  // Get the trigger's event schema
  const registeredTriggers = stepSchemas.getAllRegisteredTriggers();
  const trigger = registeredTriggers.find((t: TriggerDefinition) => t.id === triggerType);

  if (!trigger || !trigger.eventSchema) {
    return suggestions;
  }

  // Extract property paths from the event schema
  const propertyPaths = extractSchemaPropertyPaths(trigger.eventSchema);

  // Parse the query prefix to understand what we're suggesting
  // Note: queryPrefix may have trailing spaces from the original YAML value
  const trimmedPrefix = queryPrefix.trim();
  const tokens = trimmedPrefix.split(/\s+/).filter((t) => t.length > 0);
  const lastToken = tokens[tokens.length - 1] || '';
  const isEmpty = trimmedPrefix === '';
  
  // Check if the value is already quoted (from the original line, not the cleaned queryPrefix)
  // We need to check the original queryPrefix before quote removal
  // Prefer single quotes for where clause to allow double quotes inside KQL string values
  const isQuoted = queryPrefix.trim().startsWith("'") || queryPrefix.trim().startsWith('"');
  const needsQuoting = !isQuoted && (trimmedPrefix.includes(':') || trimmedPrefix.includes(' ') || isEmpty);

  // Determine context: are we typing a field name, operator, or value?
  // Check if last token looks like a field name (alphanumeric with dots, possibly with colon)
  const fieldNamePattern = /^[a-zA-Z_][a-zA-Z0-9_.]*:?\s*$/;
  const isTypingFieldName = fieldNamePattern.test(lastToken);
  
  // Check if queryPrefix has trailing space (user just typed space)
  // This is a strong indicator that we should show suggestions
  const hasTrailingSpace = queryPrefix.trim() !== queryPrefix && queryPrefix.endsWith(' ');
  
  // Check if we're after a complete field:value pair
  // This happens when the query ends with a field:value pattern
  const hasCompleteFieldValuePair = (() => {
    if (isEmpty) return false;
    
    // PRIORITY CHECK: If we have trailing space, check if there's a complete pair BEFORE the space
    // This is the most common case: user types "event.workflowId:value " and expects suggestions
    if (hasTrailingSpace) {
      // trimmedPrefix already has the space removed, so check if it ends with a complete pair
      const completePairBeforeSpace = /event\.\w+(?:\.\w+)*\s*:\s*[^\s"']+$/.test(trimmedPrefix) ||
                                     /event\.\w+(?:\.\w+)*\s*:\s*"(?:[^"\\]|\\.)*"$/.test(trimmedPrefix) ||
                                     /event\.\w+(?:\.\w+)*\s*:\s*'(?:[^'\\]|\\.)*'$/.test(trimmedPrefix);
      if (completePairBeforeSpace) {
        return true;
      }
    }
    
    // EARLY CHECK: Simple pattern match for event.field:value at the end
    // This is the most common case and should be caught first
    // Matches: event.workflowId:value, event.executionId:"value", etc.
    if (/event\.\w+(?:\.\w+)*\s*:\s*[^\s"']+$/.test(trimmedPrefix)) {
      return true;
    }
    
    // PRIMARY CHECK: Pattern to match complete field:value pairs
    // event.field:"value" or event.field:'value' or event.field:value
    const completeQuotedPattern = /event\.\w+(?:\.\w+)*\s*:\s*"(?:[^"\\]|\\.)*"$/;
    const completeSingleQuotedPattern = /event\.\w+(?:\.\w+)*\s*:\s*'(?:[^'\\]|\\.)*'$/;
    const completeUnquotedPattern = /event\.\w+(?:\.\w+)*\s*:\s*[^\s"']+$/;
    
    // Check if trimmed prefix ends with a complete field:value pair
    const hasCompletePattern = completeQuotedPattern.test(trimmedPrefix) || 
                               completeSingleQuotedPattern.test(trimmedPrefix) || 
                               completeUnquotedPattern.test(trimmedPrefix);
    
    if (hasCompletePattern) {
      return true;
    }
    
    // AGGRESSIVE CHECK: If the query contains event.field:value pattern (even if not at the very end),
    // and there's no operator after it, consider it complete
    // This handles cases where cursor is right before closing quote: 'event.workflowId:value|'
    const fieldValuePattern = /event\.\w+(?:\.\w+)*\s*:\s*[^\s"']+/;
    if (fieldValuePattern.test(trimmedPrefix)) {
      // Extract the part after the last field:value pattern
      const lastFieldValueMatch = trimmedPrefix.match(/(event\.\w+(?:\.\w+)*\s*:\s*[^\s"']+)(.*)$/);
      if (lastFieldValueMatch && lastFieldValueMatch[2]) {
        const afterPair = lastFieldValueMatch[2].trim();
        // If there's nothing after the pair (or only whitespace), it's complete
        if (afterPair === '' || /^\s*(and|or|not)\s*$/i.test(afterPair)) {
          return true;
        }
      } else {
        // No match means the pattern is at the end, so it's complete
        return true;
      }
    }
    
    // If we have trailing space, be more lenient - check if there's a complete pattern before the space
    if (hasTrailingSpace) {
      // The trimmedPrefix already has the space removed, so check if it matches a pattern
      if (hasCompletePattern) {
        return true;
      }
      
      // SIMPLIFIED: If we have trailing space and the query contains event.field:value pattern, it's complete
      // This catches: event.executionId:value (with trailing space)
      const hasFieldValuePattern = /event\.\w+(?:\.\w+)*\s*:\s*/.test(trimmedPrefix);
      if (hasFieldValuePattern) {
        // Extract what comes after the colon
        const colonMatch = trimmedPrefix.match(/event\.\w+(?:\.\w+)*\s*:\s*(.+)$/);
        if (colonMatch && colonMatch[1]) {
          const valuePart = colonMatch[1];
          // If value part exists and doesn't contain spaces (or is properly quoted), it's complete
          // This handles: event.field:value, event.field:"value", event.field:'value'
          if (valuePart.length > 0) {
            // Check if it's a quoted value (properly closed)
            if ((valuePart.startsWith('"') && valuePart.endsWith('"')) ||
                (valuePart.startsWith("'") && valuePart.endsWith("'"))) {
              return true; // Complete quoted value
            }
            // Or if it's an unquoted value (no spaces, no quotes)
            if (!valuePart.includes(' ') && !valuePart.includes('"') && !valuePart.includes("'")) {
              return true; // Complete unquoted value
            }
          }
        }
      }
    }
    
    // Check the last token if it's a complete pair
    if (tokens.length > 0) {
      const lastTokenValue = tokens[tokens.length - 1];
      if (lastTokenValue && lastTokenValue.includes(':')) {
        // Check if last token matches a complete field:value pattern
        if (/^event\.\w+(?:\.\w+)*\s*:\s*"(?:[^"\\]|\\.)*"$/.test(lastTokenValue) ||
            /^event\.\w+(?:\.\w+)*\s*:\s*'(?:[^'\\]|\\.)*'$/.test(lastTokenValue) ||
            /^event\.\w+(?:\.\w+)*\s*:\s*[^\s"']+$/.test(lastTokenValue)) {
          return true;
        }
      }
    }
    
    // Final fallback: if query contains event.field:"value" or event.field:value pattern, assume complete
    // This catches cases where the pattern exists but regex didn't match exactly
    if (trimmedPrefix.includes(':') && trimmedPrefix.includes('event.')) {
      // Check if there's a field:quoted value pattern
      const fieldValueMatch = trimmedPrefix.match(/event\.\w+(?:\.\w+)*\s*:\s*(["'])([^"']*)\1/);
      if (fieldValueMatch) {
        // Found a complete quoted value
        return true;
      }
      
      // Check for unquoted value (must be at the end and not contain spaces)
      // This is more lenient - matches any event.field:value pattern at the end
      const unquotedMatch = trimmedPrefix.match(/event\.\w+(?:\.\w+)*\s*:\s*([^\s"']+)$/);
      if (unquotedMatch) {
        return true;
      }
      
      // Even more lenient: if the query ends with a value after a colon, consider it complete
      // This handles: event.workflowId:value (cursor right before closing quote)
      const endsWithValuePattern = /event\.\w+(?:\.\w+)*\s*:\s*[^\s"']+$/;
      if (endsWithValuePattern.test(trimmedPrefix)) {
        return true;
      }
    }
    
    // ULTIMATE FALLBACK: If we have trailing space and the query has event.field:something, assume complete
    // This is very lenient and should catch most cases where user typed space after a value
    if (hasTrailingSpace && trimmedPrefix.includes('event.') && trimmedPrefix.includes(':')) {
      // Check if there's something after the colon (a value)
      const afterColon = trimmedPrefix.split(':').slice(1).join(':').trim();
      if (afterColon.length > 0) {
        // There's a value after the colon, so it's likely a complete pair
        return true;
      }
    }
    
    return false;
  })();
  
  // When space is typed, lastToken might be empty, so check previous token
  const previousToken = tokens.length > 1 ? tokens[tokens.length - 2] : '';
  const tokenBeforeLast = tokens.length > 2 ? tokens[tokens.length - 3] : '';
  
  // Check if we're after a field name (current or previous token has colon)
  const isAfterFieldName = lastToken.includes(':') || 
                           (previousToken && previousToken.includes(':')) ||
                           (tokens.length > 0 && fieldNamePattern.test(tokens[tokens.length - 2]));
  
  // Check if we're after a logical operator (check current, previous, or token before that)
  const isAfterLogicalOp = /^(and|or|not)$/i.test(lastToken) ||
                           (previousToken && /^(and|or|not)$/i.test(previousToken)) ||
                           (tokenBeforeLast && /^(and|or|not)$/i.test(tokenBeforeLast));
  
  const isAfterComparisonOp = /^(>|<|>=|<=|:)$/.test(lastToken) ||
                               (previousToken && /^(>|<|>=|<=|:)$/.test(previousToken));

  // If the field is empty and not quoted, suggest starting with a single quote
  // Single quotes allow double quotes inside for KQL string values
  if (isEmpty && !isQuoted) {
    suggestions.push({
      label: "Start KQL query",
      insertText: "'",
      detail: "Start typing your KQL query (use single quotes to allow double quotes inside)",
      kind: monaco.languages.CompletionItemKind.Text,
      range,
      sortText: '!quote',
    });
  }

  // If we're typing a field name, at the start, after a logical operator, or after a complete field:value pair, suggest field names
  // Also check if we have trailing space (user just typed space) - this indicates we should show suggestions
  const shouldShowFieldSuggestions = isTypingFieldName || isEmpty || isAfterLogicalOp || hasCompleteFieldValuePair || hasTrailingSpace;
  
  if (shouldShowFieldSuggestions) {
    // Extract the prefix being typed (before colon if present)
    // If we're after a complete pair, treat it as a new field context (empty prefix)
    let fieldPrefix = '';
    let isTypingEventPrefix = false;
    
    // When trailing space is present, it usually means user just typed space after a complete pair
    // In this case, lastToken might be empty, so we should show all fields
    if (hasCompleteFieldValuePair || hasTrailingSpace) {
      // After a complete pair or trailing space, check if user is typing a new field prefix AFTER the pair
      // If lastToken is empty (space was just typed), show all fields
      if (!lastToken || lastToken === '') {
        // Space was just typed - show all fields
        fieldPrefix = '';
        isTypingEventPrefix = false;
      } else if (lastToken.includes(':')) {
        // lastToken is a complete pair (contains : and value), user hasn't typed anything new yet
        // Show all fields and logical operators
        fieldPrefix = '';
        isTypingEventPrefix = false;
      } else if (lastToken.toLowerCase().startsWith('event.')) {
        // User is typing a new field starting with event.
        isTypingEventPrefix = true;
        fieldPrefix = lastToken.toLowerCase().replace(/^event\./, '');
      } else if (!lastToken.includes(':')) {
        // User might be typing a new field name (without event. prefix yet)
        fieldPrefix = lastToken.toLowerCase();
      } else {
        // Empty or space - show all fields
        fieldPrefix = '';
        isTypingEventPrefix = false;
      }
    } else {
      // Normal case: extract prefix from lastToken
      // BUT: if we're after a logical operator, treat it as starting a new field (empty prefix)
      // Check if lastToken is an operator, or if previousToken is an operator (user typed space after operator)
      // Remove quotes from tokens for operator detection
      const lastTokenClean = lastToken.replace(/^["']|["']$/g, '');
      const previousTokenClean = previousToken ? previousToken.replace(/^["']|["']$/g, '') : '';
      const lastTokenIsOperator = /^(and|or|not)$/i.test(lastTokenClean);
      const previousTokenIsOperator = previousTokenClean && /^(and|or|not)$/i.test(previousTokenClean);
      
      if (isAfterLogicalOp && (lastTokenIsOperator || previousTokenIsOperator)) {
        // After an operator, show all fields (empty prefix)
        // If lastToken is empty (space after operator), or lastToken is the operator itself
        if (!lastToken || lastTokenIsOperator || (hasTrailingSpace && previousTokenIsOperator)) {
          fieldPrefix = '';
          isTypingEventPrefix = false;
        } else if (lastTokenClean.toLowerCase().startsWith('event.')) {
          // User is typing a new field starting with event.
          isTypingEventPrefix = true;
          fieldPrefix = lastTokenClean.toLowerCase().replace(/^event\./, '');
        } else {
          // User might be typing a new field name (without event. prefix yet)
          fieldPrefix = lastTokenClean.toLowerCase();
        }
      } else {
        fieldPrefix = lastToken.split(':')[0].trim().replace(/^["']|["']$/g, '');
        isTypingEventPrefix = lastTokenClean.toLowerCase().startsWith('event.');
      }
    }
    
    // Check if fieldPrefix is an operator and reset it if needed BEFORE filtering
    const fieldPrefixIsOperator = fieldPrefix && /^(and|or|not)$/i.test(fieldPrefix);
    if (fieldPrefixIsOperator || (isAfterLogicalOp && !isTypingEventPrefix && fieldPrefix && !fieldPrefix.toLowerCase().startsWith('event.'))) {
      // Reset fieldPrefix to empty to show all fields
      fieldPrefix = '';
      isTypingEventPrefix = false;
    }
    
    const filteredPaths = fieldPrefix
      ? propertyPaths.filter((p) => p.path.toLowerCase().startsWith(fieldPrefix.toLowerCase()))
      : propertyPaths;

    let fieldsAdded = 0;
    for (const { path, type } of filteredPaths) {
      // Note: We don't skip fields that are already in the query because users might want to
      // use the same field multiple times, e.g., "event.workflowId:value and not event.workflowId:value"
      const eventPath = `event.${path}`;

      // Only suggest event. prefixed access (no direct access)
      const pathWithoutEventPrefix = isTypingEventPrefix 
        ? fieldPrefix
        : '';
      
      // If typing event. prefix, filter paths that match after "event."
      if (isTypingEventPrefix && pathWithoutEventPrefix && !path.toLowerCase().startsWith(pathWithoutEventPrefix)) {
        continue;
      }

      // If not typing event. prefix and we have a fieldPrefix, suggest "event." first
      if (!isTypingEventPrefix && fieldPrefix && !fieldPrefix.toLowerCase().startsWith('event.')) {
        // Suggest "event." as a prefix option (only once)
        if (isEmpty || hasCompleteFieldValuePair) {
          const hasEventSuggestion = suggestions.some(s => s.label === 'event.');
          if (!hasEventSuggestion) {
            suggestions.push({
              label: 'event.',
              insertText: 'event.',
              detail: 'Event context - access event properties',
              kind: monaco.languages.CompletionItemKind.Module,
              range,
              documentation: 'Use event. to access event properties in the where clause',
              sortText: '!event.',
            });
          }
        }
        continue;
      }

      // Add event. prefixed suggestion
      // Use single quotes to allow double quotes inside KQL string values
      let eventInsertText = `${eventPath}:`;
      
      // Check if query ends with colon (user just typed field name)
      const endsWithColon = trimmedPrefix.endsWith(':') || queryPrefix.trim().endsWith(':');
      
      // Determine if we should add a closing quote
      // Only add closing quote if:
      // 1. The where clause is empty AND needsClosingQuote is true (starting fresh)
      // 2. The query ends with a colon (user just typed field name) AND needsClosingQuote is true
      // Do NOT add closing quote if the query already has content (closing quote likely already exists in YAML)
      const shouldAddClosingQuote = needsClosingQuote && (isEmpty || endsWithColon);
      
      // ALWAYS add value placeholder when:
      // 1. isEmpty is true (user is selecting a field in an empty where clause)
      // 2. OR query ends with colon (user just typed field name)
      // 3. OR any other case (add quoted value)
      // This handles: where: 'event.workflowId: -> where: 'event.workflowId:value'
      // And: where: '' -> where: 'event.executionId:value'
      // And: where: 'event.workflowId:value or ' -> where: 'event.workflowId:value or event.field:value'
      // (no extra quote because closing quote already exists in the YAML when query has content)
      if (isEmpty) {
        // Empty where clause - check if we need to add opening quote or just value
        if (needsQuoting && !isQuoted) {
          // Starting a new where clause - add opening single quote
          eventInsertText = `'${eventInsertText}value'`;
        } else if (shouldAddClosingQuote) {
          // Empty but needs closing quote - add value and closing quote
          eventInsertText = `${eventInsertText}value'`;
        } else {
          // Already in quotes or doesn't need quoting - just add value
          eventInsertText = `${eventInsertText}value`;
        }
      } else if (endsWithColon) {
        // Query ends with colon - add value placeholder
        // Only add closing quote if needsClosingQuote is true (cursor is before closing quote)
        if (shouldAddClosingQuote) {
          eventInsertText = `${eventInsertText}value'`;
        } else {
          eventInsertText = `${eventInsertText}value`;
        }
      } else {
        // For any other case (e.g., after operator), add an unquoted value placeholder
        // Do NOT add closing quote - it already exists in the YAML
        // This ensures: where: 'event.workflowId:value or ' -> 'event.workflowId:value or event.field:value'
        eventInsertText = `${eventInsertText}value`;
      }

      suggestions.push({
        label: eventPath,
        insertText: eventInsertText,
        detail: `Event property (${type})`,
        kind: monaco.languages.CompletionItemKind.Field,
        range,
        documentation: `Property from ${triggerType} event schema. Use in KQL query to filter events.${needsQuoting && !isQuoted ? " Note: Use single quotes (') to allow double quotes inside KQL string values." : ''}`,
        sortText: `!${eventPath}`, // Priority prefix
      });
      fieldsAdded++;
    }
  }

  // If we're after a field name (with colon), suggest comparison operators
  if (isAfterFieldName && !isAfterComparisonOp) {
    const operators = [
      { label: ':', insertText: ':', detail: 'Equals (field: value)', kind: monaco.languages.CompletionItemKind.Operator },
      { label: '>', insertText: '>', detail: 'Greater than', kind: monaco.languages.CompletionItemKind.Operator },
      { label: '<', insertText: '<', detail: 'Less than', kind: monaco.languages.CompletionItemKind.Operator },
      { label: '>=', insertText: '>=', detail: 'Greater than or equal', kind: monaco.languages.CompletionItemKind.Operator },
      { label: '<=', insertText: '<=', detail: 'Less than or equal', kind: monaco.languages.CompletionItemKind.Operator },
    ];

    for (const op of operators) {
      suggestions.push({
        label: op.label,
        insertText: op.insertText,
        detail: op.detail,
        kind: op.kind,
        range,
        sortText: `!${op.label}`, // Priority prefix
      });
    }
  }
  
  if (hasCompleteFieldValuePair || hasTrailingSpace) {
    // Always add logical operators when we detect a complete pair or trailing space
    const logicalOps = [
      { label: 'and', insertText: 'and', detail: 'Logical AND - both conditions must be true', kind: monaco.languages.CompletionItemKind.Keyword },
      { label: 'or', insertText: 'or', detail: 'Logical OR - either condition can be true', kind: monaco.languages.CompletionItemKind.Keyword },
      { label: 'not', insertText: 'not', detail: 'Logical NOT - negates the condition', kind: monaco.languages.CompletionItemKind.Keyword },
    ];

    for (const op of logicalOps) {
      // Don't suggest if it's already the last token (but lastToken might be empty if space was just typed)
      // When hasTrailingSpace is true, lastToken is empty, so we should show all operators
      if (lastToken && lastToken.toLowerCase() === op.label) {
        continue;
      }

      suggestions.push({
        label: op.label,
        insertText: op.insertText,
        detail: op.detail,
        kind: op.kind,
        range,
        sortText: `!${op.label}`,
      });
    }
    
    // Also ensure we show event fields when after a complete pair
    // This allows chaining conditions: event.field1:"value1" and event.field2:"value2"
    // The field suggestions will be added in the block below that checks hasCompleteFieldValuePair
  }
  
  // Also suggest logical operators in other contexts
  // Include trailing space check - when user types space, show operators
  if (isEmpty || isAfterComparisonOp || (tokens.length > 1 && isAfterLogicalOp) || hasTrailingSpace) {
    const logicalOps = [
      { label: 'and', insertText: 'and', detail: 'Logical AND - both conditions must be true', kind: monaco.languages.CompletionItemKind.Keyword },
      { label: 'or', insertText: 'or', detail: 'Logical OR - either condition can be true', kind: monaco.languages.CompletionItemKind.Keyword },
      { label: 'not', insertText: 'not', detail: 'Logical NOT - negates the condition', kind: monaco.languages.CompletionItemKind.Keyword },
    ];

    for (const op of logicalOps) {
      // Don't suggest if it's already the last token
      if (lastToken.toLowerCase() === op.label) {
        continue;
      }
      
      // Don't duplicate if already added above
      if (!suggestions.some(s => s.label === op.label)) {
        suggestions.push({
          label: op.label,
          insertText: op.insertText,
          detail: op.detail,
          kind: op.kind,
          range,
          sortText: `!${op.label}`,
        });
      }
    }
  }
  
  // Fallback: If we have a complete field:value pair but no suggestions, ensure we show something
  // This handles edge cases where detection might miss but we know we're after a complete pair
  if (hasCompleteFieldValuePair && suggestions.length === 0) {
    // Show logical operators as a minimum
    const logicalOps = [
      { label: 'and', insertText: 'and', detail: 'Logical AND - both conditions must be true', kind: monaco.languages.CompletionItemKind.Keyword },
      { label: 'or', insertText: 'or', detail: 'Logical OR - either condition can be true', kind: monaco.languages.CompletionItemKind.Keyword },
    ];
    
    for (const op of logicalOps) {
      suggestions.push({
        label: op.label,
        insertText: op.insertText,
        detail: op.detail,
        kind: op.kind,
        range,
        sortText: `!${op.label}`,
      });
    }
    
    // Also show event. prefix suggestion and a few common fields
    suggestions.push({
      label: 'event.',
      insertText: 'event.',
      detail: 'Event context - access event properties',
      kind: monaco.languages.CompletionItemKind.Module,
      range,
      documentation: 'Use event. to access event properties in the where clause',
      sortText: '!event.',
    });
    
    // Show a few common event properties
    const commonFields = propertyPaths.slice(0, 5); // Show first 5 fields
    for (const { path, type } of commonFields) {
      const eventPath = `event.${path}`;
      const fieldRegex = new RegExp(`\\b${eventPath.replace(/\./g, '\\.')}\\s*:`, 'g');
      if (!fieldRegex.test(trimmedPrefix)) {
        suggestions.push({
          label: eventPath,
          insertText: `${eventPath}:`,
          detail: `Event property (${type})`,
          kind: monaco.languages.CompletionItemKind.Field,
          range,
          documentation: `Property from ${triggerType} event schema`,
          sortText: `!${eventPath}`,
        });
      }
    }
  }

  // Fallback: If we're in a where clause context but have no suggestions yet,
  // always show at least the event. prefix and some common fields
  // This ensures suggestions are always available when manually triggered (Ctrl+Space)
  // Also show suggestions if we have a complete field:value pair (even if other conditions didn't trigger)
  if ((suggestions.length === 0 && !isEmpty) || (hasCompleteFieldValuePair && suggestions.length === 0)) {
    // Show event. prefix suggestion
    suggestions.push({
      label: 'event.',
      insertText: 'event.',
      detail: 'Event context - access event properties',
      kind: monaco.languages.CompletionItemKind.Module,
      range,
      documentation: 'Use event. to access event properties in the where clause',
      sortText: '!event.',
    });
    
    // Show a few common event properties
    const commonFields = propertyPaths.slice(0, 5);
    for (const { path, type } of commonFields) {
      const eventPath = `event.${path}`;
      const fieldRegex = new RegExp(`\\b${eventPath.replace(/\./g, '\\.')}\\s*:`, 'g');
      if (!fieldRegex.test(trimmedPrefix)) {
        suggestions.push({
          label: eventPath,
          insertText: `${eventPath}:`,
          detail: `Event property (${type})`,
          kind: monaco.languages.CompletionItemKind.Field,
          range,
          documentation: `Property from ${triggerType} event schema`,
          sortText: `!${eventPath}`,
        });
      }
    }
    
    // Also show logical operators if we have any content
    if (trimmedPrefix.length > 0) {
      const logicalOps = [
        { label: 'and', insertText: 'and', detail: 'Logical AND', kind: monaco.languages.CompletionItemKind.Keyword },
        { label: 'or', insertText: 'or', detail: 'Logical OR', kind: monaco.languages.CompletionItemKind.Keyword },
      ];
      for (const op of logicalOps) {
        suggestions.push({
          label: op.label,
          insertText: op.insertText,
          detail: op.detail,
          kind: op.kind,
          range,
          sortText: `!${op.label}`,
        });
      }
    }
  }
  
  return suggestions;
}
