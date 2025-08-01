/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { CSSProperties, Dispatch } from 'react';
import { debounce, range } from 'lodash';
import { ConsoleParsedRequestsProvider, getParsedRequestsProvider, monaco } from '@kbn/monaco';
import { i18n } from '@kbn/i18n';
import { toMountPoint } from '@kbn/react-kibana-mount';
import { XJson } from '@kbn/es-ui-shared-plugin/public';
import { ErrorAnnotation } from '@kbn/monaco/src/languages/console/types';
import { checkForTripleQuotesAndQueries } from '@kbn/monaco/src/languages/console/utils';
import { isQuotaExceededError } from '../../../services/history';
import { DEFAULT_VARIABLES, KIBANA_API_PREFIX } from '../../../../common/constants';
import { getStorage, StorageKeys } from '../../../services';
import { sendRequest } from '../../hooks';
import { Actions } from '../../stores/request';

import {
  AutocompleteType,
  containsUrlParams,
  getAutoIndentedRequests,
  getBodyCompletionItems,
  getCurlRequest,
  getDocumentationLinkFromAutocomplete,
  getLineTokens,
  getMethodCompletionItems,
  getRequestEndLineNumber,
  getRequestStartLineNumber,
  getUrlParamsCompletionItems,
  getUrlPathCompletionItems,
  replaceRequestVariables,
  SELECTED_REQUESTS_CLASSNAME,
  shouldTriggerSuggestions,
  trackSentRequests,
  getRequestFromEditor,
} from './utils';

import type { AdjustedParsedRequest } from './types';
import { type RequestToRestore, RestoreMethod } from '../../../types';
import { StorageQuotaError } from '../../components/storage_quota_error';
import { ContextValue } from '../../contexts';
import { containsComments, indentData } from './utils/requests_utils';

const AUTO_INDENTATION_ACTION_LABEL = 'Apply indentations';
const TRIGGER_SUGGESTIONS_ACTION_LABEL = 'Trigger suggestions';
const TRIGGER_SUGGESTIONS_HANDLER_ID = 'editor.action.triggerSuggest';
const DEBOUNCE_HIGHLIGHT_WAIT_MS = 200;
const DEBOUNCE_AUTOCOMPLETE_WAIT_MS = 500;
const INSPECT_TOKENS_LABEL = 'Inspect tokens';
const INSPECT_TOKENS_HANDLER_ID = 'editor.action.inspectTokens';
const { collapseLiteralStrings } = XJson;

export class MonacoEditorActionsProvider {
  private parsedRequestsProvider: ConsoleParsedRequestsProvider;
  private highlightedLines: monaco.editor.IEditorDecorationsCollection;
  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    private setEditorActionsCss: (css: CSSProperties) => void,
    private isDevMode: boolean
  ) {
    this.parsedRequestsProvider = getParsedRequestsProvider(this.editor.getModel());
    this.highlightedLines = this.editor.createDecorationsCollection();

    const debouncedHighlightRequests = debounce(
      async () => {
        if (editor.hasTextFocus()) {
          await this.highlightRequests();
        } else {
          this.clearEditorDecorations();
        }
      },
      DEBOUNCE_HIGHLIGHT_WAIT_MS,
      {
        leading: true,
      }
    );

    const debouncedTriggerSuggestions = debounce(
      () => {
        this.triggerSuggestions();
      },
      DEBOUNCE_AUTOCOMPLETE_WAIT_MS,
      {
        leading: false,
        trailing: true,
      }
    );

    // init all listeners
    editor.onDidChangeCursorPosition(async (event) => {
      await debouncedHighlightRequests();
    });
    editor.onDidScrollChange(async (event) => {
      await debouncedHighlightRequests();
    });
    editor.onDidChangeCursorSelection(async (event) => {
      await debouncedHighlightRequests();
    });
    editor.onDidContentSizeChange(async (event) => {
      await debouncedHighlightRequests();
    });

    editor.onKeyUp((event) => {
      // trigger autocomplete on backspace
      if (event.keyCode === monaco.KeyCode.Backspace) {
        debouncedTriggerSuggestions();
      }
      if (this.isDevMode && event.keyCode === monaco.KeyCode.F1) {
        this.editor.trigger(INSPECT_TOKENS_LABEL, INSPECT_TOKENS_HANDLER_ID, {});
      }
    });
  }

  private clearEditorDecorations() {
    // remove the highlighted lines
    this.highlightedLines.clear();
    // hide action buttons
    this.setEditorActionsCss({
      visibility: 'hidden',
    });
  }

  private updateEditorActions(lineNumber?: number) {
    // if no request is currently selected, hide the actions buttons
    if (!lineNumber) {
      this.setEditorActionsCss({
        visibility: 'hidden',
      });
    } else {
      const lineTop = this.editor.getTopForLineNumber(lineNumber);
      const scrollTop = this.editor.getScrollTop();
      const offset = lineTop - scrollTop;

      // Ensure offset is never less than or equal to zero, moving it down
      // by 1 px if needed.
      const adjustedOffset = offset <= 0 ? 1 : offset;

      this.setEditorActionsCss({
        visibility: 'visible',
        // Move position down by 1 px so that the action buttons panel doesn't
        // cover the top border of the selected block.
        top: adjustedOffset + 1,
      });
    }
  }

  private async highlightRequests(): Promise<void> {
    // get the requests in the selected range
    const parsedRequests = await this.getSelectedParsedRequests();
    // if any requests are selected, highlight the lines and update the position of actions buttons
    if (parsedRequests.length > 0) {
      // display the actions buttons on the 1st line of the 1st selected request
      const selectionStartLineNumber = parsedRequests[0].startLineNumber;
      this.updateEditorActions(selectionStartLineNumber);
      // highlight the lines from the 1st line of the first selected request
      // to the last line of the last selected request
      const selectionEndLineNumber = parsedRequests[parsedRequests.length - 1].endLineNumber;
      const selectedRange = new monaco.Range(
        selectionStartLineNumber,
        1,
        selectionEndLineNumber,
        this.editor.getModel()?.getLineMaxColumn(selectionEndLineNumber) ?? 1
      );
      this.highlightedLines.set([
        {
          range: selectedRange,
          options: {
            isWholeLine: true,
            blockClassName: SELECTED_REQUESTS_CLASSNAME,
          },
        },
      ]);
    } else {
      // if no requests are selected, hide actions buttons and remove highlighted lines
      this.updateEditorActions();
      this.highlightedLines.clear();
    }
  }

  private async getSelectedParsedRequests(): Promise<AdjustedParsedRequest[]> {
    const model = this.editor.getModel();

    if (!model) {
      return [];
    }

    const selection = this.editor.getSelection();
    if (!model || !selection) {
      return Promise.resolve([]);
    }
    const { startLineNumber, endLineNumber } = selection;
    return this.getRequestsBetweenLines(model, startLineNumber, endLineNumber);
  }

  private async getRequestsBetweenLines(
    model: monaco.editor.ITextModel,
    startLineNumber: number,
    endLineNumber: number
  ): Promise<AdjustedParsedRequest[]> {
    if (!model) {
      return [];
    }
    const parsedRequests = await this.parsedRequestsProvider.getRequests();
    const selectedRequests: AdjustedParsedRequest[] = [];
    for (const [index, parsedRequest] of parsedRequests.entries()) {
      const requestStartLineNumber = getRequestStartLineNumber(parsedRequest, model);
      const requestEndLineNumber = getRequestEndLineNumber({
        parsedRequest,
        nextRequest: parsedRequests.at(index + 1),
        model,
        startLineNumber,
      });
      if (requestStartLineNumber > endLineNumber) {
        // request is past the selection, no need to check further requests
        break;
      }
      if (requestEndLineNumber < startLineNumber) {
        // request is before the selection, do nothing
      } else {
        // request is selected
        selectedRequests.push({
          ...parsedRequest,
          startLineNumber: requestStartLineNumber,
          endLineNumber: requestEndLineNumber,
        });
      }
    }
    return selectedRequests;
  }

  private async getErrorsBetweenLines(
    startLineNumber: number,
    endLineNumber: number
  ): Promise<ErrorAnnotation[]> {
    const model = this.editor.getModel();
    if (!model) {
      return [];
    }
    const parsedErrors = await this.parsedRequestsProvider.getErrors();
    const selectedErrors: ErrorAnnotation[] = [];
    for (const parsedError of parsedErrors) {
      const errorLine = model.getPositionAt(parsedError.offset).lineNumber;
      if (errorLine > endLineNumber) {
        // error is past the selection, no need to check further errors
        break;
      }
      if (errorLine >= startLineNumber) {
        // error is selected
        selectedErrors.push(parsedError);
      }
    }
    return selectedErrors;
  }

  public async getRequests() {
    const model = this.editor.getModel();
    if (!model) {
      return [];
    }

    const parsedRequests = await this.getSelectedParsedRequests();
    const stringifiedRequests = parsedRequests.map((parsedRequest) => {
      const { startLineNumber, endLineNumber } = parsedRequest;
      const requestTextFromEditor = getRequestFromEditor(model, startLineNumber, endLineNumber);
      if (requestTextFromEditor && requestTextFromEditor.data.length > 0) {
        requestTextFromEditor.data = requestTextFromEditor.data.map((dataString) => {
          if (containsComments(dataString)) {
            // parse and stringify to remove comments
            dataString = indentData(dataString);
          }
          return collapseLiteralStrings(dataString);
        });
      }
      return requestTextFromEditor;
    });
    // get variables values
    const variables = getStorage().get(StorageKeys.VARIABLES, DEFAULT_VARIABLES);
    return stringifiedRequests
      .filter(Boolean)
      .map((request) => replaceRequestVariables(request!, variables));
  }

  public async getCurl(elasticsearchBaseUrl: string): Promise<string> {
    const requests = await this.getRequests();
    const curlRequests = requests.map((request) => getCurlRequest(request, elasticsearchBaseUrl));
    return curlRequests.join('\n');
  }

  public async sendRequests(dispatch: Dispatch<Actions>, context: ContextValue): Promise<void> {
    const {
      services: { notifications, trackUiMetric, http, settings, history, autocompleteInfo },
      ...startServices
    } = context;
    const { toasts } = notifications;
    try {
      const allRequests = await this.getRequests();
      const selectedRequests = await this.getSelectedParsedRequests();
      if (selectedRequests.length) {
        const selectedErrors = await this.getErrorsBetweenLines(
          selectedRequests.at(0)!.startLineNumber,
          selectedRequests.at(-1)!.endLineNumber
        );
        if (selectedErrors.length) {
          toasts.addDanger(
            i18n.translate('console.notification.monaco.error.errorInSelection', {
              defaultMessage:
                'The selected {requestCount, plural, one {request contains} other {requests contain}} {errorCount, plural, one {an error} other {errors}}. Please resolve {errorCount, plural, one {it} other {them}} and try again.',
              values: {
                requestCount: selectedRequests.length,
                errorCount: selectedErrors.length,
              },
            })
          );
          return;
        }
      }

      const requests = allRequests
        // if any request doesnt have a method then we gonna treat it as a non-valid
        // request
        .filter((request) => request.method)
        // map the requests to the original line number
        .map((request, index) => ({
          ...request,
          lineNumber: selectedRequests[index].startLineNumber,
        }));

      // If we do have requests but none have methods we are not sending the request
      if (allRequests.length > 0 && !requests.length) {
        toasts.addWarning(
          i18n.translate('console.notification.monaco.error.nonSupportedRequest', {
            defaultMessage: 'The selected request is not valid.',
          })
        );
        return;
      } else if (!requests.length) {
        toasts.add(
          i18n.translate('console.notification.monaco.error.noRequestSelectedTitle', {
            defaultMessage:
              'No request selected. Select a request by placing the cursor inside it.',
          })
        );
        return;
      }

      dispatch({ type: 'sendRequest', payload: undefined });

      // track the requests
      setTimeout(() => trackSentRequests(requests, trackUiMetric), 0);

      const selectedHost = settings.getSelectedHost();
      const results = await sendRequest({ http, requests, host: selectedHost || undefined });

      let saveToHistoryError: undefined | Error;
      const isHistoryEnabled = settings.getIsHistoryEnabled();

      if (isHistoryEnabled) {
        results.forEach(({ request: { path, method, data } }) => {
          try {
            history.addToHistory(path, method, data);
          } catch (e) {
            // Grab only the first error
            if (!saveToHistoryError) {
              saveToHistoryError = e;
            }
          }
        });

        if (saveToHistoryError) {
          const errorTitle = i18n.translate(
            'console.notification.monaco.error.couldNotSaveRequestTitle',
            {
              defaultMessage: 'Could not save request to Console history.',
            }
          );
          if (isQuotaExceededError(saveToHistoryError)) {
            const toast = notifications.toasts.addWarning({
              title: i18n.translate(
                'console.notification.monaco.error.historyQuotaReachedMessage',
                {
                  defaultMessage:
                    'Request history is full. Clear the console history or disable saving new requests.',
                }
              ),
              text: toMountPoint(
                StorageQuotaError({
                  onClearHistory: () => {
                    history.clearHistory();
                    notifications.toasts.remove(toast);
                  },
                  onDisableSavingToHistory: () => {
                    settings.setIsHistoryEnabled(false);
                    notifications.toasts.remove(toast);
                  },
                }),
                startServices
              ),
            });
          } else {
            // Best effort, but still notify the user.
            notifications.toasts.addError(saveToHistoryError, {
              title: errorTitle,
            });
          }
        }
      }

      const polling = settings.getPolling();
      if (polling) {
        // If the user has submitted a request against ES, something in the fields, indices, aliases,
        // or templates may have changed, so we'll need to update this data. Assume that if
        // the user disables polling they're trying to optimize performance or otherwise
        // preserve resources, so they won't want this request sent either.
        autocompleteInfo.retrieve(settings, settings.getAutocomplete());
      }

      dispatch({
        type: 'requestSuccess',
        payload: {
          data: results,
        },
      });
    } catch (e) {
      if (e?.response) {
        dispatch({
          type: 'requestFail',
          payload: e,
        });
      } else {
        dispatch({
          type: 'requestFail',
          payload: undefined,
        });
        toasts.addError(e, {
          title: i18n.translate('console.notification.monaco.error.unknownErrorTitle', {
            defaultMessage: 'Unknown Request Error',
          }),
        });
      }
    }
  }

  public async getDocumentationLink(docLinkVersion: string): Promise<string | null> {
    const requests = await this.getRequests();
    if (requests.length < 1) {
      return null;
    }
    const request = requests[0];

    return getDocumentationLinkFromAutocomplete(request, docLinkVersion);
  }

  private isInsideMultilineComment(model: monaco.editor.ITextModel, lineNumber: number): boolean {
    let insideComment = false;
    for (let i = 1; i <= lineNumber; i++) {
      const lineContent = model.getLineContent(i).trim();
      if (lineContent.startsWith('/*')) {
        insideComment = true;
      }
      if (lineContent.includes('*/')) {
        insideComment = false;
      }
    }
    return insideComment;
  }

  private async getAutocompleteType(
    model: monaco.editor.ITextModel,
    { lineNumber, column }: monaco.Position
  ): Promise<AutocompleteType | null> {
    // Get the content of the current line up until the cursor position
    const currentLineContent = model.getLineContent(lineNumber);
    const trimmedContent = currentLineContent.trim();

    // If we are positioned inside a comment block, no autocomplete should be provided
    if (
      trimmedContent.startsWith('#') ||
      trimmedContent.startsWith('//') ||
      trimmedContent.startsWith('/*') ||
      trimmedContent.startsWith('*') ||
      trimmedContent.includes('*/') ||
      this.isInsideMultilineComment(model, lineNumber)
    ) {
      return null;
    }

    // get the current request on this line
    const currentRequests = await this.getRequestsBetweenLines(model, lineNumber, lineNumber);
    const currentRequest = currentRequests.at(0);

    // if there is no request, suggest method
    if (!currentRequest) {
      return AutocompleteType.METHOD;
    }

    // if on the 1st line of the request, suggest method, url or url_params depending on the content
    const { startLineNumber: requestStartLineNumber } = currentRequest;
    if (lineNumber === requestStartLineNumber) {
      // get the content on the line up until the position
      const lineContent = model.getValueInRange({
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: column,
      });
      const lineTokens = getLineTokens(lineContent);
      // if there is 1 or fewer tokens, suggest method
      if (lineTokens.length <= 1) {
        return AutocompleteType.METHOD;
      }
      // if there are 2 tokens, look at the 2nd one and suggest path or url_params
      if (lineTokens.length === 2) {
        const token = lineTokens[1];
        if (containsUrlParams(token)) {
          return AutocompleteType.URL_PARAMS;
        }
        return AutocompleteType.PATH;
      }
      // if more than 2 tokens, no suggestions
      return null;
    }

    // if not on the 1st line of the request, suggest request body
    return AutocompleteType.BODY;
  }

  private async getSuggestions(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext
  ): Promise<monaco.languages.CompletionList> {
    // determine autocomplete type
    const autocompleteType = await this.getAutocompleteType(model, position);
    if (!autocompleteType) {
      return {
        suggestions: [],
      };
    }
    if (autocompleteType === AutocompleteType.METHOD) {
      return {
        // suggest all methods, the editor will filter according to the input automatically
        suggestions: getMethodCompletionItems(model, position),
      };
    }
    if (autocompleteType === AutocompleteType.PATH) {
      return {
        suggestions: getUrlPathCompletionItems(model, position),
      };
    }

    if (autocompleteType === AutocompleteType.URL_PARAMS) {
      return {
        suggestions: getUrlParamsCompletionItems(model, position),
      };
    }

    if (autocompleteType === AutocompleteType.BODY) {
      // suggestions only when triggered by " or keyboard
      if (context.triggerCharacter && context.triggerCharacter !== '"') {
        return { suggestions: [] };
      }
      const requests = await this.getRequestsBetweenLines(
        model,
        position.lineNumber,
        position.lineNumber
      );
      const requestStartLineNumber = requests[0].startLineNumber;
      const suggestions = await getBodyCompletionItems(
        model,
        position,
        requestStartLineNumber,
        this
      );
      return {
        suggestions,
      };
    }

    return {
      suggestions: [],
    };
  }
  public async provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext
  ): Promise<monaco.languages.CompletionList> {
    return this.getSuggestions(model, position, context);
  }

  public async restoreRequestFromHistory(request: string) {
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    let position = this.editor.getPosition() as monaco.IPosition;
    const requests = await this.getSelectedParsedRequests();
    let prefix = '';
    let suffix = '';
    // if there are requests at the cursor/selection, insert either before or after
    if (requests.length > 0) {
      // if on the 1st line of the 1st request, insert at the beginning of that line
      if (position && position.lineNumber === requests[0].startLineNumber) {
        position = { column: 1, lineNumber: position.lineNumber };
        suffix = '\n';
      } else {
        // otherwise insert at the end of the last line of the last request
        const lastLineNumber = requests[requests.length - 1].endLineNumber;
        position = { column: model.getLineMaxColumn(lastLineNumber), lineNumber: lastLineNumber };
        prefix = '\n';
      }
    } else {
      // if not inside a request, insert the request at the cursor line
      if (position) {
        // insert at the beginning of the cursor line
        position = { lineNumber: position.lineNumber, column: 1 };
      } else {
        // otherwise insert on line 1
        position = { lineNumber: 1, column: 1 };
      }
      suffix = '\n';
    }
    const edit: monaco.editor.IIdentifiedSingleEditOperation = {
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
      text: prefix + request + suffix,
      forceMoveMarkers: true,
    };
    this.editor.executeEdits('restoreFromHistory', [edit]);
  }

  /*
  This function returns the text in the provided range.
  If no range is provided, it returns all text in the editor.
  */
  private getTextInRange(selectionRange?: monaco.IRange): string {
    const model = this.editor.getModel();
    if (!model) {
      return '';
    }
    if (selectionRange) {
      const { startLineNumber, startColumn, endLineNumber, endColumn } = selectionRange;
      return model.getValueInRange({
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn,
      });
    }
    // If no range is provided, return all text in the editor
    return model.getValue();
  }

  /**
   * This function applies indentations to the request in the selected text.
   */
  public async autoIndent(context: ContextValue) {
    const {
      services: { notifications },
    } = context;
    const { toasts } = notifications;
    const parsedRequests = await this.getSelectedParsedRequests();
    const selectionStartLineNumber = parsedRequests[0].startLineNumber;
    const selectionEndLineNumber = parsedRequests[parsedRequests.length - 1].endLineNumber;
    const selectedRange = new monaco.Range(
      selectionStartLineNumber,
      1,
      selectionEndLineNumber,
      this.editor.getModel()?.getLineMaxColumn(selectionEndLineNumber) ?? 1
    );

    if (parsedRequests.length < 1) {
      return;
    }

    const selectedText = this.getTextInRange(selectedRange);
    const allText = this.getTextInRange();

    const autoIndentedText = getAutoIndentedRequests(
      parsedRequests,
      selectedText,
      allText,
      (text) => toasts.addWarning(text)
    );

    this.editor.executeEdits(AUTO_INDENTATION_ACTION_LABEL, [
      {
        range: selectedRange,
        text: autoIndentedText,
      },
    ]);
  }

  /**
   * This function moves the cursor to the previous request edge (start/end line).
   * If the cursor is inside a request, it is moved to the start line of this request.
   * If there are no requests before the cursor, it is moved at the first line in the editor.
   */
  public async moveToPreviousRequestEdge() {
    const currentPosition = this.editor.getPosition();
    const model = this.editor.getModel();
    if (!currentPosition || !model) {
      return;
    }
    const { lineNumber: currentLineNumber } = currentPosition;
    // Get all requests before the current line
    const requestsBefore = await this.getRequestsBetweenLines(model, 1, currentLineNumber - 1);
    if (requestsBefore.length === 0) {
      // If no requests before current line, set position to first line
      this.editor.setPosition({ lineNumber: 1, column: 1 });
      return;
    }
    const lastRequestBefore = requestsBefore[requestsBefore.length - 1];
    if (lastRequestBefore.endLineNumber < currentLineNumber) {
      this.editor.setPosition({ lineNumber: lastRequestBefore.endLineNumber, column: 1 });
    } else {
      // If the end line of the request is after the current line, then the cursor is inside the request
      // The previous request edge is the start line of the request
      this.editor.setPosition({ lineNumber: lastRequestBefore.startLineNumber, column: 1 });
    }
  }

  /**
   * This function moves the cursor to the next request edge.
   * If the cursor is inside a request, it is moved to the end line of this request.
   * If there are no requests after the cursor, it is moved at the last line in the editor.
   */
  public async moveToNextRequestEdge() {
    const currentPosition = this.editor.getPosition();
    const model = this.editor.getModel();
    if (!currentPosition || !model) {
      return;
    }
    const { lineNumber: currentLineNumber } = currentPosition;
    // Get all requests before the current line
    const requestsAfter = await this.getRequestsBetweenLines(
      model,
      currentLineNumber + 1,
      model.getLineCount()
    );
    if (requestsAfter.length === 0) {
      // If no requests after current line, set position to last line
      this.editor.setPosition({ lineNumber: model.getLineCount(), column: 1 });
      return;
    }
    const firstRequestAfter = requestsAfter[0];
    if (firstRequestAfter.startLineNumber > currentLineNumber) {
      this.editor.setPosition({ lineNumber: firstRequestAfter.startLineNumber, column: 1 });
    } else {
      // If the start line of the request is before the current line, then the cursor is inside the request
      // The next request edge is the end line of the request
      this.editor.setPosition({ lineNumber: firstRequestAfter.endLineNumber, column: 1 });
    }
  }

  /*
   * This function is to get an array of line contents
   * from startLine to endLine including both line numbers
   */
  public getLines(startLine: number, endLine: number): string[] {
    const model = this.editor.getModel();
    if (!model) {
      return [];
    }
    // range returns an array not including the end of the range, so we need to add 1
    return range(startLine, endLine + 1).map((lineNumber) => model.getLineContent(lineNumber));
  }

  /*
   * This function returns the current position of the cursor
   */
  public getCurrentPosition(): monaco.IPosition {
    return this.editor.getPosition() ?? { lineNumber: 1, column: 1 };
  }

  private async isPositionInsideTripleQuotesAndQuery(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<{ insideTripleQuotes: boolean; insideQuery: boolean }> {
    const selectedRequests = await this.getSelectedParsedRequests();

    for (const request of selectedRequests) {
      if (
        request.startLineNumber <= position.lineNumber &&
        request.endLineNumber >= position.lineNumber
      ) {
        const requestContentBefore = model.getValueInRange({
          startLineNumber: request.startLineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const { insideTripleQuotes, insideSingleQuotesQuery, insideTripleQuotesQuery } =
          checkForTripleQuotesAndQueries(requestContentBefore);
        return {
          insideTripleQuotes,
          insideQuery: insideSingleQuotesQuery || insideTripleQuotesQuery,
        };
      }
      if (request.startLineNumber > position.lineNumber) {
        // Stop iteration once we pass the cursor position
        return { insideTripleQuotes: false, insideQuery: false };
      }
    }

    // Return false if the position is not inside a request
    return { insideTripleQuotes: false, insideQuery: false };
  }

  private triggerSuggestions() {
    const model = this.editor.getModel();
    const position = this.editor.getPosition();
    if (!model || !position) {
      return;
    }
    this.isPositionInsideTripleQuotesAndQuery(model, position).then(
      ({ insideTripleQuotes, insideQuery }) => {
        if (insideTripleQuotes && !insideQuery) {
          // Don't trigger autocomplete suggestions inside scripts and strings
          return;
        }

        const lineContentBefore = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        // Trigger suggestions if the line:
        // - is empty
        // - matches specified regex
        // - is inside a query
        if (
          !lineContentBefore.trim() ||
          shouldTriggerSuggestions(lineContentBefore) ||
          insideQuery
        ) {
          this.editor.trigger(TRIGGER_SUGGESTIONS_ACTION_LABEL, TRIGGER_SUGGESTIONS_HANDLER_ID, {});
        }
      }
    );
  }

  /*
   * This function cleares out the editor content and replaces it with the provided requests
   */
  public async importRequestsToEditor(requestsToImport: string) {
    const model = this.editor.getModel();

    if (!model) {
      return;
    }

    const edit: monaco.editor.IIdentifiedSingleEditOperation = {
      range: model.getFullModelRange(),
      text: requestsToImport,
      forceMoveMarkers: true,
    };

    this.editor.executeEdits('restoreFromHistory', [edit]);
  }

  /*
   * This function inserts a request after the last request in the editor
   */
  public async appendRequestToEditor(
    req: RequestToRestore,
    dispatch: Dispatch<Actions>,
    context: ContextValue
  ) {
    const model = this.editor.getModel();

    if (!model) {
      return;
    }

    // 1 - Create an edit operation to insert the request after the last request
    const lastLineNumber = model.getLineCount();
    const column = model.getLineMaxColumn(lastLineNumber);
    const edit: monaco.editor.IIdentifiedSingleEditOperation = {
      range: {
        startLineNumber: lastLineNumber,
        startColumn: column,
        endLineNumber: lastLineNumber,
        endColumn: column,
      },
      text: `\n\n${req.request}`,
      forceMoveMarkers: true,
    };
    this.editor.executeEdits('restoreFromHistory', [edit]);

    // 2 - Since we add two new lines, the cursor should be at the beginning of the new request
    const beginningOfNewReq = lastLineNumber + 2;
    const selectedRequests = await this.getRequestsBetweenLines(
      model,
      beginningOfNewReq,
      beginningOfNewReq
    );
    // We can assume that there is only one request given that we only add one
    // request at a time.
    const restoredRequest = selectedRequests[0];

    // 3 - Set the cursor to the beginning of the new request,
    this.editor.setSelection({
      startLineNumber: restoredRequest.startLineNumber,
      startColumn: 1,
      endLineNumber: restoredRequest.startLineNumber,
      endColumn: 1,
    });

    // 4 - Scroll to the beginning of the new request
    this.editor.setScrollPosition({
      scrollTop: this.editor.getTopForLineNumber(restoredRequest.startLineNumber),
    });

    // 5 - Optionally send the request
    if (req.restoreMethod === RestoreMethod.RESTORE_AND_EXECUTE) {
      this.sendRequests(dispatch, context);
    }
  }

  /*
   * Returns true if any of the selected requests is an internal Kibana request
   * (starting with the kbn: prefix). Returns false otherwise
   */
  public async isKbnRequestSelected(): Promise<boolean> {
    const requests = await this.getRequests();
    if (requests.length < 1) {
      return false;
    }
    return requests.some((request) => request.url.startsWith(KIBANA_API_PREFIX));
  }
}
