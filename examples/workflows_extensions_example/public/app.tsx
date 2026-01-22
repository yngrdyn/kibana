/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License v 1".
 */

import React, { useState, useMemo } from 'react';
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
  EuiSteps,
  type EuiStepProps,
} from '@elastic/eui';
import type { CoreStart } from '@kbn/core/public';
import { isTerminalStatus, ExecutionStatus } from '@kbn/workflows';
import { ExampleTriggerId } from '../common/triggers/event_example_trigger';

interface AppProps {
  core: CoreStart;
}

export const App: React.FC<AppProps> = ({ core }) => {
  const [loading, setLoading] = useState(false);
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; eventId?: string; executionId?: string; executionStatus?: ExecutionStatus } | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowCreationResult, setWorkflowCreationResult] = useState<{ success: boolean; message: string; workflowId?: string } | null>(null);
  // Fixed to the only trigger registered in this example app
  const triggerType = ExampleTriggerId;
  const [payload, setPayload] = useState(
    JSON.stringify(
      {
        workflowId: '',
        message: 'Test message',
        type: 'custom',
      },
      null,
      2
    )
  );

  const handleCreateWorkflow = async () => {
    setCreatingWorkflow(true);
    setWorkflowCreationResult(null);

    try {
      const response = await core.http.post<{ id: string; name: string }>(
        '/api/workflows',
        {
          body: JSON.stringify({
            yaml: workflowYaml,
          }),
        }
      );

      setWorkflowId(response.id);
      setWorkflowCreationResult({
        success: true,
        message: `Workflow "${response.name}" created successfully!`,
        workflowId: response.id,
      });

      // Update payload with the new workflow ID
      try {
        const parsedPayload = JSON.parse(payload);
        parsedPayload.workflowId = response.id;
        setPayload(JSON.stringify(parsedPayload, null, 2));
      } catch {
        // If payload is invalid, set a new one
        setPayload(
          JSON.stringify(
            {
              workflowId: response.id,
              message: 'Test message',
              type: 'test',
            },
            null,
            2
          )
        );
      }
    } catch (error: any) {
      setWorkflowCreationResult({
        success: false,
        message: error.body?.message || error.message || 'Unknown error occurred',
      });
    } finally {
      setCreatingWorkflow(false);
    }
  };

  const handleEmitEvent = async () => {
    if (!workflowId) {
      setResult({
        success: false,
        message: 'Please create a workflow first in Step 1.',
      });
      return;
    }

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
        '/internal/workflowsExtensionsExample/emit_event',
        {
          body: JSON.stringify({
            triggerType,
            payload: parsedPayload,
          }),
        }
      );

      // Poll for the execution (it's created asynchronously)
      let executionId: string | undefined;
      let executionStatus: ExecutionStatus | undefined;
      const maxAttempts = 30; // Increased for waiting for completion
      const delay = 1000; // 1 second

      // First, find the execution ID
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        
        try {
          const executionsResponse = await core.http.get<{ results: Array<{ id: string }> }>(
            '/api/workflowExecutions',
            {
              query: {
                workflowId,
                page: 1,
                size: 1,
              },
            }
          );

          if (executionsResponse.results && executionsResponse.results.length > 0) {
            executionId = executionsResponse.results[0].id;
            break;
          }
        } catch {
          // Continue polling
        }
      }

      // Then, poll for execution completion
      if (executionId) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          
          try {
            const executionResponse = await core.http.get<{ id: string; status: ExecutionStatus }>(
              `/api/workflowExecutions/${executionId}`
            );

            if (executionResponse && executionResponse.status) {
              executionStatus = executionResponse.status;
              
              // Check if execution has reached a terminal status
              if (isTerminalStatus(executionStatus)) {
                break;
              }
            }
          } catch {
            // Continue polling
          }
        }
      }

      const statusMessage = executionStatus 
        ? `Execution ${executionStatus === ExecutionStatus.COMPLETED ? 'completed' : executionStatus === ExecutionStatus.FAILED ? 'failed' : 'ended'} with status: ${executionStatus}`
        : 'Event emitted successfully!';

      setResult({
        success: true,
        message: statusMessage,
        eventId: response.eventId,
        executionId,
        executionStatus,
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

  const handleNavigateToWorkflowExecution = () => {
    if (workflowId && result?.executionId) {
      core.application.navigateToApp('workflows', {
        path: `/${workflowId}?executionId=${result.executionId}&tab=executions`,
        openInNewTab: true,
      });
    } else if (workflowId) {
      core.application.navigateToApp('workflows', {
        path: `/${workflowId}?tab=executions`,
        openInNewTab: true,
      });
    } else {
      core.application.navigateToApp('workflows', {
        openInNewTab: true,
      });
    }
  };

  const workflowYaml = `name: New workflow
enabled: true
description: This is a new workflow
triggers:
  - type: event.example
    where: 'event.type:"custom"'

steps:
  - name: console_payload
    type: console
    with:
      message: "{{ event.message }} from workflow {{ event.workflowId }} with type {{ event.type }}"`;

  // Determine step statuses
  const step1Status: EuiStepProps['status'] = workflowId
    ? 'complete'
    : creatingWorkflow
    ? 'loading'
    : workflowCreationResult && !workflowCreationResult.success
    ? 'danger'
    : 'current';

  const step2Status: EuiStepProps['status'] = !workflowId
    ? 'incomplete'
    : result?.success
    ? 'complete'
    : loading
    ? 'loading'
    : result && !result.success
    ? 'danger'
    : 'current';

  const step3Status: EuiStepProps['status'] = !workflowId || !result?.success
    ? 'incomplete'
    : result?.executionId
    ? 'complete'
    : 'current';

  // Determine which step is current (not complete, not disabled, not loading, not danger)
  // Note: Steps are open by default (show content), and close when they become 'complete'
  // The last step (step 3) always remains open even when complete
  const currentStepIndex = useMemo(() => {
    if (step1Status === 'current' || step1Status === 'loading' || step1Status === 'danger') return 0;
    if (step2Status === 'current' || step2Status === 'loading' || step2Status === 'danger') return 1;
    if (step3Status === 'current') return 2;
    return -1; // All steps are complete
  }, [step1Status, step2Status, step3Status]);

  const steps: EuiStepProps[] = useMemo(
    () => [
      {
        title: 'Create a workflow',
        status: step1Status,
        children: step1Status === 'complete' ? null : (
          <>
            <EuiText>
              <p>
                Click the button below to create a new workflow. This workflow will be triggered when you emit a{' '}
                <code>event.example</code> event.
              </p>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiCodeBlock language="yaml" isCopyable fontSize="m">
              {workflowYaml}
            </EuiCodeBlock>
            <EuiSpacer size="m" />
            <EuiButton
              onClick={handleCreateWorkflow}
              isLoading={creatingWorkflow}
              fill
              iconType="plus"
              data-test-subj="createWorkflowButton"
              disabled={!!workflowId}
            >
              {workflowId ? 'Workflow Created' : 'Create Workflow'}
            </EuiButton>
            {workflowCreationResult && (
              <>
                <EuiSpacer size="m" />
                <EuiCallOut
                  title={workflowCreationResult.success ? 'Success' : 'Error'}
                  color={workflowCreationResult.success ? 'success' : 'danger'}
                  iconType={workflowCreationResult.success ? 'check' : 'alert'}
                >
                  <p>{workflowCreationResult.message}</p>
                  {workflowCreationResult.workflowId && (
                    <>
                      <EuiSpacer size="s" />
                      <EuiText size="s">
                        <strong>Workflow ID:</strong> <code>{workflowCreationResult.workflowId}</code>
                      </EuiText>
                    </>
                  )}
                </EuiCallOut>
              </>
            )}
          </>
        ),
      },
      {
        title: 'Emit an event',
        status: step2Status,
        children: (
          <>
            <EuiText>
              <p>
                Use the form below to emit a test event. The event will trigger any workflows that are subscribed to the{' '}
                <code>event.example</code> trigger type.
              </p>
            </EuiText>
            <EuiSpacer size="l" />
            <EuiForm component="form">
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
                  placeholder='{"workflowId": "...", "message": "...", "type": "..."}'
                />
              </EuiFormRow>
              <EuiSpacer size="l" />
              <EuiButton
                onClick={handleEmitEvent}
                isLoading={loading}
                fill
                iconType="play"
                data-test-subj="emitEventButton"
                disabled={!workflowId}
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
          </>
        ),
      },
      {
        title: 'View your workflow execution',
        status: step3Status,
        children: (
          <>
            <EuiText>
              <p>
                After emitting the event, click the button below to navigate to the workflow execution. You can view the
                execution details, including the console output with the message from the event payload.
              </p>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiButton
              onClick={handleNavigateToWorkflowExecution}
              iconType="arrowRight"
              iconSide="right"
              disabled={!workflowId || !result?.success}
              fill
            >
              {result?.executionId ? 'View Workflow Execution' : 'Go to Workflow Executions'}
            </EuiButton>
            {result?.executionId && (
              <>
                <EuiSpacer size="s" />
                <EuiText size="s" color="subdued">
                  Execution ID: <code>{result.executionId}</code>
                </EuiText>
              </>
            )}
          </>
        ),
      },
    ],
    [
      step1Status,
      step2Status,
      step3Status,
      currentStepIndex,
      workflowId,
      creatingWorkflow,
      workflowCreationResult,
      workflowYaml,
      triggerType,
      payload,
      loading,
      result,
      handleCreateWorkflow,
      handleEmitEvent,
      handleNavigateToWorkflowExecution,
    ]
  );

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
            This example demonstrates how to emit events that can trigger event-driven workflows. Follow the steps below
            to test event-driven workflows.
          </p>
        </EuiText>

        <EuiSpacer size="xl" />

        <EuiSteps steps={steps} />
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
};
