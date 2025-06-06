/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// @ts-check
const path = require('path');
const { NodeLibsBrowserPlugin } = require('@kbn/node-libs-browser-webpack-plugin');

/**
 * @typedef {(import('./src/register_globals').LangSpecificWorkerIds)} WorkerType - list of supported languages to build workers for
 */

const getWorkerEntry = (language) => {
  switch (language) {
    case 'default':
      return 'monaco-editor/esm/vs/editor/editor.worker.js';
    case 'json':
      return 'monaco-editor/esm/vs/language/json/json.worker.js';
    default:
      return path.resolve(
        __dirname,
        'src',
        'languages',
        language,
        'worker',
        `${language}.worker.ts`
      );
  }
};

/**
 * @param {WorkerType} languages
 * @returns {import('webpack').Configuration}
 */
const workerConfig = (languages) => ({
  // @ts-expect-error we are unable to type NODE_ENV
  mode: process.env.NODE_ENV || 'development',
  entry: languages.reduce((entries, language) => {
    entries[language] = getWorkerEntry(language);
    return entries;
  }, {}),
  devtool: process.env.NODE_ENV === 'production' ? false : 'cheap-source-map',
  target: 'web',
  output: {
    path: path.resolve(__dirname, 'target_workers'),
    filename: ({ chunk }) => `${chunk.name}.editor.worker.js`,
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    alias: {
      // swap default umd import for the esm one provided in vscode-uri package
      'vscode-uri$': require.resolve('vscode-uri').replace(/\/umd\/index.js/, '/esm/index.mjs'),
    },
  },
  plugins: [new NodeLibsBrowserPlugin()],
  stats: 'errors-only',
  module: {
    rules: [
      {
        test: /\.(jsx?|tsx?)$/,
        exclude: /node_modules(?!\/@kbn\/)(\/[^\/]+\/)/,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            envName: process.env.NODE_ENV || 'development',
            presets: [require.resolve('@kbn/babel-preset/webpack_preset')],
          },
        },
      },
      {
        /**
         * further process the modules exported by monaco-editor and monaco-yaml
         * because their exports leverage some none-standard language APIs at this time.
         */
        test: /(monaco-editor\/esm\/vs\/language|monaco-yaml|vscode-uri)\/.*m?(t|j)sx?$/,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            envName: process.env.NODE_ENV || 'development',
            presets: [require.resolve('@kbn/babel-preset/webpack_preset')],
          },
        },
      },
    ],
  },
});

module.exports = workerConfig(['default', 'json', 'xjson', 'painless', 'yaml', 'console']);
