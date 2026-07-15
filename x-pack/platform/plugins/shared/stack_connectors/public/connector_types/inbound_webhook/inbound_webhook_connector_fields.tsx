/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButton, EuiCopy, EuiSpacer } from '@elastic/eui';
import React, { useEffect } from 'react';
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

const computeIngestTokenHash = async ({
  connectorId,
  spaceId,
  token,
}: {
  connectorId: string;
  spaceId: string;
  token: string;
}): Promise<string> => {
  const bytes = new TextEncoder().encode(`${connectorId}|${spaceId}|${token}`);
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
  const [{ id, config }] = useFormData({ watch: ['id', 'config.webhookUrl'] });
  const webhookUrl = config?.webhookUrl as string | undefined;

  useEffect(() => {
    registerPreSubmitValidator(async () => undefined);
  }, [registerPreSubmitValidator]);

  useEffect(() => {
    setFieldValue('secrets.authType', 'none');
  }, [setFieldValue]);

  useEffect(() => {
    if (isEdit || webhookUrl || !id) {
      return;
    }
    const createWebhook = async () => {
      const token =
        window.crypto.randomUUID().replaceAll('-', '') +
        window.crypto.randomUUID().replaceAll('-', '');
      const path = http.basePath.prepend(`/api/events/v1/inboundWebhook/${id}?token=${token}`);
      const spaceId = http.basePath.serverBasePath.includes('/s/')
        ? http.basePath.serverBasePath.split('/s/')[1]?.split('/')[0] ?? 'default'
        : 'default';
      setFieldValue('config.webhookUrl', `${window.location.origin}${path}`);
      setFieldValue(
        'config.ingestTokenHash',
        await computeIngestTokenHash({
          connectorId: String(id),
          spaceId,
          token,
        })
      );
    };
    void createWebhook();
  }, [http.basePath, id, isEdit, setFieldValue, webhookUrl]);

  return (
    <>
      <UseField path="config.ingestTokenHash" component={HiddenField} />
      <UseField path="secrets.authType" component={HiddenField} />
      {!isEdit ? (
        <>
          <UseField
            path="config.webhookUrl"
            component={TextField}
            config={{
              label: i18n.translate('stackConnectors.inboundWebhook.urlLabel', {
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
                  id="stackConnectors.inboundWebhook.copyUrlButtonLabel"
                  defaultMessage="Copy webhook URL"
                />
              </EuiButton>
            )}
          </EuiCopy>
        </>
      ) : null}
    </>
  );
};
