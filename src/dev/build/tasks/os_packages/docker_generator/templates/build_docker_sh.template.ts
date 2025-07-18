/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import dedent from 'dedent';

import { TemplateContext } from '../template_context';

function generator({
  imageTag,
  imageFlavor,
  dockerPush,
  dockerTag,
  dockerTagQualifier,
  dockerCrossCompile,
  version,
  dockerTargetFilename,
  baseImageName,
  architecture,
}: TemplateContext) {
  const tag =
    (dockerTag ? dockerTag : version) + (dockerTagQualifier ? '-' + dockerTagQualifier : '');
  const dockerTargetName = `${imageTag}${imageFlavor}:${tag}`;
  const dockerArchitecture = architecture === 'aarch64' ? 'linux/arm64' : 'linux/amd64';
  const dockerfileName = architecture === 'aarch64' ? 'Dockerfile.aarch64' : 'Dockerfile.x86_64';
  const dockerBuild = dockerCrossCompile
    ? `docker buildx build --platform ${dockerArchitecture} -t ${dockerTargetName} -f ${dockerfileName} . || exit 1;`
    : `docker build -t ${dockerTargetName} -f ${dockerfileName} . || exit 1;`;
  return dedent(`
  #!/usr/bin/env bash
  #
  # ** THIS IS AN AUTO-GENERATED FILE **
  #
  set -euo pipefail

  retry_docker_pull() {
    image=$1
    attempt=0
    max_retries=5

    while true
    do
      attempt=$((attempt+1))

      if [ $attempt -gt $max_retries ]
      then
        echo "Docker pull retries exceeded, aborting."
        exit 1
      fi

      if docker pull "$image"
      then
        echo "Docker pull successful."
        break
      else
        echo "Docker pull unsuccessful, attempt '$attempt'. Retrying in 15s"
        sleep 15
      fi

    done
  }

  retry_docker_pull ${baseImageName}

  echo "Building: kibana${imageFlavor}-docker"; \\
  ${dockerBuild}

  docker save ${dockerTargetName} | gzip -c > ${dockerTargetFilename}

  ${dockerPush} && docker image push ${dockerTargetName}
  exit 0
  `);
}

export const buildDockerSHTemplate = {
  name: 'build_docker.sh',
  generator,
};
