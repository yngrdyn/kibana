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

import { getInboundWebhookConnectorType } from './inbound_webhook';

describe('inbound webhook connector model', () => {
  it('registers received events as test fields and disables manual execution', async () => {
    const connectorType = getInboundWebhookConnectorType();

    expect(connectorType.actionParamsFields).toBeDefined();
    await expect(
      connectorType.validateParams({ subAction: 'receive', subActionParams: {} }, null)
    ).resolves.toEqual({
      errors: {
        subAction: ['Inbound webhook events can only be received through the webhook URL.'],
      },
    });
  });
});
