/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { FC, useMemo } from 'react';
import {
  EuiInMemoryTable,
  EuiLoadingElastic,
  EuiToolTip,
  EuiIcon,
  EuiOverlayMask,
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiButton,
  EuiSpacer,
  EuiCallOut,
  EuiLoadingSpinner,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';
import type { SavedObjectWithMetadata, SavedObjectManagementTypeInfo } from '../../../../common';
import { getSavedObjectLabel } from '../../../lib';

export interface DeleteConfirmModalProps {
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  selectedObjects: SavedObjectWithMetadata[];
  allowedTypes: SavedObjectManagementTypeInfo[];
  showPlainSpinner?: boolean;
}

export const DeleteConfirmModal: FC<DeleteConfirmModalProps> = ({
  isDeleting,
  onConfirm,
  onCancel,
  selectedObjects,
  allowedTypes,
  showPlainSpinner,
}) => {
  const modalTitleId = useGeneratedHtmlId();

  const hiddenObjects = useMemo(() => {
    return selectedObjects.filter((obj) => obj.meta.hiddenType);
  }, [selectedObjects]);
  const deletableObjects = useMemo(() => {
    return selectedObjects
      .filter((obj) => !obj.meta.hiddenType)
      .map(({ type, id, meta, namespaces = [] }) => {
        const { title = '', icon = 'apps' } = meta;
        const isShared = namespaces.length > 1 || namespaces.includes('*');
        return { type, id, icon, title, isShared };
      });
  }, [selectedObjects]);
  const sharedObjectsCount = useMemo(() => {
    return deletableObjects.filter((obj) => obj.isShared).length;
  }, [deletableObjects]);

  if (isDeleting) {
    return (
      <EuiOverlayMask>
        {showPlainSpinner ? <EuiLoadingSpinner size="xl" /> : <EuiLoadingElastic size="xl" />}
      </EuiOverlayMask>
    );
  }
  // can't use `EuiConfirmModal` here as the confirm modal body is wrapped
  // inside a `<p>` element, causing UI glitches with the table.
  return (
    <EuiModal
      initialFocus="soDeleteConfirmModalConfirmBtn"
      onClose={onCancel}
      aria-labelledby={modalTitleId}
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle id={modalTitleId}>
          <FormattedMessage
            id="savedObjectsManagement.objectsTable.deleteSavedObjectsConfirmModalTitle"
            defaultMessage="Delete saved objects"
          />
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        {hiddenObjects.length > 0 && (
          <>
            <EuiCallOut
              data-test-subj="cannotDeleteObjectsConfirmWarning"
              title={
                <FormattedMessage
                  id="savedObjectsManagement.objectsTable.deleteConfirmModal.cannotDeleteCallout.title"
                  defaultMessage="Some objects have been excluded"
                />
              }
              iconType="warning"
              color="warning"
            >
              {hiddenObjects.length > 0 && (
                <p
                  css={css`
                    margin-block-end: 0 !important;
                  `}
                >
                  <FormattedMessage
                    id="savedObjectsManagement.objectsTable.deleteConfirmModal.cannotDeleteCallout.content"
                    defaultMessage="{objectCount, plural, one {# object is} other {# objects are}} hidden and cannot be deleted."
                    values={{ objectCount: hiddenObjects.length }}
                  />
                </p>
              )}
            </EuiCallOut>
            <EuiSpacer size="s" />
          </>
        )}
        {sharedObjectsCount > 0 && (
          <>
            <EuiCallOut
              data-test-subj="sharedObjectsWarning"
              title={
                <FormattedMessage
                  id="savedObjectsManagement.objectsTable.deleteConfirmModal.sharedObjectsCallout.title"
                  defaultMessage="{sharedObjectsCount, plural, one {# saved object is shared} other {# of your saved objects are shared}}"
                  values={{ sharedObjectsCount }}
                />
              }
              iconType="warning"
              color="warning"
            >
              <p>
                <FormattedMessage
                  id="savedObjectsManagement.objectsTable.deleteConfirmModal.sharedObjectsCallout.content"
                  defaultMessage="Shared objects are deleted from every space they are in."
                />
              </p>
            </EuiCallOut>
            <EuiSpacer size="s" />
          </>
        )}
        <p>
          <FormattedMessage
            id="savedObjectsManagement.deleteSavedObjectsConfirmModalDescription"
            defaultMessage="This action will delete the following saved objects:"
          />
        </p>
        <EuiSpacer size="m" />
        <EuiInMemoryTable
          items={deletableObjects}
          columns={[
            {
              field: 'type',
              name: i18n.translate(
                'savedObjectsManagement.objectsTable.deleteSavedObjectsConfirmModal.typeColumnName',
                { defaultMessage: 'Type' }
              ),
              width: '50px',
              render: (type, { icon }) => (
                <EuiToolTip position="top" content={getSavedObjectLabel(type, allowedTypes)}>
                  <EuiIcon type={icon} />
                </EuiToolTip>
              ),
            },
            {
              field: 'id',
              name: i18n.translate(
                'savedObjectsManagement.objectsTable.deleteSavedObjectsConfirmModal.idColumnName',
                { defaultMessage: 'ID' }
              ),
            },
            {
              field: 'title',
              name: i18n.translate(
                'savedObjectsManagement.objectsTable.deleteSavedObjectsConfirmModal.titleColumnName',
                { defaultMessage: 'Title' }
              ),
            },
          ]}
          pagination={true}
          sorting={false}
        />
      </EuiModalBody>
      <EuiModalFooter>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={onCancel} data-test-subj="confirmModalCancelButton">
                  <FormattedMessage
                    id="savedObjectsManagement.objectsTable.deleteSavedObjectsConfirmModal.cancelButtonLabel"
                    defaultMessage="Cancel"
                  />
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  id="soDeleteConfirmModalConfirmBtn"
                  fill
                  color="danger"
                  onClick={onConfirm}
                  disabled={deletableObjects.length === 0}
                  data-test-subj="confirmModalConfirmButton"
                >
                  <FormattedMessage
                    id="savedObjectsManagement.objectsTable.deleteSavedObjectsConfirmModal.deleteButtonLabel"
                    defaultMessage="Delete {objectsCount, plural, one {# object} other {# objects}}"
                    values={{ objectsCount: deletableObjects.length }}
                  />
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiModalFooter>
    </EuiModal>
  );
};
