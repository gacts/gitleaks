const core = require('@actions/core') // docs: https://github.com/actions/toolkit/tree/main/packages/core
const tc = require('@actions/tool-cache') // docs: https://github.com/actions/toolkit/tree/main/packages/tool-cache
const github = require('@actions/github') // docs: https://github.com/actions/toolkit/tree/main/packages/github
const io = require('@actions/io') // docs: https://github.com/actions/toolkit/tree/main/packages/io
const exec = require('@actions/exec') // docs: https://github.com/actions/toolkit/tree/main/packages/exec
const path = require('path')

const trueCases = ['true', '1', 'yes', 'ok']

// read action inputs
const input = {
  version: core.getInput('version', {required: true}).replace(/^v/, ''), // strip the 'v' prefix
  configPath: core.getInput('config-path'),
  path: core.getInput('path'),
  run: trueCases.includes(core.getInput('run').toLowerCase()),
  failOnError: trueCases.includes(core.getInput('fail-on-error').toLowerCase()),
  githubToken: core.getInput('github-token'),
}

// main action entrypoint
async function run() {
  let versionToInstall

  if (input.version.toLowerCase() === 'latest') {
    core.debug('Requesting latest GitLeaks version...')
    versionToInstall = await getLatestGitLeaksVersion(input.githubToken)
  } else {
    versionToInstall = input.version
  }

  core.startGroup('💾 Install GitLeaks')
  core.info(`Version to install: ${versionToInstall}`)

  const distUri = getGitLeaksURI(process.platform, process.arch, versionToInstall)
  const distArchivePath = await tc.downloadTool(distUri)
  const extractedDistPath = distArchivePath + '-gitleaks'

  switch (true) {
    case distUri.toLowerCase().endsWith('tar.gz'):
      await tc.extractTar(distArchivePath, extractedDistPath)
      break

    case distUri.toLowerCase().endsWith('zip'):
      await tc.extractZip(distArchivePath, extractedDistPath)
      break

    default:
      throw new Error('Unsupported archive format')
  }

  core.debug(`Add ${extractedDistPath} to the $PATH`)
  core.addPath(extractedDistPath)
  core.endGroup()

  core.startGroup('🧪 Installation check')

  const gitLeaksBinPath = await io.which('gitleaks', true)

  core.info(`GitLeaks installed: ${gitLeaksBinPath}`)
  core.setOutput('gitleaks-bin', gitLeaksBinPath)

  if (versionToInstall.startsWith("8")) {
    await exec.exec(`"${gitLeaksBinPath}"`, ['version'], {silent: true})
  } else {
    throw new Error(`Unsupported version: ${versionToInstall}`)
  }

  core.endGroup()

  if (input.run) {
    core.info(`🔑 Run GitLeaks`)

    const sarifReportPath = path.join(extractedDistPath, 'gitleaks.sarif')
    core.setOutput('sarif', sarifReportPath)

    const sourcePath = input.path === "" ? process.cwd() : input.path
    const commonArgs = ['--verbose', '--report-format', 'sarif', '--report-path', sarifReportPath, '--source', sourcePath, 'detect']
    const configArgs = input.configPath === "" ? [] : ['--config', input.configPath]

    const exitCode = await exec.exec(
      `"${gitLeaksBinPath}"`,
      [...configArgs, ...commonArgs],
      {ignoreReturnCode: true, delay: 60 * 1000},
    )
    core.setOutput('exit-code', exitCode)

    if (exitCode !== 0) {
      core.warning('⛔ GitLeaks encountered leaks')
    } else {
      core.info('👍 Your code is good to go!')
    }

    if (input.failOnError) {
      process.exit(exitCode)
    }
  }
}

/**
 * @param {string} githubAuthToken
 * @returns {Promise<string>}
 */
async function getLatestGitLeaksVersion(githubAuthToken) {
  const octokit = github.getOctokit(githubAuthToken)

  // docs: https://octokit.github.io/rest.js/v18#repos-get-latest-release
  const latest = await octokit.rest.repos.getLatestRelease({
    owner: 'zricethezav',
    repo: 'gitleaks',
  })

  return latest.data.tag_name.replace(/^v/, '') // strip the 'v' prefix
}

/**
 * @link https://github.com/zricethezav/gitleaks/releases
 *
 * @param {('linux'|'darwin'|'win32')} platform
 * @param {('x32'|'x64'|'arm'|'arm64')} arch
 * @param {string} version E.g.: `8.8.4`
 *
 * @returns {string}
 *
 * @throws
 */
function getGitLeaksURI(platform, arch, version) {
  if (version.startsWith("8")) {
    switch (platform) {
      case 'linux': {
        switch (arch) {
          case 'x32': // 386
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x32.tar.gz`

          case 'x64': // Amd64
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz`

          case 'arm64': // Arm64
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_arm64.tar.gz`
        }

        throw new Error('Unsupported linux architecture')
      }

      case 'darwin': {
        switch (arch) {
          case 'x64': // Amd64
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks_${version}_darwin_x64.tar.gz`

          case 'arm64': // Arm64
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks_${version}_darwin_arm64.tar.gz`
        }

        throw new Error('Unsupported MacOS architecture')
      }

      case 'win32': {
        switch (arch) {
          case 'x32': // 386
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks_${version}_windows_x32.zip`

          case 'x64': // Amd64
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks_${version}_windows_x64.zip`

          case 'arm64': // Arm64
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks_${version}_windows_arm64.zip`
        }

        throw new Error('Unsupported windows architecture')
      }
    }

    throw new Error('Unsupported OS (platform)')
  }

  throw new Error(`Unsupported version: ${version}`)
}

// run the action
try {
  run()
} catch (error) {
  core.setFailed(error.message)
}
