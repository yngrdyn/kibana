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
  const { http } = useKibana().services;
  const { setFieldValue } = useFormContext();
  const [{ id, secrets }] = useFormData({ watch: ['id', 'secrets.webhookUrl'] });
  const webhookUrl = secrets?.webhookUrl as string | undefined;
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    registerPreSubmitValidator(async () => {
      setFieldValue('config.credentialRevision', window.crypto.randomUUID());
    });
  }, [registerPreSubmitValidator, setFieldValue]);

  useEffect(() => {
    if (isEdit || webhookUrl) {
      return;
    }
    const createWebhook = async () => {
      const key = window.crypto.randomUUID();
      const path = http.basePath.prepend(`/api/webhooks/${key}`);
      setFieldValue('secrets.webhookUrl', `${window.location.origin}${path}`);
      setFieldValue('config.webhookKeyHash', await sha256(key));
      setFieldValue('config.credentialRevision', window.crypto.randomUUID());
    };
    void createWebhook();
  }, [http.basePath, isEdit, setFieldValue, webhookUrl]);

  useEffect(() => {
    if (!isEdit || !id) {
      return;
    }
    const loadStatus = async () => {
      try {
        const result = await http.get<{ status: string }>(
          `/internal/workflows/inbound_webhook/${encodeURIComponent(id as string)}/status`
        );
        setStatus(result.status);
      } catch {
        setStatus('unavailable');
      }
    };
    void loadStatus();
  }, [http, id, isEdit]);

  return (
    <>
      <UseField path="config.webhookKeyHash" component={HiddenField} />
      <UseField path="config.credentialRevision" component={HiddenField} />
      {isEdit ? (
        <EuiCallOut
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
      ) : (
        <>
          <UseField
            path="secrets.webhookUrl"
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
      )}
    </>
  );
};
