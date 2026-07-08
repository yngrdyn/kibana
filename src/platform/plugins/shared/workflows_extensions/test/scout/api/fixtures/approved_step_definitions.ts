/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * APPROVED STEP DEFINITIONS
 *
 * This list must be kept up-to-date with all registered step definitions.
 * When a new step is registered, developers must:
 * 1. Add the step ID and definition hash to this list (alphabetically sorted)
 * 2. Get approval from the workflows-eng team
 *
 * If the step definition changes, the definition hash must be updated, and get the approval again.
 *
 * Example of an approved step definition entry:
 * {
 *   id: 'example.setVariable',
 *   definitionHash: '3af06ca579302a96b18923de3ce7d04433519528e6eec309cb8a937be6514cda',
 * },
 */
export const APPROVED_STEP_DEFINITIONS: Array<{ id: string; definitionHash: string }> = [
  {
    id: 'ai.agent',
    definitionHash: 'eb7dc95f4ed0ed0151051c77827c71d45ec4f17d22efff73d43f4e9f5741a2ee',
  },
  {
    id: 'ai.classify',
    definitionHash: '544ebbf2b32840510958ced5ddc6109712a11b260ab22d13fa8c83d5265aa481',
  },
  {
    id: 'ai.prompt',
    definitionHash: 'a9315bd19fcf4c2ac4d05f652a52bc1c8073b9a7d2dd289a69bedabb827f3249',
  },
  {
    id: 'ai.summarize',
    definitionHash: 'aa1db14ff6af424a3f66f5528e18c7b8d1f462ca8ba8e6feb01221e6fa1518ea',
  },
  {
    id: 'data.aggregate',
    definitionHash: '0223bec699354d5878732a6ebcb99a2b4b43a28b4f01da293df1ab7165c33e00',
  },
  {
    id: 'data.concat',
    definitionHash: '611abd1e703d35528dd7dae76aa178aec0b02201a3a8cb26156ee9d9f03baa13',
  },
  {
    id: 'data.dedupe',
    definitionHash: '16c3b3d67e68e77e66ed68869790a4388423a5b4b5aa8a194035f3ff52192836',
  },
  {
    id: 'data.filter',
    definitionHash: '829a245561a33b2f8349755a4ff6b4a2953774b6f862a7a0228b93f517742c9a',
  },
  {
    id: 'data.find',
    definitionHash: 'b23058c153f427b8a8cb4a9ee1ed8c06881e3d2ed291ea7e78846e113aa0301d',
  },
  {
    id: 'data.map',
    definitionHash: '79ddef521ebd6ae8278e5d9034b7005687e31c2e949796add213eff2ebd21d82',
  },
  {
    id: 'data.parseJson',
    definitionHash: 'f1de4bd3d12fc65492d01d59dc63af5df68f23031376b9f78738ecda2fb2067c',
  },
  {
    id: 'data.regexExtract',
    definitionHash: 'ab7b47758fa93b773f537351149845c8b60c22ae10efd0e1c592406170bb3cb6',
  },
  {
    id: 'data.regexReplace',
    definitionHash: '95c4970a0154de57472d394bc05514c6dcc483b74abb008b2950a5816398aaae',
  },
  {
    id: 'data.stringifyJson',
    definitionHash: '827bdbb31e4e493bc7746809a6e32f9d9248a05e7d1810a39c5db9a0fe1970ca',
  },
  {
    id: 'search.rerank',
    definitionHash: '2bdde599ac1b8f38faecbd72a2d17a3d7b2740b874e047e92e9c30ba0ff01a4f',
  },
  {
    id: 'cases.addAlerts',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.addComment',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.addEvents',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.addObservables',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.addTags',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.assignCase',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.closeCase',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.createCase',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.createCaseFromTemplate',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.deleteCases',
    definitionHash: 'a18a2e1090962d85c945b12e16d13b53d21d08ad1dde449194f5e735d3cd7946',
  },
  {
    id: 'cases.deleteObservable',
    definitionHash: '0222a4609fe11df28447a5e4637db381ffdc5818a47ae34b3ff54ec8c0ef56e5',
  },
  {
    id: 'cases.findCases',
    definitionHash: '61ec2695a6ddba397c05b3845e9dbd3c66f9b299ed8568b8f4e7f3c187ff1c73',
  },
  {
    id: 'cases.findSimilarCases',
    definitionHash: '647032606a8724390063eb7f093e84360b65ff6e44eecaa74222d7c557dfde02',
  },
  {
    id: 'cases.getAllAttachments',
    definitionHash: '457c9c81535a0207aade08cf2bcc9f7a354f5760307da976ae8faca2d43338ee',
  },
  {
    id: 'cases.getCase',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.getCases',
    definitionHash: 'f5bb45aa044adfd07898a0ecd172f49d3d7580ca75a6c7fe5261487c6c6ae9e3',
  },
  {
    id: 'cases.getCasesByAlertId',
    definitionHash: 'e2b50fd7bbbb6122db65f3a52ed78a4c24cb10304abf3927c69288ebb0f75fa7',
  },
  {
    id: 'cases.setCategory',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.setCustomField',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.setDescription',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.setSeverity',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.setStatus',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.setTitle',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.unassignCase',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.updateCase',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
  {
    id: 'cases.updateCases',
    definitionHash: '3ae63ce68db19a0ac7a7e6ccaba5807269c4ec035c37acf204713ae100048932',
  },
  {
    id: 'cases.updateObservable',
    definitionHash: '1704c6d46ccb5432e1df6c24f7ebde8d4b1686c007dcaf6a5c5cac02b0222e3e',
  },
];
