/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import { ExpressionsStart, ExpressionsSetup } from '@kbn/expressions-plugin/public';
import { repeatImageFunction } from '../common/expression_functions';
import { repeatImageRendererFactory } from './expression_renderers';

interface SetupDeps {
  expressions: ExpressionsSetup;
}

interface StartDeps {
  expression: ExpressionsStart;
}

export type ExpressionRepeatImagePluginSetup = void;
export type ExpressionRepeatImagePluginStart = void;

export class ExpressionRepeatImagePlugin
  implements
    Plugin<
      ExpressionRepeatImagePluginSetup,
      ExpressionRepeatImagePluginStart,
      SetupDeps,
      StartDeps
    >
{
  public setup(core: CoreSetup, { expressions }: SetupDeps): ExpressionRepeatImagePluginSetup {
    core.getStartServices().then(([start]) => {
      expressions.registerFunction(repeatImageFunction);
      expressions.registerRenderer(repeatImageRendererFactory(start));
    });
  }

  public start(core: CoreStart): ExpressionRepeatImagePluginStart {}

  public stop() {}
}
