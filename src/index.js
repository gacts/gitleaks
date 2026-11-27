import { addPath, debug, endGroup, getInput, info, setFailed, setOutput, startGroup, warning } from '@actions/core' // docs: https://github.com/actions/toolkit/tree/main/packages/core
import { downloadTool, extractTar, extractZip } from '@actions/tool-cache' // docs: https://github.com/actions/toolkit/tree/main/packages/tool-cache
import { getOctokit } from '@actions/github' // docs: https://github.com/actions/toolkit/tree/main/packages/github
import { mkdirP, mv, which } from '@actions/io' // docs: https://github.com/actions/toolkit/tree/main/packages/io
import { exec } from '@actions/exec' // docs: https://github.com/actions/toolkit/tree/main/packages/exec
import { restoreCache, saveCache } from '@actions/cache' // docs: https://github.com/actions/toolkit/tree/main/packages/cache
import path from 'path'
import os from 'os'
import fs from 'fs/promises'

// read action inputs
const input = {
  version: getInput('version', { required: true }).toLowerCase().replace(/^[vV]/, ''), // strip the 'v' prefix
  configPath: getInput('config-path'),
  path: getInput('path'),
  run: stringToBool(getInput('run')),
  failOnError: stringToBool(getInput('fail-on-error')),
  githubToken: getInput('github-token'),
}

// main action entrypoint
async function runAction() {
  let version

  if (input.version.toLowerCase().trim() === 'latest') {
    debug('Requesting latest GitLeaks version...')
    version = await getLatestGitLeaksVersion(input.githubToken)
    debug(`Latest version: ${version}`)
  } else {
    version = input.version
  }

  startGroup('💾 Install GitLeaks')
  await doInstall(version)
  endGroup()

  startGroup('🧪 Installation check')
  await doCheck(version)
  endGroup()

  if (input.run) {
    info('  🔑 Run GitLeaks')

    const exitCode = await doRun(version)

    if (exitCode !== 0) {
      warning('⛔ GitLeaks encountered leaks')

      if (input.failOnError) {
        process.exit(exitCode)
      }
    } else {
      info('👍 Your code is good to go!')
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

  info(`Version to install: ${version} (target directory: ${pathToInstall})`)

  const cacheKey = `gitleaks-cache-v2-${version}-${process.platform}-${process.arch}`

  let restoredFromCache = undefined

  try {
    restoredFromCache = await restoreCache([pathToInstall], cacheKey)
  } catch (e) {
    warning(e)
  }

  if (restoredFromCache !== undefined) {
    // cache HIT
    info(`👌 Restored from cache`)
  } else {
    // cache MISS
    const distUri = getDistUrl(process.platform, process.arch, version)
    const distPath = await downloadTool(distUri, path.join(os.tmpdir(), `gitleaks.tmp`))
    const binPath = path.join(pathToInstall, 'gitleaks' + (process.platform === 'win32' ? '.exe' : ''))

    switch (true) {
      case distUri.endsWith('tar.gz'):
        await extractTar(distPath, pathToInstall)
        break

      case distUri.endsWith('zip'):
        await extractZip(distPath, pathToInstall)
        break

      default: // not packed
        await mkdirP(pathToInstall)
        await mv(distPath, binPath)
        await fs.chmod(binPath, 0o755)
    }

    try {
      await saveCache([pathToInstall], cacheKey)
    } catch (e) {
      warning(e)
    }
  }

  addPath(pathToInstall)
}

/**
 * @param {string} version
 *
 * @returns {Promise<void>}
 *
 * @throws {Error}
 */
async function doCheck(version) {
  const gitLeaksBinPath = await which('gitleaks', true)

  if (gitLeaksBinPath === '') {
    throw new Error('gitleaks binary file not found in $PATH')
  }

  info(`GitLeaks installed: ${gitLeaksBinPath}`)
  setOutput('gitleaks-bin', gitLeaksBinPath)

  const parsedVersion = parseVersion(version)

  if (parsedVersion && parsedVersion.major <= 7) {
    await exec('gitleaks', ['--version'], { silent: true })
  } else {
    // v8.x and latest
    await exec('gitleaks', ['version'], { silent: true })
  }
}

/**
 * @param {string} version
 *
 * @returns {Promise<number>}
 *
 * @throws {Error}
 */
async function doRun(version) {
  const alternativeConfig = await findAlternativeConfigFile()
  const parsedVersion = parseVersion(version)
  const envConfigPath = process.env['GITLEAKS_CONFIG']
  const sarifReportPath = path.join(os.tmpdir(), 'gitleaks.sarif')
  const execArgs = []

  switch (true) {
    // https://github.com/gitleaks/gitleaks/tree/v7.0.0#usage-and-options
    case parsedVersion && parsedVersion.major <= 7: {
      if (input.configPath) {
        execArgs.push('--config-path', input.configPath)
      } else if (envConfigPath) {
        // do nothing, gitleaks app should process this variable on its own side
      } else if (alternativeConfig) {
        info(`  🗒 Alternative config file found: ${alternativeConfig}`)
        execArgs.push('--config-path', alternativeConfig)
      }

      execArgs.push(
        '--verbose',
        '--redact',
        '--format',
        'sarif',
        '--report',
        sarifReportPath,
        '--path',
        input.path === '' ? process.cwd() : input.path
      )
      break
    }

    // https://github.com/gitleaks/gitleaks/tree/v8.18.0#usage
    case parsedVersion && parsedVersion.major === 8 && parsedVersion.minor <= 18: {
      if (input.configPath) {
        execArgs.push('--config', input.configPath)
      } else if (envConfigPath) {
        // do nothing, gitleaks app should process this variable on its own side
      } else if (alternativeConfig) {
        info(`  🗒 Alternative config file found: ${alternativeConfig}`)
        execArgs.push('--config', alternativeConfig)
      }

      execArgs.push(
        '--verbose',
        '--redact',
        '--report-format',
        'sarif',
        '--report-path',
        sarifReportPath,
        '--source',
        input.path === '' ? process.cwd() : input.path,
        'detect'
      )
      break
    }

    // https://github.com/gitleaks/gitleaks/tree/v8.19.0#usage
    //
    // https://github.com/gitleaks/gitleaks/pull/1504
    // https://github.com/gacts/gitleaks/issues/129
    default: {
      if (input.configPath) {
        execArgs.push('--config', input.configPath)
      } else if (envConfigPath) {
        // do nothing, gitleaks app should process this variable on its own side
      } else if (alternativeConfig) {
        info(`  🗒 Alternative config file found: ${alternativeConfig}`)
        execArgs.push('--config', alternativeConfig)
      }

      const [subCmdName, subCmdPath] = await (async () => {
        const cwd = process.cwd()
        const gitStat = await fs.stat(path.join(cwd, '.git'), { throwIfNoEntry: false })
        const cwdIsGitRepo = gitStat && gitStat.isDirectory()

        if (cwdIsGitRepo) {
          return ['git', cwd]
        }

        if (input.path !== '') {
          return ['dir', input.path]
        }

        return ['dir', cwd]
      })()

      execArgs.push(
        subCmdName,
        '--verbose',
        '--redact',
        '100',
        '--report-format',
        'sarif',
        '--report-path',
        sarifReportPath,
        subCmdPath
      )
      break
    }
  }

  const exitCode = await exec('gitleaks', execArgs, { ignoreReturnCode: true, delay: 60 * 1000 })
  setOutput('exit-code', exitCode)
  setOutput('sarif', sarifReportPath)

  return exitCode
}

/**
 * @returns {Promise<string|undefined>} Returns undefined when nothing found
 */
async function findAlternativeConfigFile() {
  const cwd = process.cwd()

  const locations = [
    path.join(cwd, 'gitleaks.toml'),
    path.join(cwd, '.gitleaks.toml'),
    path.join(cwd, '.github', 'gitleaks.toml'),
    path.join(cwd, '.github', '.gitleaks.toml'),
  ]

  for (let i = 0; i < locations.length; i++) {
    try {
      const stat = await fs.stat(locations[i])

      if (stat.isFile() && stat.size > 0) {
        // file exists and not empty
        return locations[i]
      }
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // file was not found
    }
  }

  return undefined
}

/**
 * @param {string} githubAuthToken
 * @returns {Promise<string>}
 */
async function getLatestGitLeaksVersion(githubAuthToken) {
  /** @type {import('@actions/github')} */
  const octokit = getOctokit(githubAuthToken)

  // docs: https://octokit.github.io/rest.js/v18#repos-get-latest-release
  const latest = await octokit.rest.repos.getLatestRelease({
    owner: 'gitleaks',
    repo: 'gitleaks',
  })

  return latest.data.tag_name.replace(/^[vV]/, '') // strip the 'v' prefix
}

/**
 * @link https://github.com/gitleaks/gitleaks/releases
 *
 * @param {('linux'|'darwin'|'win32')} platform
 * @param {('x32'|'x64'|'arm'|'arm64')} arch
 * @param {string} version E.g.: `8.8.4`
 *
 * @returns {string}
 *
 * @throws {Error} Unsupported platform, architecture, or version
 */
function getDistUrl(platform, arch, version) {
  const baseUrl = `https://github.com/gitleaks/gitleaks/releases/download/v${version}`
  const parsedVersion = parseVersion(version)

  if (parsedVersion && parsedVersion.major <= 7) {
    switch (platform) {
      case 'linux': {
        switch (arch) {
          case 'x64': // Amd64
            return `${baseUrl}/gitleaks-linux-amd64`

          case 'arm': // Arm
            return `${baseUrl}/gitleaks-linux-arm`
        }

        throw new Error(`Unsupported linux architecture (${arch}) for 7.x version`)
      }

      case 'darwin': {
        switch (arch) {
          case 'x64': // Amd64
            return `${baseUrl}/gitleaks-darwin-amd64`

          case 'arm64': // Arm64
            return `${baseUrl}/gitleaks-darwin-arm64`
        }

        throw new Error(`Unsupported MacOS architecture (${arch}) for 7.x version`)
      }

      case 'win32': {
        switch (arch) {
          case 'x32': // 386
            return `${baseUrl}/gitleaks-windows-386.exe`

          case 'x64': // Amd64
            return `${baseUrl}/gitleaks-windows-amd64.exe`
        }

        throw new Error(`Unsupported windows architecture (${arch}) for 7.x version`)
      }
    }

    throw new Error(`Unsupported platform (${platform}) for 7.x version`)
  }

  switch (
    platform // v8.x and latest
  ) {
    case 'linux': {
      switch (arch) {
        case 'x64': // Amd64
          return `${baseUrl}/gitleaks_${version}_linux_x64.tar.gz`

        case 'arm64': // Arm64
          return `${baseUrl}/gitleaks_${version}_linux_arm64.tar.gz`
      }

      throw new Error(`Unsupported linux architecture (${arch})`)
    }

    case 'darwin': {
      switch (arch) {
        case 'x64': // Amd64
          return `${baseUrl}/gitleaks_${version}_darwin_x64.tar.gz`

        case 'arm64': // Arm64
          return `${baseUrl}/gitleaks_${version}_darwin_arm64.tar.gz`
      }

      throw new Error(`Unsupported macOS architecture (${arch})`)
    }

    case 'win32': {
      switch (arch) {
        case 'x64': // Amd64
          return `${baseUrl}/gitleaks_${version}_windows_x64.zip`

        case 'arm64': // Arm64
          return `${baseUrl}/gitleaks_${version}_windows_arm64.zip`
      }

      throw new Error(`Unsupported windows architecture (${arch})`)
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

/**
 * Parses version string into an object with major, minor, and patch numbers.
 *
 * @param input
 * @return {{major: number, minor: number, patch: number}|null}
 */
function parseVersion(input) {
  if (typeof input !== 'string') {
    return null
  }

  const m = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i.exec(input)
  if (!m) {
    return null
  }

  const [major, minor, patch] = [m[1], m[2], m[3]].map((n) => (n === undefined ? 0 : Number(n)))
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return null
  }

  return { major, minor, patch }
}

// run the action
;(async () => {
  await runAction()
})().catch((error) => {
  setFailed(error.message)
})
