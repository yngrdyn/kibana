/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PackageClient } from '@kbn/fleet-plugin/server';
import { PackageNotFoundError } from '@kbn/fleet-plugin/server/errors';
import { DataStreamType } from '../../../common/types';
import { Integration } from '../../../common/api_types';

export async function getIntegrations(options: {
  packageClient: PackageClient;
  type?: DataStreamType;
}): Promise<Integration[]> {
  const { packageClient, type } = options;

  const installedPackages = await packageClient.getInstalledPackages(type);

  return Promise.all(
    installedPackages.items.map(async (p) => ({
      name: p.name,
      title: p.title,
      version: p.version,
      icons: p.icons,
      datasets: await getDatasets({
        packageClient,
        name: p.name,
        version: p.version,
        dataStreams: p.dataStreams,
        type,
      }),
    }))
  );
}

const getDatasets = async (options: {
  packageClient: PackageClient;
  name: string;
  version: string;
  dataStreams: any[];
  type?: DataStreamType;
}) => {
  try {
    const { packageClient, name, version, type } = options;

    const pkg = await packageClient.getPackage(name, version);

    return pkg.packageInfo.data_streams?.reduce((acc, curr) => {
      if (!!type && curr.type !== type) {
        return acc;
      }

      return {
        ...acc,
        [`${type}-${curr.dataset}-*`]: curr.title,
      };
    }, {});
  } catch (error) {
    if (!(error instanceof PackageNotFoundError)) {
      return {};
    }

    return options.dataStreams.reduce(
      (acc, curr) => ({
        ...acc,
        [curr.name]: curr.title,
      }),
      {}
    );
  }
};
