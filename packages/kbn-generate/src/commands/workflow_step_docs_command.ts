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
  'docs/reference/workflows/_snippets/step-definitions-list.md'
);

const DEFAULT_KIBANA_URL = 'http://localhost:5601';
const DEFAULT_KIBANA_AUTH = 'elastic:changeme';

const STEP_DEFINITIONS_PATH = '/internal/workflows_extensions/step_definitions';

interface StepDocMetadata {
  details?: string;
  examples?: string[];
}

interface SchemaProperty {
  name: string;
  required: boolean;
  type: string;
  description?: string;
}

interface StepDefinitionResponseItem {
  id: string;
  handlerHash: string;
  label?: string;
  description?: string;
  documentation?: StepDocMetadata;
  input?: SchemaProperty[];
  config?: SchemaProperty[];
  output?: SchemaProperty[];
}

interface StepDefinitionsResponse {
  steps: StepDefinitionResponseItem[];
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

async function fetchStepDefinitions(
  url: string,
  authHeader: string
): Promise<StepDefinitionsResponse> {
  const fullUrl = `${url.replace(/\/$/, '')}${STEP_DEFINITIONS_PATH}`;
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
      `GET ${fullUrl} failed: ${response.status} ${response.statusText}. Ensure Kibana is running and a page that loads the workflows app has been opened so step doc metadata is pushed.`
    );
  }

  const body = (await response.json()) as unknown;
  if (typeof body !== 'object' || body === null || !('steps' in body)) {
    throw new Error(`Unexpected response shape: expected { steps: [...] }`);
  }
  const steps = (body as { steps: unknown }).steps;
  if (!Array.isArray(steps)) {
    throw new Error(`Response "steps" must be an array`);
  }
  return { steps };
}

/**
 * Strip one leading markdown heading line from details and demote all other headings by one level,
 * so they nest correctly under our "## ${label}" section (e.g. ## in details becomes ###).
 */
function normalizeDetailsHeadings(details: string): string {
  const trimmed = details.trimStart();
  const firstLineMatch = trimmed.match(/^#+\s+.+$/m);
  let body: string;
  if (firstLineMatch) {
    const newlineIndex = trimmed.indexOf('\n');
    if (newlineIndex >= 0) {
      body = trimmed.slice(newlineIndex + 1).trimStart();
    } else {
      body = '';
    }
  } else {
    body = trimmed;
  }
  // Demote every remaining heading by one level (## -> ###, ### -> ####; max 6 #).
  return body.replace(/^(#+)(\s)/gm, (_, hashes, space) =>
    hashes.length >= 6 ? hashes + space : hashes + '#' + space
  );
}

/**
 * Remove the "Configuration" subsection from details when we render our own Configuration table,
 * so we don't show both the table and the prose block (e.g. "arrays (required): ...").
 */
function stripConfigurationSection(details: string): string {
  const configHeading = /^#{2,6}\s+Configuration\s*$/m;
  const match = details.match(configHeading);
  if (!match || match.index === undefined) {
    return details;
  }
  const start = match.index;
  const afterHeading = details.slice(start + match[0].length);
  const nextHeading = afterHeading.match(/\n(#{2,6}\s+)/m);
  const endOfSection = nextHeading && nextHeading.index !== undefined
    ? start + match[0].length + nextHeading.index
    : details.length;
  const before = details.slice(0, start).trimEnd();
  const after = details.slice(endOfSection).trimStart();
  return [before, after].filter(Boolean).join('\n\n');
}

function renderPropertyTable(properties: SchemaProperty[], title: string): string[] {
  const hasDescriptions = properties.some((p) => p.description);
  const header = hasDescriptions
    ? '| Property | Type | Required | Description |'
    : '| Property | Type | Required |';
  const separator = hasDescriptions ? '| --- | --- | --- | --- |' : '| --- | --- | --- |';
  const lines: string[] = [`### ${title}`, '', header, separator];
  for (const p of properties) {
    const required = p.required ? 'Yes' : 'Optional';
    const desc = p.description ?? '';
    if (hasDescriptions) {
      lines.push(`| \`${p.name}\` | ${p.type} | ${required} | ${desc} |`);
    } else {
      lines.push(`| \`${p.name}\` | ${p.type} | ${required} |`);
    }
  }
  lines.push('');
  return lines;
}

function renderStepSection(step: StepDefinitionResponseItem): string {
  const label = step.label ?? step.id;
  const description = step.description ?? '';
  const rawDetails = step.documentation?.details ?? description;
  let details = normalizeDetailsHeadings(rawDetails);
  if (step.config !== undefined && step.config.length > 0) {
    details = stripConfigurationSection(details);
  }
  const examples = step.documentation?.examples ?? [];

  const lines: string[] = [`## ${label}`, '', details, ''];

  if (step.input !== undefined && step.input.length > 0) {
    lines.push(...renderPropertyTable(step.input, 'Input'));
  }

  if (step.config !== undefined && step.config.length > 0) {
    lines.push(...renderPropertyTable(step.config, 'Configuration'));
  }

  if (step.output !== undefined && step.output.length > 0) {
    lines.push(...renderPropertyTable(step.output, 'Output'));
  }

  if (examples.length > 0) {
    lines.push('### Examples', '');
    for (const example of examples) {
      const marked = example.trim().replace(/^## /gm, '#### ');
      lines.push(marked, '');
    }
  }

  return lines.join('\n');
}

function renderDocument(steps: StepDefinitionResponseItem[]): string {
  const header = '<!-- To regenerate, run: node scripts/generate workflow-step-docs -->';
  const intro =
    'Workflow steps are the building blocks of a workflow. The following step types are available:';

  const sorted = [...steps].sort((a, b) => {
    const labelA = a.label ?? a.id;
    const labelB = b.label ?? b.id;
    const byLabel = labelA.localeCompare(labelB, 'en');
    return byLabel !== 0 ? byLabel : a.id.localeCompare(b.id, 'en');
  });

  const bulletLines = sorted.map((s) => {
    const label = s.label ?? s.id;
    const desc = s.description ?? 'No description.';
    return `- **${label}** (\`${s.id}\`): ${desc}`;
  });

  const sections = sorted.map(renderStepSection);

  return [
    header,
    '',
    '# Workflow steps',
    '',
    intro,
    '',
    ...bulletLines,
    '',
    ...sections,
  ].join('\n');
}

export const WorkflowStepDocsCommand: GenerateCommand = {
  name: 'workflow-step-docs',
  description:
    'Generate workflow step definitions doc. Requires Kibana running and the workflows app to have been loaded at least once so step doc metadata is pushed.',
  usage: 'node scripts/generate workflow-step-docs',
  async run({ log }) {
    const url = getKibanaUrl();
    const auth = getKibanaAuth();
    const authHeader = getAuthHeader(auth);

    log.info(`Fetching step definitions from ${url}${STEP_DEFINITIONS_PATH} ...`);
    const { steps } = await fetchStepDefinitions(url, authHeader);
    log.info(`Got ${steps.length} step(s).`);

    const markdown = renderDocument(steps);

    await Fsp.mkdir(Path.dirname(OUTPUT_FILE), { recursive: true });
    await Fsp.writeFile(OUTPUT_FILE, markdown, 'utf8');

    log.success(`Wrote ${Path.relative(REPO_ROOT, OUTPUT_FILE)}`);
  },
};
