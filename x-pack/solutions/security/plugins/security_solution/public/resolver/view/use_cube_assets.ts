/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { EuiButtonColor } from '@elastic/eui';
import { useEuiTheme } from '@elastic/eui';
import { useMemo } from 'react';
import type { NodeDataStatus, ResolverProcessType } from '../types';
import { useSymbolIDs } from './use_symbol_ids';
import { useColors } from './use_colors';

/**
 * Provides colors and HTML IDs used to render the 'cube' graphic that accompanies nodes.
 */
export function useCubeAssets(
  id: string,
  cubeType: NodeDataStatus,
  isProcessTrigger: boolean
): NodeStyleConfig {
  const { euiTheme } = useEuiTheme();

  const SymbolIds = useSymbolIDs({ id });
  const colorMap = useColors();

  const nodeAssets: NodeStyleMap = useMemo(
    () => ({
      runningProcessCube: {
        backingFill: colorMap.processBackingFill,
        cubeSymbol: `#${SymbolIds.runningProcessCube}`,
        descriptionFill: colorMap.descriptionText,
        descriptionText: i18n.translate('xpack.securitySolution.endpoint.resolver.runningProcess', {
          defaultMessage: 'Running Process',
        }),
        isLabelFilled: true,
        labelButtonFill: 'primary',
        strokeColor: euiTheme.colors.primary,
      },
      loadingCube: {
        backingFill: colorMap.processBackingFill,
        cubeSymbol: `#${SymbolIds.loadingCube}`,
        descriptionFill: colorMap.descriptionText,
        descriptionText: i18n.translate('xpack.securitySolution.endpoint.resolver.loadingProcess', {
          defaultMessage: 'Loading Process',
        }),
        isLabelFilled: false,
        labelButtonFill: 'primary',
        strokeColor: euiTheme.colors.primary,
      },
      errorCube: {
        backingFill: colorMap.processBackingFill,
        cubeSymbol: `#${SymbolIds.errorCube}`,
        descriptionFill: colorMap.descriptionText,
        descriptionText: i18n.translate('xpack.securitySolution.endpoint.resolver.errorProcess', {
          defaultMessage: 'Error Process',
        }),
        isLabelFilled: false,
        labelButtonFill: 'primary',
        strokeColor: euiTheme.colors.primary,
      },
      runningTriggerCube: {
        backingFill: colorMap.triggerBackingFill,
        cubeSymbol: `#${SymbolIds.runningTriggerCube}`,
        descriptionFill: colorMap.descriptionText,
        descriptionText: i18n.translate('xpack.securitySolution.endpoint.resolver.runningTrigger', {
          defaultMessage: 'Running Trigger',
        }),
        isLabelFilled: true,
        labelButtonFill: 'danger',
        strokeColor: euiTheme.colors.danger,
      },
      terminatedProcessCube: {
        backingFill: colorMap.processBackingFill,
        cubeSymbol: `#${SymbolIds.terminatedProcessCube}`,
        descriptionFill: colorMap.descriptionText,
        descriptionText: i18n.translate(
          'xpack.securitySolution.endpoint.resolver.terminatedProcess',
          {
            defaultMessage: 'Terminated Process',
          }
        ),
        isLabelFilled: false,
        labelButtonFill: 'primary',
        strokeColor: euiTheme.colors.primary,
      },
      terminatedTriggerCube: {
        backingFill: colorMap.triggerBackingFill,
        cubeSymbol: `#${SymbolIds.terminatedTriggerCube}`,
        descriptionFill: colorMap.descriptionText,
        descriptionText: i18n.translate(
          'xpack.securitySolution.endpoint.resolver.terminatedTrigger',
          {
            defaultMessage: 'Terminated Trigger',
          }
        ),
        isLabelFilled: false,
        labelButtonFill: 'danger',
        strokeColor: euiTheme.colors.danger,
      },
    }),
    [SymbolIds, colorMap, euiTheme]
  );

  if (cubeType === 'terminated') {
    if (isProcessTrigger) {
      return nodeAssets.terminatedTriggerCube;
    } else {
      return nodeAssets[processTypeToCube.processTerminated];
    }
  } else if (cubeType === 'running') {
    if (isProcessTrigger) {
      return nodeAssets[processTypeToCube.processCausedAlert];
    } else {
      return nodeAssets[processTypeToCube.processRan];
    }
  } else if (cubeType === 'error') {
    return nodeAssets[processTypeToCube.processError];
  } else {
    return nodeAssets[processTypeToCube.processLoading];
  }
}

const processTypeToCube: Record<ResolverProcessType, keyof NodeStyleMap> = {
  processCreated: 'runningProcessCube',
  processRan: 'runningProcessCube',
  processTerminated: 'terminatedProcessCube',
  unknownProcessEvent: 'runningProcessCube',
  processCausedAlert: 'runningTriggerCube',
  processLoading: 'loadingCube',
  processError: 'errorCube',
  unknownEvent: 'runningProcessCube',
};

interface NodeStyleMap {
  runningProcessCube: NodeStyleConfig;
  runningTriggerCube: NodeStyleConfig;
  terminatedProcessCube: NodeStyleConfig;
  terminatedTriggerCube: NodeStyleConfig;
  loadingCube: NodeStyleConfig;
  errorCube: NodeStyleConfig;
}

interface NodeStyleConfig {
  backingFill: string;
  cubeSymbol: string;
  descriptionFill: string;
  descriptionText: string;
  isLabelFilled: boolean;
  labelButtonFill: EuiButtonColor;
  strokeColor: string;
}
