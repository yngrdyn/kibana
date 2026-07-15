/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { ActionConnectorMode } from '@kbn/triggers-actions-ui-plugin/public';
import { INBOUND_WEBHOOK_RECEIVE_SUB_ACTION } from '../../../common/inbound_webhook/constants';
import { InboundWebhookParamsFields } from './inbound_webhook_params_fields';

describe('InboundWebhookParamsFields', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'crypto', {
      value: {
        randomUUID: jest.fn(() => '22222222-2222-4222-8222-222222222222'),
      },
      configurable: true,
    });
  });

  it('initializes receive subAction params in connector test mode', async () => {
    const editAction = jest.fn();
    const credentialRevision = '11111111-1111-4111-8111-111111111111';

    render(
      <I18nProvider>
        <InboundWebhookParamsFields
          actionParams={{}}
          actionConnector={{
            id: 'connector-1',
            actionTypeId: '.workflows-inbound-webhook',
            config: { credentialRevision },
          }}
          editAction={editAction}
          index={0}
          executionMode={ActionConnectorMode.Test}
          errors={{}}
          messageVariables={[]}
        />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(editAction).toHaveBeenCalledWith(
        'subAction',
        INBOUND_WEBHOOK_RECEIVE_SUB_ACTION,
        0
      );
    });

    expect(editAction).toHaveBeenCalledWith(
      'subActionParams',
      expect.objectContaining({
        credentialRevision,
        body: expect.objectContaining({ message: expect.any(String) }),
        headers: { 'content-type': 'application/json' },
      }),
      0
    );
  });
});
