/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiCallOut,
  EuiConfirmModal,
  EuiCopy,
  EuiFieldText,
  EuiFormRow,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  useGeneratedHtmlId,
} from '@elastic/eui';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HiddenField } from '@kbn/es-ui-shared-plugin/static/forms/components';
import {
  UseField,
  useFormContext,
  useFormData,
} from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import {
  buildConnectorIngressEventsPath,
  INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
} from '@kbn/connector-specs';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ActionConnectorFieldsProps } from '@kbn/triggers-actions-ui-plugin/public';
import { useKibana } from '@kbn/triggers-actions-ui-plugin/public';

import { rotateConnectorIngressUrl } from './api';

const CONNECTOR_ID_SETTLE_MS = 400;
const CONNECTOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const InboundWebhookConnectorFields = ({ isEdit, readOnly }: ActionConnectorFieldsProps) => {
  const { http } = useKibana().services;
  const { setFieldValue } = useFormContext();
  const [{ id, config }] = useFormData({ watch: ['id', 'config.webhookUrl'] });
  const webhookUrl = typeof config?.webhookUrl === 'string' ? config.webhookUrl : undefined;
  const [isRotating, setIsRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | undefined>();
  const [rotateSuccess, setRotateSuccess] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const requestIdRef = useRef(0);
  const rotateConfirmTitleId = useGeneratedHtmlId();

  useEffect(() => {
    setFieldValue('secrets.authType', 'none');
  }, [setFieldValue]);

  const mintIngressUrl = useCallback(
    (connectorId: string) => {
      const requestId = ++requestIdRef.current;
      setIsRotating(true);
      setRotateError(undefined);
      setRotateSuccess(false);

      return rotateConnectorIngressUrl({
        http,
        connectorId,
        connectorTypeId: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
      })
        .then((credentials) => {
          if (requestId !== requestIdRef.current) {
            return;
          }
          setFieldValue('config.webhookUrl', credentials.webhookUrl);
          setFieldValue('config.ingestTokenHash', credentials.ingestTokenHash);
          if (isEdit) {
            setRotateSuccess(true);
          }
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
    },
    [http, isEdit, setFieldValue]
  );

  useEffect(() => {
    if (isEdit || readOnly) {
      return;
    }

    const connectorId = typeof id === 'string' ? id.trim() : '';
    if (!connectorId || !CONNECTOR_ID_PATTERN.test(connectorId)) {
      return;
    }

    if (
      webhookUrl?.includes(
        `${buildConnectorIngressEventsPath({
          connectorTypeId: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
          connectorId,
        })}?`
      )
    ) {
      return;
    }

    if (webhookUrl) {
      setFieldValue('config.webhookUrl', undefined);
      setFieldValue('config.ingestTokenHash', undefined);
    }

    const timer = window.setTimeout(() => {
      void mintIngressUrl(connectorId);
    }, CONNECTOR_ID_SETTLE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [id, isEdit, mintIngressUrl, readOnly, setFieldValue, webhookUrl]);

  const handleConfirmRotate = useCallback(() => {
    setShowRotateConfirm(false);
    const connectorId = typeof id === 'string' ? id.trim() : '';
    if (!connectorId) {
      return;
    }
    void mintIngressUrl(connectorId);
  }, [id, mintIngressUrl]);

  const renderWebhookUrlField = (url: string) => (
    <>
      <EuiFormRow
        label={i18n.translate('stackConnectors.inboundWebhook.urlLabel', {
          defaultMessage: 'Webhook URL',
        })}
        fullWidth
      >
        <EuiFieldText value={url} readOnly fullWidth data-test-subj="inboundWebhookUrl" />
      </EuiFormRow>
      <EuiSpacer size="s" />
      <EuiCopy textToCopy={url}>
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
  );

  const hiddenFields = (
    <>
      <UseField path="config.ingestTokenHash" component={HiddenField} />
      <UseField path="config.webhookUrl" component={HiddenField} />
      <UseField path="secrets.authType" component={HiddenField} />
    </>
  );

  if (isEdit) {
    const showRotatedUrl = rotateSuccess && Boolean(webhookUrl);

    return (
      <>
        {hiddenFields}
        {showRotatedUrl && webhookUrl ? (
          <>
            {renderWebhookUrlField(webhookUrl)}
            <EuiSpacer size="s" />
            <EuiCallOut
              size="s"
              announceOnMount
              color="success"
              title={i18n.translate('stackConnectors.inboundWebhook.rotateUrlSuccess', {
                defaultMessage: 'Webhook URL rotated. Save the connector to apply the new URL.',
              })}
              data-test-subj="inboundWebhookRotateSuccess"
            />
          </>
        ) : (
          <EuiFormRow
            label={i18n.translate('stackConnectors.inboundWebhook.urlLabel', {
              defaultMessage: 'Webhook URL',
            })}
            fullWidth
          >
            <EuiText size="s" color="subdued" data-test-subj="inboundWebhookUrlHidden">
              <p>
                <FormattedMessage
                  id="stackConnectors.inboundWebhook.urlHiddenDescription"
                  defaultMessage="The webhook URL is only shown when the connector is created. Rotate to generate a new URL and save the connector to apply it."
                />
              </p>
            </EuiText>
          </EuiFormRow>
        )}
        {rotateError ? (
          <>
            <EuiSpacer size="s" />
            <EuiCallOut
              size="s"
              announceOnMount
              color="danger"
              title={rotateError}
              data-test-subj="inboundWebhookRotateError"
            />
          </>
        ) : null}
        {!showRotatedUrl ? (
          <>
            <EuiSpacer size="s" />
            <EuiButton
              size="s"
              iconType="refresh"
              onClick={() => setShowRotateConfirm(true)}
              disabled={readOnly || isRotating}
              isLoading={isRotating}
              data-test-subj="rotateInboundWebhookUrl"
            >
              <FormattedMessage
                id="stackConnectors.inboundWebhook.rotateUrlButtonLabel"
                defaultMessage="Rotate webhook URL"
              />
            </EuiButton>
            {showRotateConfirm ? (
              <EuiConfirmModal
                aria-labelledby={rotateConfirmTitleId}
                titleProps={{ id: rotateConfirmTitleId }}
                title={i18n.translate('stackConnectors.inboundWebhook.rotateUrlConfirmTitle', {
                  defaultMessage: 'Rotate webhook URL?',
                })}
                onCancel={() => setShowRotateConfirm(false)}
                onConfirm={handleConfirmRotate}
                cancelButtonText={i18n.translate('stackConnectors.inboundWebhook.rotateUrlCancel', {
                  defaultMessage: 'Cancel',
                })}
                confirmButtonText={i18n.translate(
                  'stackConnectors.inboundWebhook.rotateUrlConfirm',
                  {
                    defaultMessage: 'Rotate URL',
                  }
                )}
                buttonColor="danger"
                data-test-subj="rotateInboundWebhookUrlConfirm"
              >
                <p>
                  <FormattedMessage
                    id="stackConnectors.inboundWebhook.rotateUrlConfirmBody"
                    defaultMessage="This invalidates the current webhook URL. External systems using the old URL will stop working until you update them with the new URL after saving."
                  />
                </p>
              </EuiConfirmModal>
            ) : null}
          </>
        ) : null}
      </>
    );
  }

  return (
    <>
      {hiddenFields}
      {webhookUrl ? (
        renderWebhookUrlField(webhookUrl)
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
