const core = require('@actions/core') // docs: https://github.com/actions/toolkit/tree/main/packages/core
const tc = require('@actions/tool-cache') // docs: https://github.com/actions/toolkit/tree/main/packages/tool-cache
const github = require('@actions/github') // docs: https://github.com/actions/toolkit/tree/main/packages/github
const io = require('@actions/io') // docs: https://github.com/actions/toolkit/tree/main/packages/io
const exec = require('@actions/exec') // docs: https://github.com/actions/toolkit/tree/main/packages/exec
const cache = require('@actions/cache') // docs: https://github.com/actions/toolkit/tree/main/packages/cache
const path = require('path')
const os = require('os')

// read action inputs
const input = {
  version: core.getInput('version', {required: true}).replace(/^v/, ''), // strip the 'v' prefix
  configPath: core.getInput('config-path'),
  path: core.getInput('path'),
  run: stringToBool(core.getInput('run')),
  failOnError: stringToBool(core.getInput('fail-on-error')),
  githubToken: core.getInput('github-token'),
}

// main action entrypoint
async function runAction() {
  let version

  if (input.version.toLowerCase().trim() === 'latest') {
    core.debug('Requesting latest GitLeaks version...')
    version = await getLatestGitLeaksVersion(input.githubToken)
  } else {
    version = input.version
  }

  core.startGroup('💾 Install GitLeaks')
  await doInstall(version)
  core.endGroup()

  core.startGroup('🧪 Installation check')
  await doCheck(version)
  core.endGroup()

  if (input.run) {
    const exitCode = await doRun()

    if (exitCode !== 0) {
      core.warning('⛔ GitLeaks encountered leaks')

      if (input.failOnError) {
        process.exit(exitCode)
      }
    } else {
      core.info('👍 Your code is good to go!')
    }
  }
}

/**
 * @param {string} version
 *
 * @returns {Promise<void>}
 *
 * @throws
 */
async function doInstall(version) {
  const pathToInstall = path.join(os.tmpdir(), `gitleaks-${version}`)

  core.info(`Version to install: ${version} (path: ${pathToInstall})`)

  const cacheKey = `gitleaks-${version}-${process.platform}-${process.arch}`

  let restoredFromCache = undefined

  try {
    restoredFromCache = await cache.restoreCache([pathToInstall], cacheKey)
  } catch (e) {
    core.warning(e)
  }

  if (restoredFromCache !== undefined) { // cache HIT
    core.info(`👌 Restored from cache`)
  } else { // cache MISS
    const distUri = getGitLeaksURI(process.platform, process.arch, version)
    const distArchivePath = await tc.downloadTool(distUri)

    switch (true) {
      case distUri.endsWith('tar.gz'):
        await tc.extractTar(distArchivePath, pathToInstall)
        break

      case distUri.endsWith('zip'):
        await tc.extractZip(distArchivePath, pathToInstall)
        break

      default:
        throw new Error(`Unsupported archive format: ${distUri}`)
    }

    try {
      await cache.saveCache([pathToInstall], cacheKey)
    } catch (e) {
      core.warning(e)
    }
  }

  core.addPath(pathToInstall)
}

/**
 * @param {string} version
 *
 * @returns {Promise<void>}
 *
 * @throws
 */
async function doCheck(version) {
  const gitLeaksBinPath = await io.which('gitleaks', true)

  if (gitLeaksBinPath === "") {
    throw new Error('gitleaks binary file not found in $PATH')
  }

  core.info(`GitLeaks installed: ${gitLeaksBinPath}`)
  core.setOutput('gitleaks-bin', gitLeaksBinPath)

  if (version.startsWith("8")) {
    await exec.exec('gitleaks', ['version'], {silent: true})
  } else {
    throw new Error(`Unsupported version: ${version}`)
  }
}

/**
 * @returns {Promise<number>}
 *
 * @throws
 */
async function doRun() {
  core.info(`🔑 Run GitLeaks`)

  const sarifReportPath = path.join(os.tmpdir(), 'gitleaks.sarif')
  core.setOutput('sarif', sarifReportPath)

  const sourcePath = input.path === "" ? process.cwd() : input.path
  const commonArgs = ['--verbose', '--report-format', 'sarif', '--report-path', sarifReportPath, '--source', sourcePath, 'detect']
  const configArgs = input.configPath === "" ? [] : ['--config', input.configPath]

  const exitCode = await exec.exec(
    'gitleaks', [...configArgs, ...commonArgs], {ignoreReturnCode: true},
  )
  core.setOutput('exit-code', exitCode)

  return exitCode
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

/**
 * @param {string} s
 *
 * @returns boolean
 */
function stringToBool(s) {
  return ['true', '1', 'yes', 'ok'].includes(s.toLowerCase())
}

// run the action
(async () => {
  await runAction()
})().catch(error => {
  core.setFailed(error.message)
})
