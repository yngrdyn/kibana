/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiBadgeGroup,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiCallOut,
  EuiColorPicker,
  EuiDescribedFormGroup,
  EuiDescriptionList,
  EuiFilePicker,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiIconTip,
  EuiKeyPadMenu,
  EuiKeyPadMenuItem,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css, type Theme } from '@emotion/react';
import { Form, FormikProvider, useFormik, useFormikContext } from 'formik';
import type { FunctionComponent } from 'react';
import React, { useRef, useState } from 'react';
import useUpdateEffect from 'react-use/lib/useUpdateEffect';

import type { CoreStart, IUiSettingsClient, ThemeServiceStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  FormChangesProvider,
  FormField,
  FormLabel,
  FormRow,
  OptionalText,
  useFormChanges,
  useFormChangesContext,
} from '@kbn/security-form-components';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import type {
  ContrastModeValue,
  DarkModeValue,
  UserProfileData,
} from '@kbn/user-profile-components';
import { UserAvatar, useUpdateUserProfile } from '@kbn/user-profile-components';

import { createImageHandler, getRandomColor, VALID_HEX_COLOR } from './utils';
import type { AuthenticatedUser } from '../../../common';
import { IMAGE_FILE_TYPES } from '../../../common/constants';
import {
  canUserChangeDetails,
  canUserChangePassword,
  getUserAvatarColor,
  getUserAvatarInitials,
} from '../../../common/model';
import { useSecurityApiClients } from '../../components';
import { Breadcrumb } from '../../components/breadcrumb';
import { ChangePasswordModal } from '../../management/users/edit_user/change_password_modal';
import { isUserReserved } from '../../management/users/user_utils';

const formRowCSS = css`
  .euiFormRow__label {
    flex: 1;
  }
`;

const pageHeaderCSS = css`
  max-width: 1248px;
  margin: auto;
  border-bottom: none;
`;

const betaBadgeCSS = ({ euiTheme }: Theme) => css`
  padding: calc(${euiTheme.size.xxs} * 1.5);
  border: ${euiTheme.border.width.thin} solid ${euiTheme.border.color};
  border-radius: 50%;
`;

export interface UserProfileProps {
  user: AuthenticatedUser;
  data?: UserProfileData;
}

export interface UserDetailsEditorProps {
  user: AuthenticatedUser;
}

export interface UserSettingsEditorProps {
  formik: ReturnType<typeof useUserProfileForm>;
  isThemeOverridden: boolean;
  isOverriddenThemeDarkMode: boolean;
}

export interface UserRoleProps {
  user: AuthenticatedUser;
}

export interface UserProfileFormValues {
  user: {
    full_name: string;
    email: string;
  };
  data?: {
    avatar: {
      initials: string;
      color: string;
      imageUrl: string;
    };
    userSettings: {
      darkMode: DarkModeValue;
      contrastMode: ContrastModeValue;
    };
  };
  avatarType: 'initials' | 'image';
}

const UserDetailsEditor: FunctionComponent<UserDetailsEditorProps> = ({ user }) => {
  const { services } = useKibana<CoreStart>();

  const canChangeDetails = canUserChangeDetails(user, services.application.capabilities);
  if (!canChangeDetails) {
    return null;
  }

  return (
    <EuiDescribedFormGroup
      fullWidth
      title={
        <h2>
          <FormattedMessage
            id="xpack.security.accountManagement.userProfile.detailsGroupTitle"
            defaultMessage="Details"
          />
        </h2>
      }
      description={
        <FormattedMessage
          id="xpack.security.accountManagement.userProfile.detailsGroupDescription"
          defaultMessage="Provide some basic information about yourself."
        />
      }
    >
      <FormRow
        css={formRowCSS}
        label={
          <FormLabel for="user.full_name">
            <EuiFlexGroup justifyContent="spaceBetween">
              <FormattedMessage
                id="xpack.security.accountManagement.userProfile.fullNameLabel"
                defaultMessage="Full name"
              />
              <OptionalText />
            </EuiFlexGroup>
          </FormLabel>
        }
        fullWidth
      >
        <FormField name="user.full_name" data-test-subj={'userProfileFullName'} fullWidth />
      </FormRow>

      <FormRow
        css={formRowCSS}
        label={
          <FormLabel for="user.email">
            <EuiFlexGroup justifyContent="spaceBetween">
              <FormattedMessage
                id="xpack.security.accountManagement.userProfile.emailLabel"
                defaultMessage="Email address"
              />
              <OptionalText />
            </EuiFlexGroup>
          </FormLabel>
        }
        fullWidth
      >
        <FormField type="email" name="user.email" data-test-subj={'userProfileEmail'} fullWidth />
      </FormRow>
    </EuiDescribedFormGroup>
  );
};

const UserSettingsEditor: FunctionComponent<UserSettingsEditorProps> = ({
  formik,
  isThemeOverridden,
  isOverriddenThemeDarkMode,
}) => {
  if (!formik.values.data) {
    return null;
  }

  let colorModeIdSelected = formik.values.data.userSettings.darkMode;

  if (isThemeOverridden) {
    if (isOverriddenThemeDarkMode) {
      colorModeIdSelected = 'dark';
    } else {
      colorModeIdSelected = 'light';
    }
  }

  interface ThemeKeyPadItem {
    id: string;
    label: string;
    icon: string;
  }

  const themeItem = ({ id, label, icon }: ThemeKeyPadItem) => {
    return (
      <EuiKeyPadMenuItem
        name={id}
        label={label}
        data-test-subj={`themeKeyPadItem${id}`}
        checkable="single"
        isSelected={colorModeIdSelected === id}
        isDisabled={isThemeOverridden}
        onChange={() => formik.setFieldValue('data.userSettings.darkMode', id)}
      >
        <EuiIcon type={icon} size="l" />
      </EuiKeyPadMenuItem>
    );
  };

  const themeMenu = (themeOverridden: boolean) => {
    const themeKeyPadMenu = (
      <EuiKeyPadMenu
        aria-label={i18n.translate(
          'xpack.security.accountManagement.userProfile.userSettings.themeGroupDescription',
          {
            defaultMessage: 'Elastic theme',
          }
        )}
        data-test-subj="themeMenu"
        checkable={{
          legend: (
            <FormLabel for="data.userSettings.darkMode">
              <FormattedMessage
                id="xpack.security.accountManagement.userProfile.userSettings.theme"
                defaultMessage="Color mode"
              />
            </FormLabel>
          ),
        }}
        css={css`
          inline-size: 420px; // Allow for 4 items to fit in a row instead of the default 3
        `}
      >
        {themeItem({
          id: 'system',
          label: i18n.translate('xpack.security.accountManagement.userProfile.systemModeButton', {
            defaultMessage: 'System',
          }),
          icon: 'desktop',
        })}
        {themeItem({
          id: 'light',
          label: i18n.translate('xpack.security.accountManagement.userProfile.lightModeButton', {
            defaultMessage: 'Light',
          }),
          icon: 'sun',
        })}
        {themeItem({
          id: 'dark',
          label: i18n.translate('xpack.security.accountManagement.userProfile.darkModeButton', {
            defaultMessage: 'Dark',
          }),
          icon: 'moon',
        })}
        {themeItem({
          id: 'space_default',
          label: i18n.translate('xpack.security.accountManagement.userProfile.defaultModeButton', {
            defaultMessage: 'Space default',
          }),
          icon: 'spaces',
        })}
      </EuiKeyPadMenu>
    );
    return themeOverridden ? (
      <EuiToolTip
        data-test-subj="themeOverrideTooltip"
        content={
          <FormattedMessage
            id="xpack.security.accountManagement.userProfile.overriddenMessage"
            defaultMessage="This setting is overridden by the Kibana server and can not be changed."
          />
        }
      >
        {themeKeyPadMenu}
      </EuiToolTip>
    ) : (
      themeKeyPadMenu
    );
  };

  const deprecatedWarning = colorModeIdSelected === 'space_default' && (
    <>
      <EuiSpacer size="s" />
      <EuiCallOut
        title={i18n.translate(
          'xpack.security.accountManagement.userProfile.deprecatedSpaceDefaultTitle',
          {
            defaultMessage: 'Space default settings will be removed in a future version',
          }
        )}
        color="warning"
        iconType="warning"
      >
        <p>
          {i18n.translate(
            'xpack.security.accountManagement.userProfile.deprecatedSpaceDefaultDescription',
            {
              defaultMessage:
                'All users with the Space default color mode enabled will be automatically transitioned to the System color mode.',
            }
          )}
        </p>
      </EuiCallOut>
    </>
  );

  const contrastModeIdSelected = formik.values.data.userSettings.contrastMode;
  const contrastItem = ({ id, label, icon }: ThemeKeyPadItem) => {
    return (
      <EuiKeyPadMenuItem
        name={id}
        label={label}
        data-test-subj={`contrastKeyPadItem${id}`}
        checkable="single"
        isSelected={contrastModeIdSelected === id}
        onChange={() => formik.setFieldValue('data.userSettings.contrastMode', id)}
      >
        <EuiIcon type={icon} size="l" />
      </EuiKeyPadMenuItem>
    );
  };

  const contrastModeMenu = () => {
    return (
      <EuiKeyPadMenu
        aria-label={i18n.translate(
          'xpack.security.accountManagement.userProfile.userSettings.interfaceContrastGroupDescription',
          {
            defaultMessage: 'Interface contrast',
          }
        )}
        data-test-subj="contrastMenu"
        checkable={{
          legend: (
            <FormLabel for="data.userSettings.contrastMode">
              <EuiFlexGroup gutterSize="s" alignItems="center">
                <EuiFlexItem grow={true}>
                  <FormattedMessage
                    id="xpack.security.accountManagement.userProfile.userSettings.contrastMode"
                    defaultMessage="Interface contrast"
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <div css={betaBadgeCSS}>
                    <EuiIconTip
                      aria-label={i18n.translate(
                        'xpack.security.accountManagement.userProfile.userSettings.contrastMode.betaBadge',
                        { defaultMessage: 'beta' }
                      )}
                      content={i18n.translate(
                        'xpack.security.accountManagement.userProfile.userSettings.contrastMode.betaBadge.tooltip',
                        { defaultMessage: 'The contrast setting is currently a beta feature.' }
                      )}
                      type="beta"
                      position="bottom"
                    />
                  </div>
                </EuiFlexItem>
              </EuiFlexGroup>
            </FormLabel>
          ),
        }}
      >
        {contrastItem({
          id: 'system',
          label: i18n.translate(
            'xpack.security.accountManagement.userProfile.contrastModeSystemButton',
            { defaultMessage: 'System' }
          ),
          icon: 'desktop',
        })}
        {contrastItem({
          id: 'standard',
          label: i18n.translate(
            'xpack.security.accountManagement.userProfile.contrastModeStandardButton',
            { defaultMessage: 'Normal' }
          ),
          icon: 'contrast',
        })}
        {contrastItem({
          id: 'high',
          label: i18n.translate(
            'xpack.security.accountManagement.userProfile.contrastModeHighButton',
            { defaultMessage: 'High' }
          ),
          icon: 'contrastHigh',
        })}
      </EuiKeyPadMenu>
    );
  };

  return (
    <EuiDescribedFormGroup
      fullWidth
      fieldFlexItemProps={{ style: { alignSelf: 'flex-start' } }}
      title={
        <h2>
          <FormattedMessage
            id="xpack.security.accountManagement.userProfile.userSettingsTitle"
            defaultMessage="Appearance"
          />
        </h2>
      }
      description={
        <FormattedMessage
          id="xpack.security.accountManagement.userProfile.themeFormGroupDescription"
          defaultMessage="Select the appearance of your interface."
        />
      }
    >
      <FormRow name="data.userSettings.darkMode" fullWidth>
        <>
          {themeMenu(isThemeOverridden)}
          {deprecatedWarning}
        </>
      </FormRow>

      <FormRow name="data.userSettings.contrastMode" fullWidth>
        {contrastModeMenu()}
      </FormRow>
    </EuiDescribedFormGroup>
  );
};

function UserAvatarEditor({
  user,
  formik,
}: {
  user: AuthenticatedUser;
  formik: ReturnType<typeof useUserProfileForm>;
}) {
  const { euiTheme } = useEuiTheme();
  if (!formik.values.data) {
    return null;
  }

  const isReservedUser = isUserReserved(user);
  return (
    <EuiDescribedFormGroup
      fullWidth
      fieldFlexItemProps={{ style: { alignSelf: 'flex-start' } }}
      title={
        <h2>
          <FormattedMessage
            id="xpack.security.accountManagement.userProfile.avatarGroupTitle"
            defaultMessage="Avatar"
          />
        </h2>
      }
      description={
        <FormattedMessage
          id="xpack.security.accountManagement.userProfile.avatarGroupDescription"
          defaultMessage="Provide your initials or upload an image to represent yourself."
        />
      }
    >
      <EuiFlexGroup responsive={false}>
        <EuiFlexItem grow={false}>
          {formik.values.avatarType === 'image' && !formik.values.data.avatar.imageUrl ? (
            <UserAvatar size="xl" />
          ) : (
            <UserAvatar
              user={{
                username: user.username,
                full_name: formik.values.user.full_name,
              }}
              avatar={{
                imageUrl:
                  formik.values.avatarType === 'image'
                    ? formik.values.data.avatar.imageUrl
                    : undefined,
                initials: formik.values.data.avatar.initials || '?',
                color: VALID_HEX_COLOR.test(formik.values.data.avatar.color)
                  ? formik.values.data.avatar.color
                  : undefined,
              }}
              size="xl"
            />
          )}
        </EuiFlexItem>
        <EuiFlexItem>
          <FormRow
            name="avatarType"
            label={
              <FormLabel for="avatarType">
                <FormattedMessage
                  id="xpack.security.accountManagement.userProfile.avatarTypeGroupDescription"
                  defaultMessage="Avatar type"
                />
              </FormLabel>
            }
            fullWidth
          >
            <EuiButtonGroup
              legend={i18n.translate(
                'xpack.security.accountManagement.userProfile.avatarTypeGroupDescription',
                { defaultMessage: 'Avatar type' }
              )}
              buttonSize="m"
              idSelected={formik.values.avatarType}
              options={[
                {
                  id: 'initials',
                  label: (
                    <FormattedMessage
                      id="xpack.security.accountManagement.userProfile.initialsAvatarTypeLabel"
                      defaultMessage="Initials"
                    />
                  ),
                },
                {
                  id: 'image',
                  label: (
                    <FormattedMessage
                      id="xpack.security.accountManagement.userProfile.imageAvatarTypeLabel"
                      defaultMessage="Image"
                    />
                  ),
                  iconType: 'image',
                },
              ]}
              onChange={(id: string) => formik.setFieldValue('avatarType', id)}
              isFullWidth
            />
          </FormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />

      {formik.values.avatarType === 'image' ? (
        <FormRow
          label={
            <FormLabel for="data.avatar.imageUrl">
              <FormattedMessage
                id="xpack.security.accountManagement.userProfile.imageUrlLabel"
                defaultMessage="Image"
              />
            </FormLabel>
          }
          fullWidth
        >
          <FormField
            as={EuiFilePicker}
            name="data.avatar.imageUrl"
            value={undefined} /* EuiFilePicker breaks if value is provided  */
            initialPromptText={
              formik.values.data.avatar.imageUrl ? (
                <FormattedMessage
                  id="xpack.security.accountManagement.userProfile.prepopulatedImageUrlPromptText"
                  defaultMessage="Select or drag and drop a replacement image"
                />
              ) : (
                <FormattedMessage
                  id="xpack.security.accountManagement.userProfile.imageUrlPromptText"
                  defaultMessage="Select or drag and drop an image"
                />
              )
            }
            onChange={createImageHandler((imageUrl) => {
              if (!imageUrl) {
                formik.setFieldError(
                  'data.avatar.imageUrl',
                  i18n.translate(
                    'xpack.security.accountManagement.userProfile.imageUrlRequiredError',
                    { defaultMessage: 'Upload an image.' }
                  )
                );
                formik.setFieldTouched('data.avatar.imageUrl', true);
              } else {
                formik.setFieldValue('data.avatar.imageUrl', imageUrl ?? '');
              }
            })}
            validate={{
              required: i18n.translate(
                'xpack.security.accountManagement.userProfile.imageUrlRequiredError',
                { defaultMessage: 'Upload an image.' }
              ),
            }}
            accept={IMAGE_FILE_TYPES.join(',')}
            display="default"
            fullWidth
          />
        </FormRow>
      ) : (
        <EuiFlexGroup responsive={false}>
          <EuiFlexItem grow={false} css={{ width: 64 }}>
            <FormRow
              label={
                <FormLabel for="data.avatar.initials">
                  <FormattedMessage
                    id="xpack.security.accountManagement.userProfile.initialsLabel"
                    defaultMessage="Initials"
                  />
                </FormLabel>
              }
              fullWidth
            >
              <FormField
                name="data.avatar.initials"
                maxLength={2}
                validate={{
                  required: i18n.translate(
                    'xpack.security.accountManagement.userProfile.initialsRequiredError',
                    { defaultMessage: 'Add initials' }
                  ),
                  maxLength: {
                    value: 2,
                    message: i18n.translate(
                      'xpack.security.accountManagement.userProfile.initialsMaxLengthError',
                      { defaultMessage: 'Enter no more than 2 characters.' }
                    ),
                  },
                }}
                fullWidth
              />
            </FormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <FormRow
              label={
                <FormLabel for="data.avatar.color">
                  <FormattedMessage
                    id="xpack.security.accountManagement.userProfile.colorLabel"
                    defaultMessage="Color"
                  />
                </FormLabel>
              }
              labelAppend={
                !isReservedUser ? (
                  <EuiButtonEmpty
                    onClick={() => formik.setFieldValue('data.avatar.color', getRandomColor())}
                    size="xs"
                    flush="right"
                    css={{ height: euiTheme.base }}
                  >
                    <FormattedMessage
                      id="xpack.security.accountManagement.userProfile.randomizeButton"
                      defaultMessage="Randomize"
                    />
                  </EuiButtonEmpty>
                ) : null
              }
              fullWidth
            >
              <FormField
                as={EuiColorPicker}
                name="data.avatar.color"
                color={formik.values.data.avatar.color}
                validate={{
                  required: i18n.translate(
                    'xpack.security.accountManagement.userProfile.colorRequiredError',
                    { defaultMessage: 'Select a color.' }
                  ),
                  pattern: {
                    value: VALID_HEX_COLOR,
                    message: i18n.translate(
                      'xpack.security.accountManagement.userProfile.colorPatternError',
                      { defaultMessage: 'Enter a valid HEX color code.' }
                    ),
                  },
                }}
                onChange={(value: string) => {
                  formik.setFieldValue('data.avatar.color', value);
                }}
                fullWidth
              />
            </FormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
    </EuiDescribedFormGroup>
  );
}

function UserPasswordEditor({
  user,
  onShowPasswordForm,
}: {
  user: AuthenticatedUser;
  onShowPasswordForm: () => void;
}) {
  const canChangePassword = canUserChangePassword(user);
  if (!canChangePassword) {
    return null;
  }

  return (
    <EuiDescribedFormGroup
      fullWidth
      title={
        <h2>
          <FormattedMessage
            id="xpack.security.accountManagement.userProfile.passwordGroupTitle"
            defaultMessage="Password"
          />
        </h2>
      }
      description={
        <FormattedMessage
          id="xpack.security.accountManagement.userProfile.passwordGroupDescription"
          defaultMessage="Protect your data with a strong password."
        />
      }
    >
      <EuiFormRow
        label={
          <FormattedMessage
            id="xpack.security.accountManagement.userProfile.passwordLabel"
            defaultMessage="Password"
          />
        }
        fullWidth
      >
        <EuiButton
          onClick={onShowPasswordForm}
          iconType="lock"
          data-test-subj="openChangePasswordForm"
        >
          <FormattedMessage
            id="xpack.security.accountManagement.userProfile.changePasswordButton"
            defaultMessage="Change password"
          />
        </EuiButton>
      </EuiFormRow>
    </EuiDescribedFormGroup>
  );
}

const UserRoles: FunctionComponent<UserRoleProps> = ({ user }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const onButtonClick = () => setIsPopoverOpen((isOpen) => !isOpen);
  const closePopover = () => setIsPopoverOpen(false);

  const firstThreeRoles = user.roles.slice(0, 3);
  const remainingRoles = user.roles.slice(3);

  const renderMoreRoles = () => {
    const button = (
      <EuiBadge
        onClick={onButtonClick}
        data-test-subj="userRolesExpand"
        onClickAriaLabel={i18n.translate(
          'xpack.security.accountManagement.userProfile.showMoreRolesHelpText',
          {
            defaultMessage: 'Show more roles',
          }
        )}
      >
        <FormattedMessage
          id="xpack.security.accountManagement.userProfile.rolesCountLabel"
          defaultMessage="+{count}"
          values={{ count: remainingRoles.length }}
        />
      </EuiBadge>
    );
    return (
      <EuiPopover
        panelPaddingSize="s"
        button={button}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        data-test-subj="userRolesPopover"
      >
        <EuiBadgeGroup
          gutterSize="xs"
          data-test-subj="remainingRoles"
          css={{
            maxWidth: '200px',
          }}
        >
          {remainingRoles.map((role) => (
            <EuiBadge color="hollow" key={role}>
              {role}
            </EuiBadge>
          ))}
        </EuiBadgeGroup>
      </EuiPopover>
    );
  };

  return (
    <>
      <EuiBadgeGroup gutterSize="xs" data-test-subj="displayedRoles">
        {firstThreeRoles.map((role) => (
          <EuiBadge key={role} color="hollow" data-test-subj={`role${role}`}>
            {role}
          </EuiBadge>
        ))}
        {remainingRoles.length ? renderMoreRoles() : null}
      </EuiBadgeGroup>
    </>
  );
};

export const UserProfile: FunctionComponent<UserProfileProps> = ({ user, data }) => {
  const { services } = useKibana<CoreStart>();
  const formik = useUserProfileForm({ user, data });
  const formChanges = useFormChanges();
  const titleId = useGeneratedHtmlId();
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);

  const isCloudUser = user.elastic_cloud_user;

  const { isThemeOverridden, isOverriddenThemeDarkMode } = determineIfThemeOverridden(
    services.settings.client,
    services.theme
  );

  return (
    <>
      <FormikProvider value={formik}>
        <FormChangesProvider value={formChanges}>
          <Breadcrumb text={user.username}>
            {showChangePasswordForm ? (
              <ChangePasswordModal
                username={user.username}
                onCancel={() => setShowChangePasswordForm(false)}
                onSuccess={() => setShowChangePasswordForm(false)}
              />
            ) : null}

            <KibanaPageTemplate className="eui-fullHeight" restrictWidth={true}>
              <KibanaPageTemplate.Header
                id={titleId}
                css={pageHeaderCSS}
                pageTitle={user.username}
                alignItems="bottom"
                pageTitleProps={{
                  'data-test-subj': 'username',
                  'aria-label': i18n.translate(
                    'xpack.security.accountManagement.userProfile.usernameLabel',
                    {
                      defaultMessage: 'Username',
                    }
                  ),
                }}
                description={
                  <EuiText component="span">
                    {user.full_name && (
                      <EuiText
                        data-test-subj="full_name"
                        component="span"
                        aria-label={i18n.translate(
                          'xpack.security.accountManagement.userProfile.fullNameLabel',
                          {
                            defaultMessage: 'Full name',
                          }
                        )}
                      >
                        {user.full_name}
                      </EuiText>
                    )}
                    {user.full_name && user.email && <EuiText component="span">, </EuiText>}
                    {user.email && (
                      <EuiText
                        data-test-subj="email"
                        component="span"
                        aria-label={i18n.translate(
                          'xpack.security.accountManagement.userProfile.emailLabel',
                          {
                            defaultMessage: 'Email address',
                          }
                        )}
                      >
                        {user.email}
                      </EuiText>
                    )}
                  </EuiText>
                }
                rightSideItems={[
                  <EuiDescriptionList
                    type="column"
                    data-test-subj="userRoles"
                    listItems={[
                      {
                        title: (
                          <FormattedMessage
                            id="xpack.security.accountManagement.userProfile.rolesLabel"
                            defaultMessage="{roles, plural,
                            one {Role}
                            other {Roles}
                            }"
                            values={{ roles: user.roles.length }}
                          />
                        ),
                        description: <UserRoles user={user} />,
                      },
                    ]}
                    compressed
                  />,
                ]}
              />
              <KibanaPageTemplate.Section>
                <Form aria-labelledby={titleId}>
                  <UserDetailsEditor user={user} />
                  {isCloudUser ? null : <UserAvatarEditor user={user} formik={formik} />}
                  <UserPasswordEditor
                    user={user}
                    onShowPasswordForm={() => setShowChangePasswordForm(true)}
                  />
                  {isCloudUser ? null : (
                    <UserSettingsEditor
                      formik={formik}
                      isThemeOverridden={isThemeOverridden}
                      isOverriddenThemeDarkMode={isOverriddenThemeDarkMode}
                    />
                  )}
                </Form>
              </KibanaPageTemplate.Section>
              {formChanges.count > 0 ? (
                <KibanaPageTemplate.BottomBar
                  paddingSize="m"
                  position="fixed"
                  data-test-subj={'userProfileBottomBar'}
                >
                  <SaveChangesBottomBar />
                </KibanaPageTemplate.BottomBar>
              ) : null}
            </KibanaPageTemplate>
          </Breadcrumb>
        </FormChangesProvider>
      </FormikProvider>
    </>
  );
};

export function useUserProfileForm({ user, data }: UserProfileProps) {
  const { services } = useKibana<CoreStart>();
  const { users } = useSecurityApiClients();

  const { update, showSuccessNotification } = useUpdateUserProfile({
    notificationSuccess: { enabled: false },
  });

  const [initialValues, resetInitialValues] = useState<UserProfileFormValues>({
    user: {
      full_name: user.full_name || '',
      email: user.email || '',
    },
    data: data
      ? {
          avatar: {
            initials: data.avatar?.initials || getUserAvatarInitials(user),
            color: data.avatar?.color || getUserAvatarColor(user),
            imageUrl: data.avatar?.imageUrl || '',
          },
          userSettings: {
            darkMode: data.userSettings?.darkMode || 'space_default',
            contrastMode: data.userSettings?.contrastMode || 'system',
          },
        }
      : undefined,
    avatarType: data?.avatar?.imageUrl ? 'image' : 'initials',
  });

  const [validateOnBlurOrChange, setValidateOnBlurOrChange] = useState(false);

  const formik = useFormik<UserProfileFormValues>({
    onSubmit: async (values) => {
      const submitActions = [];
      if (canUserChangeDetails(user, services.application.capabilities)) {
        submitActions.push(
          users.saveUser({
            username: user.username,
            roles: user.roles,
            enabled: user.enabled,
            full_name: values.user.full_name,
            email: values.user.email,
          })
        );
      }

      // Update profile only if it's available for the current user.
      if (values.data) {
        submitActions.push(
          update(
            values.avatarType === 'image'
              ? values.data
              : { ...values.data, avatar: { ...values.data.avatar, imageUrl: null } }
          )
        );
      }

      if (submitActions.length === 0) {
        return;
      }

      try {
        await Promise.all(submitActions);
      } catch (error) {
        services.notifications.toasts.addError(error, {
          title: i18n.translate('xpack.security.accountManagement.userProfile.submitErrorTitle', {
            defaultMessage: "Couldn't update profile",
          }),
        });
        return;
      }

      resetInitialValues(values);

      let isRefreshRequired = false;
      if (
        initialValues.data?.userSettings.darkMode !== values.data?.userSettings.darkMode ||
        initialValues.data?.userSettings.contrastMode !== values.data?.userSettings.contrastMode
      ) {
        isRefreshRequired = true;
      }
      showSuccessNotification({ isRefreshRequired });
    },
    initialValues,
    enableReinitialize: true,
    validateOnBlur: validateOnBlurOrChange,
    validateOnChange: validateOnBlurOrChange,
  });

  // We perform _the first_ validation only when the user submits the form to make UX less annoying. But after the user
  // submits the form, the validation model changes to on blur/change (as the user's mindset has changed from completing
  // the form to correcting the form).
  if (formik.submitCount > 0 && !validateOnBlurOrChange) {
    setValidateOnBlurOrChange(true);
  } else if (formik.submitCount === 0 && validateOnBlurOrChange) {
    setValidateOnBlurOrChange(false);
  }

  const customAvatarInitials = useRef(
    !!data?.avatar?.initials && data.avatar?.initials !== getUserAvatarInitials(user)
  );

  useUpdateEffect(() => {
    if (!customAvatarInitials.current) {
      const defaultInitials = getUserAvatarInitials({
        username: user.username,
        full_name: formik.values.user.full_name,
      });
      formik.setFieldValue('data.avatar.initials', defaultInitials);
    }
  }, [formik.values.user.full_name]);

  useUpdateEffect(() => {
    if (!customAvatarInitials.current && formik.values.data) {
      const defaultInitials = getUserAvatarInitials({
        username: user.username,
        full_name: formik.values.user.full_name,
      });
      customAvatarInitials.current = formik.values.data.avatar.initials !== defaultInitials;
    }
  }, [formik.values.data?.avatar.initials]);

  return formik;
}

export const SaveChangesBottomBar: FunctionComponent = () => {
  const formik = useFormikContext();
  const { count } = useFormChangesContext();

  return (
    <EuiFlexGroup alignItems="center" css={{ width: '100%' }} responsive={false}>
      <EuiFlexItem>
        <EuiFlexGroup responsive={false} gutterSize="xs">
          <EuiFlexItem grow={false}>
            <EuiIcon type="dot" color="success" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <FormattedMessage
              id="xpack.security.accountManagement.userProfile.unsavedChangesMessage"
              defaultMessage="{count, plural, one {# unsaved change} other {# unsaved changes}}"
              values={{ count }}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonEmpty onClick={formik.handleReset} color="text">
          <FormattedMessage
            id="xpack.security.accountManagement.userProfile.discardChangesButton"
            defaultMessage="Discard"
          />
        </EuiButtonEmpty>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButton
          onClick={formik.submitForm}
          data-test-subj="saveProfileChangesButton"
          isLoading={formik.isSubmitting}
          isDisabled={formik.submitCount > 0 && !formik.isValid}
          color="primary"
          iconType="save"
          fill
        >
          <FormattedMessage
            id="xpack.security.accountManagement.userProfile.saveChangesButton"
            defaultMessage="{isSubmitting, select, true{Saving changes…} other{Save changes}}"
            values={{ isSubmitting: formik.isSubmitting }}
          />
        </EuiButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

function determineIfThemeOverridden(
  settingsClient: IUiSettingsClient,
  theme: ThemeServiceStart
): {
  isThemeOverridden: boolean;
  isOverriddenThemeDarkMode: boolean;
} {
  return {
    isThemeOverridden: settingsClient.isOverridden('theme:darkMode'),
    isOverriddenThemeDarkMode: theme.getTheme().darkMode,
  };
}
