/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonIcon,
  EuiCallOut,
  EuiCopy,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormAppend,
  EuiFormRow,
  EuiSpacer,
  EuiToolTip,
} from '@elastic/eui';
import React, { useCallback, useEffect, useState } from 'react';
import { HiddenField } from '@kbn/es-ui-shared-plugin/static/forms/components';
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
  const [{ id, config }] = useFormData({
    watch: ['id', 'config.webhookKey', 'config.webhookKeyHash'],
  });
  const connectorId = id as string | undefined;
  const webhookKey = config?.webhookKey as string | undefined;
  const webhookKeyHash = config?.webhookKeyHash as string | undefined;
  const webhookUrl = webhookKey
    ? `${window.location.origin}${http.basePath.prepend(`/api/event/${webhookKey}`)}`
    : '';
  const [status, setStatus] = useState<string>();
  const [isGeneratingUrl, setIsGeneratingUrl] = useState(false);

  const generateWebhookUrl = useCallback(async () => {
    setIsGeneratingUrl(true);
    try {
      const key = window.crypto.randomUUID().replaceAll('-', '');
      setFieldValue('config.webhookKey', key);
      setFieldValue('config.webhookKeyHash', await sha256(key));
      setFieldValue('config.credentialRevision', window.crypto.randomUUID());
    } finally {
      setIsGeneratingUrl(false);
    }
  }, [setFieldValue]);

  useEffect(() => {
    registerPreSubmitValidator(async () => {
      if (!connectorId || !webhookKey || !webhookKeyHash || isGeneratingUrl) {
        return {
          message: i18n.translate(
            'workflowsManagement.inboundWebhook.urlGenerationPendingErrorMessage',
            {
              defaultMessage: 'Wait for the webhook URL to finish generating, then save again.',
            }
          ),
        };
      }
    });
  }, [connectorId, isGeneratingUrl, registerPreSubmitValidator, webhookKey, webhookKeyHash]);

  useEffect(() => {
    if (isEdit) {
      return;
    }

    if (!connectorId) {
      setFieldValue('id', window.crypto.randomUUID());
    }
    if (webhookKey || webhookKeyHash) {
      return;
    }

    void generateWebhookUrl();
  }, [connectorId, generateWebhookUrl, isEdit, setFieldValue, webhookKey, webhookKeyHash]);

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
      <UseField path="config.webhookKey" component={HiddenField} />
      <UseField path="config.webhookKeyHash" component={HiddenField} />
      <UseField path="config.credentialRevision" component={HiddenField} />
      {isEdit ? (
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
      ) : (
        <EuiCallOut
          announceOnMount={false}
          iconType="link"
          title={i18n.translate('workflowsManagement.inboundWebhook.generatedUrlTitle', {
            defaultMessage: 'Webhook URL',
          })}
        >
          <FormattedMessage
            id="workflowsManagement.inboundWebhook.generatedUrlDescription"
            defaultMessage="Copy this URL and save the connector to activate it."
          />
        </EuiCallOut>
      )}
      <EuiSpacer size="s" />
      <EuiFormRow
        fullWidth
        label={i18n.translate('workflowsManagement.inboundWebhook.urlLabel', {
          defaultMessage: 'Webhook URL',
        })}
      >
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem>
            <EuiFieldText
              readOnly
              disabled={isGeneratingUrl}
              fullWidth
              value={webhookUrl}
              data-test-subj="inboundWebhookUrl"
              aria-label={i18n.translate('workflowsManagement.inboundWebhook.urlAriaLabel', {
                defaultMessage: 'Webhook URL',
              })}
              append={
                <EuiCopy textToCopy={webhookUrl ?? ''}>
                  {(copy) => (
                    <EuiFormAppend
                      element="button"
                      iconLeft="copy"
                      onClick={copy}
                      isDisabled={!webhookUrl || readOnly || isGeneratingUrl}
                      data-test-subj="copyInboundWebhookUrl"
                      aria-label={i18n.translate(
                        'workflowsManagement.inboundWebhook.copyUrlButtonLabel',
                        {
                          defaultMessage: 'Copy webhook URL',
                        }
                      )}
                    />
                  )}
                </EuiCopy>
              }
            />
          </EuiFlexItem>
          {isEdit && (
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={i18n.translate(
                  'workflowsManagement.inboundWebhook.rotateUrlButtonTooltip',
                  {
                    defaultMessage:
                      'Generate a new webhook URL. The current URL stops working after you save.',
                  }
                )}
              >
                <EuiButtonIcon
                  display="base"
                  size="m"
                  iconType="refresh"
                  onClick={() => {
                    void generateWebhookUrl();
                  }}
                  disabled={readOnly || isGeneratingUrl}
                  isLoading={isGeneratingUrl}
                  data-test-subj="rotateInboundWebhookUrl"
                  aria-label={i18n.translate(
                    'workflowsManagement.inboundWebhook.rotateUrlButtonAriaLabel',
                    {
                      defaultMessage: 'Rotate webhook URL',
                    }
                  )}
                />
              </EuiToolTip>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFormRow>
    </>
  );
};
