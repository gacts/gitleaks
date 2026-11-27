import { restoreCache, saveCache } from '@actions/cache'
import { addPath, endGroup, getInput, info, setFailed, setOutput, startGroup, summary, warning } from '@actions/core'
import { exec } from '@actions/exec'
import { mkdirP, mv, which } from '@actions/io'
import { downloadTool, extractTar, extractZip } from '@actions/tool-cache'
import { chmod, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { distUrl, latestVersion } from './dist'
import { isGitRepo, parseVersion, stringToBool } from './utils'

// read action inputs
const input = {
  version: getInput('version', { required: true }).toLowerCase().replace(/^[vV]/, ''), // strip the 'v' prefix
  configPath: getInput('config-path'),
  path: getInput('path'),
  run: stringToBool(getInput('run')),
  failOnError: stringToBool(getInput('fail-on-error')),
  githubToken: getInput('github-token'),
} as const

/**
 * Lookups for a repository config file (`gitleaks.toml`, `.gitleaks.toml`) in the given root directory and its
 * `.github` subdir.
 */
const findConfigFile = async (root: string): Promise<string | undefined> => {
  for (const filePath of [
    join(root, 'gitleaks.toml'),
    join(root, '.gitleaks.toml'),
    join(root, '.github', 'gitleaks.toml'),
    join(root, '.github', '.gitleaks.toml'),
  ]) {
    const stats = await stat(filePath, { throwIfNoEntry: false })
    if (stats && stats.isFile() && stats.size > 0) {
      return filePath
    }
  }

  return undefined
}

/**
 * Installs the specified version of `gitleaks` to a temporary directory and caches it for future runs.
 *
 * It returns the path to the installed executable.
 */
const install = async (version: string): Promise<string> => {
  const dirPath = join(tmpdir(), `gitleaks-${version}`)
  const binPath = join(dirPath, 'gitleaks' + (process.platform === 'win32' ? '.exe' : ''))
  const cacheKey = `gitleaks-cache-v2-${version}-${process.platform}-${process.arch}`

  info(`Version to install: ${version} (target directory: ${dirPath})`)

  // try to restore from cache
  try {
    if (!!(await restoreCache([dirPath], cacheKey))) {
      info(`👌 Restored from cache`)

      return binPath
    }
  } catch (err) {
    warning(err instanceof Error ? err.message : String(err))
  }

  const url = distUrl(process.platform, process.arch, version)
  const tmpDistPath = await downloadTool(url.toString(), join(tmpdir(), `gitleaks.tmp`))
  const fNameLow = (url.pathname.split('/').pop() ?? '').toLowerCase()

  // unpack the downloaded distribution
  switch (true) {
    case fNameLow.endsWith('tar.gz'): {
      await extractTar(tmpDistPath, dirPath)
      break
    }

    case fNameLow.endsWith('zip'): {
      await extractZip(tmpDistPath, dirPath)
      break
    }

    default: {
      // not packed
      await mkdirP(dirPath)
      await mv(tmpDistPath, binPath)
      await chmod(binPath, 0o755)
    }
  }

  // cleanup
  try {
    await rm(tmpDistPath, { recursive: true, force: true })
  } catch {
    // do nothing
  }

  // save to cache
  try {
    await saveCache([dirPath], cacheKey)
  } catch (err) {
    warning(err instanceof Error ? err.message : String(err))
  }

  return binPath
}

/**
 * Checks if the `gitleaks` executable is available in the system PATH and can be executed.
 *
 * @throws {Error} if the executable is not found or cannot be executed
 */
const checkInstall = async (version: string): Promise<void> => {
  const bin = 'gitleaks'
  const location = await which(bin, true)
  const { major } = parseVersion(version) ?? {}

  if (!location) {
    throw new Error(`Executable '${bin}' not found in $PATH`)
  }

  const args: Array<string> = []

  if (major && major <= 7) {
    args.push('--version')
  } else {
    args.push('version')
  }

  await exec(bin, args, { silent: true }) // will throw if the command fails
}

/**
 * Publishes the GitLeaks SARIF report to the GitHub Actions summary.
 */
const publishSummary = async (reportPath: string): Promise<void> => {
  const stats = await stat(reportPath, { throwIfNoEntry: false })

  if (!stats || !stats.isFile() || stats.size === 0) {
    return
  }

  const content = await readFile(reportPath, 'utf8')
  const sarif = JSON.parse(content) as { runs?: Array<{ results?: Array<unknown> }> }

  if (typeof sarif !== 'object' || sarif === null || !Array.isArray(sarif.runs)) {
    return
  }

  const findings = sarif.runs.flatMap((run) => run.results ?? [])

  if (findings.length > 0) {
    await summary
      .addHeading('🔐 GitLeaks Report', 2)
      .addCodeBlock(JSON.stringify(findings, null, 2), 'json')
      .write()
  }
}

/**
 * Builds the command line arguments for the `gitleaks` executable.
 */
const buildExecArgs = async (
  version: string,
  targetPath: string,
  opts?: Partial<{
    configPath: string
    reportPath: string
  }>
): Promise<Array<string>> => {
  const { major, minor } = parseVersion(version) ?? {}
  const args: Array<string> = []

  // https://github.com/gitleaks/gitleaks/tree/v7.0.0#usage-and-options
  if (major && major <= 7) {
    if (opts?.configPath) {
      args.push('--config-path', opts.configPath)
    }

    args.push('--verbose', '--redact', '--format', 'sarif')

    if (opts?.reportPath) {
      args.push('--report', opts.reportPath)
    }

    args.push('--path', targetPath)

    return args
  }

  // https://github.com/gitleaks/gitleaks/tree/v8.18.0#usage
  if (major === 8 && minor !== undefined && minor <= 18) {
    if (opts?.configPath) {
      args.push('--config', opts.configPath)
    }

    args.push('--verbose', '--redact', '--report-format', 'sarif')

    if (opts?.reportPath) {
      args.push('--report-path', opts.reportPath)
    }

    args.push('--source', targetPath, 'detect')

    return args
  }

  // https://github.com/gitleaks/gitleaks/tree/v8.19.0#usage
  //
  // https://github.com/gitleaks/gitleaks/pull/1504
  // https://github.com/gacts/gitleaks/issues/129
  if (opts?.configPath) {
    args.push('--config', opts.configPath)
  }

  args.push('--verbose', '--redact=100', '--report-format', 'sarif')

  if (opts?.reportPath) {
    args.push('--report-path', opts.reportPath)
  }

  args.push((await isGitRepo(targetPath)) ? 'git' : 'dir', targetPath)

  return args
}

try {
  const version = await (async (): Promise<string> => {
    if (input.version.toLowerCase().trim() === 'latest') {
      return await latestVersion(input.githubToken)
    }

    return input.version
  })()

  startGroup('💾 Install GitLeaks')
  const binPath = await install(version)
  addPath(dirname(binPath))
  setOutput('gitleaks-bin', binPath)
  endGroup()

  startGroup('🧪 Installation check')
  await checkInstall(version)
  endGroup()

  if (input.run) {
    info('  🔑 Run GitLeaks')

    const root = process.env.GITHUB_WORKSPACE ?? process.cwd()
    const configPath = input.configPath || process.env.GITLEAKS_CONFIG || (await findConfigFile(root))
    const reportPath = join(tmpdir(), 'gitleaks.sarif')

    const exitCode = await exec(
      binPath,
      await buildExecArgs(version, input.path || root, {
        configPath,
        reportPath,
      }),
      {
        ignoreReturnCode: true,
        delay: 60 * 1000,
      }
    )

    setOutput('exit-code', exitCode)
    setOutput('sarif', reportPath)

    try {
      await publishSummary(reportPath)
    } catch (err) {
      warning(err instanceof Error ? err.message : String(err))
    }

    if (exitCode !== 0) {
      warning('⛔ GitLeaks encountered leaks')

      if (input.failOnError) {
        process.exitCode = exitCode
      }
    } else {
      info('👍 Your code is good to go!')
    }
  }
} catch (err) {
  setFailed(err instanceof Error ? err.message : String(err))
}
