/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState, useMemo, useCallback } from 'react';

import { EuiFormRow, EuiIconTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { XJsonLang } from '@kbn/monaco';
import { CodeEditor } from '@kbn/code-editor';
import { XJson } from '@kbn/es-ui-shared-plugin/public';

import { AggParamEditorProps } from '../agg_param_props';

function RawJsonParamEditor({
  showValidation,
  value = '',
  setValidity,
  setValue,
  setTouched,
}: AggParamEditorProps<string>) {
  const [isFieldValid, setFieldValidity] = useState(true);

  const editorTooltipText = useMemo(
    () =>
      i18n.translate('visDefaultEditor.controls.jsonInputTooltip', {
        defaultMessage:
          "Any JSON formatted properties you add here will be merged with the elasticsearch aggregation definition for this section. For example 'shard_size' on a terms aggregation.",
      }),
    []
  );

  const jsonEditorLabelText = useMemo(
    () =>
      i18n.translate('visDefaultEditor.controls.jsonInputLabel', {
        defaultMessage: 'JSON input',
      }),
    []
  );

  const label = useMemo(
    () => (
      <>
        {jsonEditorLabelText}{' '}
        <EuiIconTip position="right" content={editorTooltipText} type="question" />
      </>
    ),
    [jsonEditorLabelText, editorTooltipText]
  );

  const onChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      // validation for value
      let isJsonValid = true;
      try {
        if (newValue) {
          JSON.parse(XJson.collapseLiteralStrings(newValue));
        }
      } catch (e) {
        isJsonValid = false;
      }
      setFieldValidity(isJsonValid);
      setValidity(isJsonValid);
    },
    [setValidity, setFieldValidity, setValue]
  );

  return (
    <EuiFormRow
      label={label}
      isInvalid={showValidation ? !isFieldValid : false}
      fullWidth={true}
      display="rowCompressed"
      onBlur={setTouched}
    >
      <>
        <CodeEditor
          aria-label={jsonEditorLabelText}
          aria-describedby="jsonEditorDescription"
          languageId={XJsonLang.ID}
          languageConfiguration={{
            autoClosingPairs: [
              {
                open: '{',
                close: '}',
              },
            ],
          }}
          width="100%"
          height="250px"
          value={value}
          onChange={onChange}
          options={{
            renderValidationDecorations: value ? 'on' : 'off',
            lineNumbers: 'on',
            fontSize: 14,
            minimap: {
              enabled: false,
            },
            scrollBeyondLastLine: false,
            folding: true,
            wordWrap: 'on',
            wrappingIndent: 'indent',
            automaticLayout: true,
          }}
        />
      </>
    </EuiFormRow>
  );
}

export { RawJsonParamEditor };
