/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License, v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { InboundWebhookRelativeTime } from './inbound_webhook_relative_time';
import { TestProvider } from '../../shared/mocks/test_providers';

jest.mock('../../shared/ui/use_formatted_date', () => ({
  useFormattedDateTime: () => 'full-date',
}));

describe('InboundWebhookRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders just now for a current timestamp', () => {
    jest.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));

    render(<InboundWebhookRelativeTime value="2026-07-15T12:00:00.000Z" />, {
      wrapper: TestProvider,
    });

    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('renders a relative time for an older timestamp', () => {
    jest.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));

    render(<InboundWebhookRelativeTime value="2026-07-15T11:55:00.000Z" />, {
      wrapper: TestProvider,
    });

    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
  });

  it('uses elapsed days instead of a calendar month boundary', () => {
    jest.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    render(<InboundWebhookRelativeTime value="2026-06-26T12:00:00.000Z" />, {
      wrapper: TestProvider,
    });

    expect(screen.getByText('5 days ago')).toBeInTheDocument();
  });

  it('uses elapsed weeks instead of a calendar year boundary', () => {
    jest.setSystemTime(new Date('2026-01-10T12:00:00.000Z'));

    render(<InboundWebhookRelativeTime value="2025-12-20T12:00:00.000Z" />, {
      wrapper: TestProvider,
    });

    expect(screen.getByText('3 weeks ago')).toBeInTheDocument();
  });

  it('shows the absolute timestamp in a tooltip', () => {
    jest.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));

    render(<InboundWebhookRelativeTime value="2026-07-15T11:55:00.000Z" />, {
      wrapper: TestProvider,
    });

    fireEvent.mouseOver(screen.getByText('5 minutes ago'));
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(screen.getByText('full-date')).toBeInTheDocument();
  });
});
