/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useState } from 'react';
import { WORKFLOWS_CONFIG_PATH } from '../../../../common/routes';
import { useKibana } from '../../../hooks/use_kibana';

export interface EventDrivenExecutionStatus {
  eventDrivenExecutionEnabled: boolean;
}

export function useEventDrivenExecutionStatus(): {
  eventDrivenExecutionEnabled: boolean;
  isLoading: boolean;
  error: boolean;
} {
  const { http } = useKibana().services;
  const [status, setStatus] = useState<EventDrivenExecutionStatus>({
    eventDrivenExecutionEnabled: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      if (!http) {
        setIsLoading(false);
        return;
      }
      try {
        const result = await http.get<EventDrivenExecutionStatus>(WORKFLOWS_CONFIG_PATH);
        if (!cancelled) {
          setStatus(result);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setStatus({ eventDrivenExecutionEnabled: true });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [http]);

  return {
    eventDrivenExecutionEnabled: status.eventDrivenExecutionEnabled,
    isLoading,
    error,
  };
}
