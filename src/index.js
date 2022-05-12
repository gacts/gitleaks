const core = require('@actions/core') // docs: https://github.com/actions/toolkit/tree/main/packages/core
const tc = require('@actions/tool-cache') // docs: https://github.com/actions/toolkit/tree/main/packages/tool-cache
const github = require('@actions/github') // docs: https://github.com/actions/toolkit/tree/main/packages/github
const io = require('@actions/io') // docs: https://github.com/actions/toolkit/tree/main/packages/io
const exec = require('@actions/exec') // docs: https://github.com/actions/toolkit/tree/main/packages/exec
const cache = require('@actions/cache') // docs: https://github.com/actions/toolkit/tree/main/packages/cache
const path = require('path')
const os = require('os')
const fs = require('fs/promises')

// read action inputs
const input = {
  version: core.getInput('version', {required: true}).toLowerCase().replace(/^v/, ''), // strip the 'v' prefix
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
    core.info(`  🔑 Run GitLeaks`)

    const exitCode = await doRun(version)

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

  core.info(`Version to install: ${version} (target directory: ${pathToInstall})`)

  const cacheKey = `gitleaks-cache-v2-${version}-${process.platform}-${process.arch}`

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
    const distPath = await tc.downloadTool(distUri, path.join(os.tmpdir(), `gitleaks.tmp`))
    const binPath = path.join(pathToInstall, 'gitleaks' + (process.platform === 'win32' ? '.exe' : ''))

    switch (true) {
      case distUri.endsWith('tar.gz'):
        await tc.extractTar(distPath, pathToInstall)
        break

      case distUri.endsWith('zip'):
        await tc.extractZip(distPath, pathToInstall)
        break

      default: // not packed
        await io.mkdirP(pathToInstall)
        await io.mv(distPath, binPath)
        await fs.chmod(binPath, 0o755)
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

  if (version.startsWith('7')) {
    await exec.exec('gitleaks', ['--version'], {silent: true})
  } else { // v8.x and latest
    await exec.exec('gitleaks', ['version'], {silent: true})
  }
}

/**
 * @param {string} version
 *
 * @returns {Promise<number>}
 *
 * @throws
 */
async function doRun(version) {
  const sarifReportPath = path.join(os.tmpdir(), 'gitleaks.sarif')
  core.setOutput('sarif', sarifReportPath)

  const execArgs = []

  if (version.startsWith('7')) { // https://github.com/zricethezav/gitleaks/tree/v7.0.0#usage-and-options
    if (input.configPath !== "") {
      execArgs.push('--config-path', input.configPath)
    }

    execArgs.push(
      //'--verbose',
      '--redact',
      '--format', 'sarif',
      '--report', sarifReportPath,
      '--path', input.path === "" ? process.cwd() : input.path,
    )
  } else { // v8.x and latest, https://github.com/zricethezav/gitleaks/tree/v8.0.0#usage
    if (input.configPath !== "") {
      execArgs.push('--config', input.configPath)
    }

    execArgs.push(
      '--verbose',
      '--redact',
      '--report-format', 'sarif',
      '--report-path', sarifReportPath,
      '--source', input.path === "" ? process.cwd() : input.path,
      'detect',
    )
  }

  const exitCode = await exec.exec('gitleaks', execArgs, {ignoreReturnCode: true, delay: 60 * 1000})
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
  if (version.startsWith('7')) {
    switch (platform) {
      case 'linux': {
        switch (arch) {
          case 'x64': // Amd64
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks-linux-amd64`

          case 'arm': // Arm
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks-linux-arm`
        }

        throw new Error('Unsupported linux architecture for 7.x version')
      }

      case 'darwin': {
        switch (arch) {
          case 'x64': // Amd64
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks-darwin-amd64`
        }

        throw new Error('Unsupported MacOS architecture for 7.x version')
      }

      case 'win32': {
        switch (arch) {
          case 'x32': // 386
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks-windows-386.exe`

          case 'x64': // Amd64
            return `https://github.com/zricethezav/gitleaks/releases/download/v${version}/gitleaks-windows-amd64.exe`
        }

        throw new Error('Unsupported windows architecture for 7.x version')
      }
    }

    throw new Error('Unsupported OS (platform) for 7.x version')
  }

  switch (platform) { // v8.x and latest
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
