/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButton,
  EuiCopy,
  EuiFieldText,
  EuiFormRow,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
} from '@elastic/eui';
import React from 'react';
import type { CoreStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { toMountPoint } from '@kbn/react-kibana-mount';

const WATCH_INTERVAL_MS = 500;
const WATCH_ATTEMPTS = 60;
const activeWatchers = new Set<string>();

const wait = (): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, WATCH_INTERVAL_MS));

const openWebhookUrlModal = (core: CoreStart, webhookUrl: string): void => {
  const modal = core.overlays.openModal(
    toMountPoint(
      <EuiModal
        aria-labelledby="inboundWebhookUrlModalTitle"
        onClose={() => modal.close()}
        data-test-subj="inboundWebhookUrlModal"
      >
        <EuiModalHeader>
          <EuiModalHeaderTitle id="inboundWebhookUrlModalTitle">
            <FormattedMessage
              id="workflowsManagement.inboundWebhook.urlModalTitle"
              defaultMessage="Inbound webhook URL"
            />
          </EuiModalHeaderTitle>
        </EuiModalHeader>
        <EuiModalBody>
          <EuiFormRow
            fullWidth
            label={i18n.translate('workflowsManagement.inboundWebhook.urlModalLabel', {
              defaultMessage: 'Webhook URL',
            })}
          >
            <EuiFieldText
              fullWidth
              readOnly
              value={webhookUrl}
              data-test-subj="inboundWebhookGeneratedUrl"
            />
          </EuiFormRow>
          <EuiCopy textToCopy={webhookUrl}>
            {(copy) => (
              <EuiButton
                size="s"
                iconType="copy"
                onClick={copy}
                data-test-subj="copyGeneratedInboundWebhookUrl"
              >
                <FormattedMessage
                  id="workflowsManagement.inboundWebhook.urlModalCopyButtonLabel"
                  defaultMessage="Copy URL"
                />
              </EuiButton>
            )}
          </EuiCopy>
        </EuiModalBody>
        <EuiModalFooter>
          <EuiButton fill onClick={() => modal.close()}>
            <FormattedMessage
              id="workflowsManagement.inboundWebhook.urlModalDoneButtonLabel"
              defaultMessage="Done"
            />
          </EuiButton>
        </EuiModalFooter>
      </EuiModal>,
      core
    )
  );
};

export const watchAndShowInboundWebhookUrl = ({
  connectorId,
  core,
}: {
  connectorId: string;
  core: CoreStart;
}): void => {
  if (activeWatchers.has(connectorId)) {
    return;
  }
  activeWatchers.add(connectorId);

  void (async () => {
    try {
      for (let attempt = 0; attempt < WATCH_ATTEMPTS; attempt++) {
        try {
          const result = await core.http.get<{ status: string }>(
            `/internal/workflows/inbound_webhook/${encodeURIComponent(connectorId)}/status`
          );
          if (result.status === 'active') {
            const connector = await core.http.get<{
              config?: { webhookUrl?: string };
            }>(`/api/actions/connector/${encodeURIComponent(connectorId)}`);
            if (connector.config?.webhookUrl) {
              openWebhookUrlModal(core, connector.config.webhookUrl);
              return;
            }
          }
        } catch {
          // Connector creation and mapping promotion may not have completed yet.
        }
        await wait();
      }
    } finally {
      activeWatchers.delete(connectorId);
    }
  })();
};
