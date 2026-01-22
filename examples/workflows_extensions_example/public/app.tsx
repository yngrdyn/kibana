/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License v 1".
 */

import React, { useState } from 'react';
import {
  EuiButton,
  EuiPageTemplate,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiCallOut,
  EuiCodeBlock,
  EuiForm,
  EuiFormRow,
  EuiTextArea,
  EuiHorizontalRule,
} from '@elastic/eui';
import type { CoreStart } from '@kbn/core/public';
import { WorkflowErrorTriggerId } from '../common/triggers/workflow_error_trigger';

interface AppProps {
  core: CoreStart;
}

export const App: React.FC<AppProps> = ({ core }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; eventId?: string } | null>(null);
  // Fixed to the only trigger registered in this example app
  const triggerType = WorkflowErrorTriggerId;
  const [payload, setPayload] = useState(
    JSON.stringify(
      {
        workflowId: 'workflow-da65489b-d660-47db-b957-d32de7813029',
        executionId: 'test-execution-123',
        error: 'Test error message',
      },
      null,
      2
    )
  );

  const handleEmitEvent = async () => {
    setLoading(true);
    setResult(null);

    try {
      let parsedPayload: Record<string, any>;
      try {
        parsedPayload = JSON.parse(payload);
      } catch (error) {
        setResult({
          success: false,
          message: `Invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`,
        });
        setLoading(false);
        return;
      }

      const response = await core.http.post<{ eventId: string }>(
        '/internal/workflows_extensions/test/emit_event',
        {
          body: JSON.stringify({
            triggerType,
            payload: parsedPayload,
          }),
        }
      );

      setResult({
        success: true,
        message: 'Event emitted successfully!',
        eventId: response.eventId,
      });
    } catch (error: any) {
      setResult({
        success: false,
        message: error.body?.message || error.message || 'Unknown error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToWorkflows = () => {
    core.application.navigateToApp('workflows');
  };

  const workflowYaml = `name: New workflow
enabled: true
description: This is a new workflow
triggers:
  - type: workflow.error

steps:
  - name: console_payload
    type: console
    with:
      message: "{{ payload.error }}"`;

  return (
    <EuiPageTemplate restrictWidth={true} offset={0}>
      <EuiPageTemplate.Header>
        <EuiTitle size="l">
          <h1>Workflows Extensions Example</h1>
        </EuiTitle>
      </EuiPageTemplate.Header>
      <EuiPageTemplate.Section>
        <EuiText>
          <p>
            This example demonstrates how to emit events that can trigger event-driven workflows.
            Follow the steps below to test event-driven workflows.
          </p>
        </EuiText>

        <EuiSpacer size="xl" />

        <EuiTitle size="m">
          <h2>Step 1: Create a workflow</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText>
          <p>
            Copy the workflow YAML below and create a new workflow in the Workflows application.
            This workflow will be triggered when you emit a <code>workflow.error</code> event.
          </p>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiCodeBlock language="yaml" isCopyable fontSize="m">
          {workflowYaml}
        </EuiCodeBlock>

        <EuiSpacer size="xl" />

        <EuiTitle size="m">
          <h2>Step 2: Emit an event</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText>
          <p>
            Use the form below to emit a test event. The event will trigger any workflows that are
            subscribed to the <code>workflow.error</code> trigger type.
          </p>
        </EuiText>
        <EuiSpacer size="l" />

        <EuiForm component="form">
          <EuiFormRow label="Trigger Type" helpText="The type of trigger to emit (fixed to the registered trigger)">
            <EuiText>
              <code>{triggerType}</code>
            </EuiText>
          </EuiFormRow>

          <EuiSpacer size="m" />

          <EuiFormRow
            label="Event Payload"
            helpText="JSON payload for the event (must match the trigger's event schema)"
            fullWidth
          >
            <EuiTextArea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={10}
              fullWidth
              placeholder='{"workflowId": "...", "executionId": "...", "error": "..."}'
            />
          </EuiFormRow>

          <EuiSpacer size="l" />

          <EuiButton
            onClick={handleEmitEvent}
            isLoading={loading}
            fill
            iconType="play"
            data-test-subj="emitEventButton"
          >
            Emit Event
          </EuiButton>
        </EuiForm>

        {result && (
          <>
            <EuiSpacer size="l" />
            <EuiCallOut
              title={result.success ? 'Success' : 'Error'}
              color={result.success ? 'success' : 'danger'}
              iconType={result.success ? 'check' : 'alert'}
            >
              <p>{result.message}</p>
              {result.eventId && (
                <>
                  <EuiSpacer size="s" />
                  <EuiText size="s">
                    <strong>Event ID:</strong> <code>{result.eventId}</code>
                  </EuiText>
                </>
              )}
            </EuiCallOut>
          </>
        )}

        <EuiSpacer size="xl" />

        <EuiTitle size="m">
          <h2>Step 3: View your workflow execution</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText>
          <p>
            After emitting the event, navigate to the Workflows application to see that your
            workflow was triggered and executed. You can view the execution details, including the
            console output with the error message from the event payload.
          </p>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiButton onClick={handleNavigateToWorkflows} iconType="arrowRight" iconSide="right">
          Go to Workflows
        </EuiButton>

        <EuiSpacer size="xl" />
        <EuiHorizontalRule />
        <EuiSpacer size="xl" />

        <EuiTitle size="m">
          <h2>How it works</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText>
          <p>
            When you click the "Emit Event" button, the event is sent to the server and stored in
            the event store. The event router task will then pick it up and trigger any workflows
            that are subscribed to this trigger type.
          </p>
        </EuiText>

        <EuiSpacer size="m" />

        <EuiCodeBlock language="json" isCopyable>
          {JSON.stringify(
            {
              triggerType: WorkflowErrorTriggerId,
              payload: {
                workflowId: 'workflow-id',
                executionId: 'execution-id',
                error: 'Error message',
              },
            },
            null,
            2
          )}
        </EuiCodeBlock>
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
};
