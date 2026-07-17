/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButton, EuiCallOut, EuiCopy, EuiSpacer } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { HiddenField, TextField } from '@kbn/es-ui-shared-plugin/static/forms/components';
import {
  UseField,
  useFormContext,
  useFormData,
} from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ActionConnectorFieldsProps } from '@kbn/triggers-actions-ui-plugin/public';
import { useKibana } from '@kbn/triggers-actions-ui-plugin/public';
import { watchAndShowInboundWebhookUrl } from './inbound_webhook_url_modal';

const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const InboundWebhookConnectorFields = ({
  isEdit,
  readOnly,
  registerPreSubmitValidator,
}: ActionConnectorFieldsProps) => {
  const core = useKibana().services;
  const { http } = core;
  const { setFieldValue } = useFormContext();
  const [{ id, config }] = useFormData({
    watch: ['id', 'config.webhookUrl', 'config.webhookKeyHash', 'config.credentialRevision'],
  });
  const connectorId = id as string | undefined;
  const webhookUrl = config?.webhookUrl as string | undefined;
  const webhookKeyHash = config?.webhookKeyHash as string | undefined;
  const credentialRevision = config?.credentialRevision as string | undefined;
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    registerPreSubmitValidator(async () => {
      if (!isEdit) {
        if (!connectorId || !webhookUrl || !webhookKeyHash) {
          return {
            message: i18n.translate(
              'workflowsManagement.inboundWebhook.urlGenerationPendingErrorMessage',
              {
                defaultMessage: 'Wait for the webhook URL to finish generating, then save again.',
              }
            ),
          };
        }
        watchAndShowInboundWebhookUrl({ connectorId, core });
      }
    });
  }, [connectorId, core, isEdit, registerPreSubmitValidator, webhookKeyHash, webhookUrl]);

  useEffect(() => {
    if (isEdit) {
      return;
    }

    if (!connectorId) {
      setFieldValue('id', window.crypto.randomUUID());
    }
    if (!credentialRevision) {
      setFieldValue('config.credentialRevision', window.crypto.randomUUID());
    }
    if (webhookUrl || webhookKeyHash) {
      return;
    }

    const generateWebhookUrl = async () => {
      const key = window.crypto.randomUUID().replaceAll('-', '');
      const path = http.basePath.prepend(`/api/event/${key}`);
      setFieldValue('config.webhookUrl', `${window.location.origin}${path}`);
      setFieldValue('config.webhookKeyHash', await sha256(key));
    };
    void generateWebhookUrl();
  }, [
    connectorId,
    credentialRevision,
    http.basePath,
    isEdit,
    setFieldValue,
    webhookKeyHash,
    webhookUrl,
  ]);

  useEffect(() => {
    if (!isEdit || !connectorId) {
      return;
    }
    const loadStatus = async () => {
      try {
        const result = await http.get<{ status: string }>(
          `/internal/workflows/inbound_webhook/${encodeURIComponent(connectorId)}/status`
        );
        setStatus(result.status);
      } catch {
        setStatus('unavailable');
      }
    };
    void loadStatus();
  }, [connectorId, http, isEdit]);

  return (
    <>
      <UseField path="config.webhookKeyHash" component={HiddenField} />
      <UseField path="config.credentialRevision" component={HiddenField} />
      {!isEdit && <UseField path="config.webhookUrl" component={HiddenField} />}
      {isEdit ? (
        <>
          <EuiCallOut
            announceOnMount={false}
            title={i18n.translate('workflowsManagement.inboundWebhook.configuredTitle', {
              defaultMessage:
                'Webhook URL is configured{status, select, none {} other { ({status})}}',
              values: { status: status ?? 'none' },
            })}
            size="s"
            iconType="check"
            data-test-subj="inboundWebhookConfigured"
          >
            <FormattedMessage
              id="workflowsManagement.inboundWebhook.editPrivilegesDescription"
              defaultMessage="Saving this connector moves future webhook execution privileges to your user."
            />
          </EuiCallOut>
          <EuiSpacer size="s" />
          <UseField
            path="config.webhookUrl"
            component={TextField}
            config={{
              label: i18n.translate('workflowsManagement.inboundWebhook.urlLabel', {
                defaultMessage: 'Webhook URL',
              }),
            }}
            componentProps={{
              euiFieldProps: {
                readOnly: true,
                fullWidth: true,
                'data-test-subj': 'inboundWebhookUrl',
              },
            }}
          />
          <EuiSpacer size="s" />
          <EuiCopy textToCopy={webhookUrl ?? ''}>
            {(copy) => (
              <EuiButton
                size="s"
                iconType="copy"
                onClick={copy}
                disabled={!webhookUrl || readOnly}
                data-test-subj="copyInboundWebhookUrl"
              >
                <FormattedMessage
                  id="workflowsManagement.inboundWebhook.copyUrlButtonLabel"
                  defaultMessage="Copy webhook URL"
                />
              </EuiButton>
            )}
          </EuiCopy>
        </>
      ) : (
        <EuiCallOut
          announceOnMount={false}
          iconType="link"
          title={i18n.translate('workflowsManagement.inboundWebhook.generatedAfterSaveTitle', {
            defaultMessage: 'Webhook URL generated after save',
          })}
        >
          <FormattedMessage
            id="workflowsManagement.inboundWebhook.generatedAfterSaveDescription"
            defaultMessage="Save the connector to view and copy its webhook URL."
          />
        </EuiCallOut>
      )}
    </>
  );
};
