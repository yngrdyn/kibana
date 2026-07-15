/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiCallOut,
  EuiCopy,
  EuiFieldText,
  EuiFormRow,
  EuiLoadingSpinner,
  EuiSpacer,
} from '@elastic/eui';
import React, { useEffect, useRef, useState } from 'react';
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

import { rotateInboundWebhookUrl } from './api';

const CONNECTOR_ID_SETTLE_MS = 400;
const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const InboundWebhookConnectorFields = ({ isEdit, readOnly }: ActionConnectorFieldsProps) => {
  const { http } = useKibana().services;
  const { setFieldValue } = useFormContext();
  const [{ id, config }] = useFormData({ watch: ['id', 'config.webhookUrl'] });
  const webhookUrl = typeof config?.webhookUrl === 'string' ? config.webhookUrl : undefined;
  const [isRotating, setIsRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | undefined>();
  const requestIdRef = useRef(0);

  useEffect(() => {
    setFieldValue('secrets.authType', 'none');
  }, [setFieldValue]);

  useEffect(() => {
    if (isEdit || readOnly) {
      return;
    }

    const connectorId = typeof id === 'string' ? id.trim() : '';
    if (!connectorId || !CONNECTOR_ID_PATTERN.test(connectorId)) {
      return;
    }

    if (webhookUrl?.includes(`/inboundWebhook/${connectorId}?`)) {
      return;
    }

    if (webhookUrl) {
      setFieldValue('config.webhookUrl', undefined);
      setFieldValue('config.ingestTokenHash', undefined);
    }

    const timer = window.setTimeout(() => {
      const requestId = ++requestIdRef.current;
      setIsRotating(true);
      setRotateError(undefined);

      void rotateInboundWebhookUrl({ http, connectorId })
        .then((credentials) => {
          if (requestId !== requestIdRef.current) {
            return;
          }
          setFieldValue('config.webhookUrl', credentials.webhookUrl);
          setFieldValue('config.ingestTokenHash', credentials.ingestTokenHash);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) {
            return;
          }
          setRotateError(
            i18n.translate('stackConnectors.inboundWebhook.rotateUrlError', {
              defaultMessage:
                'Unable to generate the webhook URL. Check the connector ID and try again.',
            })
          );
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setIsRotating(false);
          }
        });
    }, CONNECTOR_ID_SETTLE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [http, id, isEdit, readOnly, setFieldValue, webhookUrl]);

  return (
    <>
      <UseField path="config.ingestTokenHash" component={HiddenField} />
      <UseField path="config.webhookUrl" component={HiddenField} />
      <UseField path="secrets.authType" component={HiddenField} />
      {webhookUrl ? (
        <>
          <EuiFormRow
            label={i18n.translate('stackConnectors.inboundWebhook.urlLabel', {
              defaultMessage: 'Webhook URL',
            })}
            fullWidth
          >
            <EuiFieldText
              value={webhookUrl}
              readOnly
              fullWidth
              data-test-subj="inboundWebhookUrl"
            />
          </EuiFormRow>
          <EuiSpacer size="s" />
          <EuiCopy textToCopy={webhookUrl}>
            {(copy) => (
              <EuiButton
                size="s"
                iconType="copy"
                onClick={copy}
                disabled={readOnly || isRotating}
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
      ) : (
        <EuiCallOut
          size="s"
          announceOnMount={false}
          color={rotateError ? 'danger' : 'primary'}
          title={
            rotateError ??
            i18n.translate('stackConnectors.inboundWebhook.urlPendingTitle', {
              defaultMessage: 'Webhook URL is generated from the connector ID',
            })
          }
          data-test-subj="inboundWebhookUrlPending"
        >
          {isRotating ? (
            <EuiLoadingSpinner size="m" data-test-subj="inboundWebhookUrlRotating" />
          ) : (
            <FormattedMessage
              id="stackConnectors.inboundWebhook.urlPendingDescription"
              defaultMessage="Enter a connector ID and wait a moment — the URL is minted on the server."
            />
          )}
        </EuiCallOut>
      )}
    </>
  );
};
