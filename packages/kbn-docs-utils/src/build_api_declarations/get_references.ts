/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Node, ReferenceFindableNode } from 'ts-morph';
import { ToolingLog } from '@kbn/tooling-log';
import { getPluginForPath } from '../utils';
import { getSourceForNode } from './utils';
import { ApiDeclaration, ApiReference, PluginOrPackage } from '../types';
import { isNamedNode } from '../tsmorph_utils';

interface Opts {
  node: ReferenceFindableNode;
  plugins: PluginOrPackage[];
  /**
   * The name of the plugin the node belongs in. This is used to filter out internal plugin
   * references.
   */
  currentPluginId: string;
  log: ToolingLog;
}

/**
 * Return all external references for the given node. Internal plugin references are filtered out.
 */
export function getReferences({ node, plugins, currentPluginId, log }: Opts): ApiReference[] {
  const refs: ApiReference[] = [];
  const refNodes = node.findReferencesAsNodes();
  refNodes.forEach((ref) => {
    const refPlugin = getPluginForPath(ref.getSourceFile().getFilePath(), plugins);

    // Don't include references from inside the plugin itself, we only care about
    // external references (if it's only used internally, it shouldn't be exported).
    if (refPlugin && refPlugin.id !== currentPluginId) {
      refs.push({
        plugin: refPlugin.id,
        path: getSourceForNode(ref),
      });
    }
  });

  log.debug(
    `Found ${refs.length} external references to node ${
      isNamedNode(node) ? node.getName() : 'no name'
    } in plugin ${currentPluginId}`
  );

  return refs;
}

interface MaybeCollectReferencesOpt {
  plugins: PluginOrPackage[];
  /**
   * The name of the plugin the node belongs in. This is used to filter out internal plugin
   * references.
   */
  currentPluginId: string;
  log: ToolingLog;
  apiDec: ApiDeclaration;
  captureReferences: boolean;
  node: Node;
}

export function maybeCollectReferences({
  node,
  plugins,
  currentPluginId,
  log,
  apiDec,
  captureReferences,
}: MaybeCollectReferencesOpt): ApiReference[] | undefined {
  const shouldCaptureReferences = captureReferences || apiDec.deprecated || apiDec.trackAdoption;
  if (shouldCaptureReferences && Node.isReferenceFindable(node)) {
    return getReferences({ node, plugins, currentPluginId, log });
  }
}
