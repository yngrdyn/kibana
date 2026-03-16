/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Fsp from 'fs/promises';
import Path from 'path';

import { REPO_ROOT } from '@kbn/repo-info';

import type { GenerateCommand } from '../generate_command';

const OUTPUT_FILE = Path.resolve(
  REPO_ROOT,
  'docs/reference/workflows/_snippets/trigger-definitions-list.md'
);

const DEFAULT_KIBANA_URL = 'http://localhost:5601';
const DEFAULT_KIBANA_AUTH = 'elastic:changeme';

const TRIGGER_DEFINITIONS_PATH = '/internal/workflows_extensions/trigger_definitions';

interface TriggerDocMetadata {
  details?: string;
  examples?: string[];
}

interface TriggerSnippets {
  condition?: string;
}

interface EventPayloadProperty {
  name: string;
  required: boolean;
  type: string;
  description?: string;
}

interface TriggerDefinitionResponseItem {
  id: string;
  schemaHash: string;
  title?: string;
  description?: string;
  documentation?: TriggerDocMetadata;
  snippets?: TriggerSnippets;
  eventPayload?: EventPayloadProperty[];
}

interface TriggerDefinitionsResponse {
  triggers: TriggerDefinitionResponseItem[];
}

function getKibanaUrl(): string {
  return process.env.KIBANA_URL ?? DEFAULT_KIBANA_URL;
}

function getKibanaAuth(): string {
  return process.env.KIBANA_AUTH ?? DEFAULT_KIBANA_AUTH;
}

function getAuthHeader(auth: string): string {
  const encoded = Buffer.from(auth, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

async function fetchTriggerDefinitions(
  url: string,
  authHeader: string
): Promise<TriggerDefinitionsResponse> {
  const fullUrl = `${url.replace(/\/$/, '')}${TRIGGER_DEFINITIONS_PATH}`;
  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'kbn-xsrf': 'true',
      'x-elastic-internal-origin': 'Kibana',
    },
  });

  if (!response.ok) {
    throw new Error(
      `GET ${fullUrl} failed: ${response.status} ${response.statusText}. Ensure Kibana is running and a page that loads the workflows app has been opened so trigger doc metadata is pushed.`
    );
  }

  const body = (await response.json()) as unknown;
  if (typeof body !== 'object' || body === null || !('triggers' in body)) {
    throw new Error(`Unexpected response shape: expected { triggers: [...] }`);
  }
  const triggers = (body as { triggers: unknown }).triggers;
  if (!Array.isArray(triggers)) {
    throw new Error(`Response "triggers" must be an array`);
  }
  return { triggers };
}

function renderTriggerSection(trigger: TriggerDefinitionResponseItem): string {
  const title = trigger.title ?? trigger.id;
  const description = trigger.description ?? '';
  const details = trigger.documentation?.details ?? description;
  const examples = trigger.documentation?.examples ?? [];
  const condition = trigger.snippets?.condition;

  const lines: string[] = [`## ${title}`, '', details, ''];

  const eventPayload = trigger.eventPayload;
  if (eventPayload !== undefined && eventPayload.length > 0) {
    const hasDescriptions = eventPayload.some((p) => p.description);
    lines.push('### Event payload', '');
    const header = hasDescriptions
      ? '| Property | Type | Required | Description |'
      : '| Property | Type | Required |';
    const separator = hasDescriptions ? '| --- | --- | --- | --- |' : '| --- | --- | --- |';
    lines.push(header, separator);
    for (const p of eventPayload) {
      const required = p.required ? 'Yes' : 'Optional';
      const desc = p.description ?? '';
      if (hasDescriptions) {
        lines.push(`| \`${p.name}\` | ${p.type} | ${required} | ${desc} |`);
      } else {
        lines.push(`| \`${p.name}\` | ${p.type} | ${required} |`);
      }
    }
    lines.push('');
  }

  const hasCondition = condition !== undefined && condition !== '';

  if (hasCondition) {
    lines.push(
      '### Minimal configuration',
      '',
      `When using \`${trigger.id}\`, we recommend using the following minimal configuration:`,
      '',
      '```yaml',
      `triggers:`,
      `  - type: ${trigger.id}`,
      `    on:`,
      `      condition: '${condition.replace(/'/g, "''")}'`,
      '```',
      ''
    );
  }

  if (examples.length > 0) {
    lines.push('### Examples', '');
    for (const example of examples) {
      // Demote example headings (## → ####) so each example is a subsection of "### Examples".
      const marked = example.trim().replace(/^## /gm, '#### ');
      lines.push(marked, '');
    }
  }

  return lines.join('\n');
}

function renderDocument(triggers: TriggerDefinitionResponseItem[]): string {
  const header = '<!-- To regenerate, run: node scripts/generate workflow-trigger-docs -->';
  const intro =
    'Event-driven triggers start a workflow when an event is emitted. The following triggers are available:';

  const sorted = [...triggers].sort((a, b) => a.id.localeCompare(b.id, 'en'));

  const bulletLines = sorted.map((t) => {
    const title = t.title ?? t.id;
    const desc = t.description ?? 'No description.';
    return `- **${title}** (\`${t.id}\`): ${desc}`;
  });

  // Render a section for every trigger so we always show event payload (and snippet/examples when present),
  // even when doc metadata (title/description) was not pushed by the client.
  const sections = sorted.map(renderTriggerSection);

  return [
    header,
    '',
    '# Event-driven triggers',
    '',
    intro,
    '',
    ...bulletLines,
    '',
    ...sections,
  ].join('\n');
}

export const WorkflowTriggerDocsCommand: GenerateCommand = {
  name: 'workflow-trigger-docs',
  description:
    'Generate workflow trigger definitions doc. Requires Kibana running and the workflows app to have been loaded at least once so trigger doc metadata is pushed.',
  usage: 'node scripts/generate workflow-trigger-docs',
  async run({ log }) {
    const url = getKibanaUrl();
    const auth = getKibanaAuth();
    const authHeader = getAuthHeader(auth);

    log.info(`Fetching trigger definitions from ${url}${TRIGGER_DEFINITIONS_PATH} ...`);
    const { triggers } = await fetchTriggerDefinitions(url, authHeader);
    log.info(`Got ${triggers.length} trigger(s).`);

    const markdown = renderDocument(triggers);

    await Fsp.mkdir(Path.dirname(OUTPUT_FILE), { recursive: true });
    await Fsp.writeFile(OUTPUT_FILE, markdown, 'utf8');

    log.success(`Wrote ${Path.relative(REPO_ROOT, OUTPUT_FILE)}`);
  },
};
