import { getOctokit } from '@actions/github'
import { parseVersion } from './utils'

/**
 * Fetches the latest release version of gitleaks from GitHub.
 */
export const latestVersion = async (githubAuthToken: string): Promise<string> => {
  const octokit = getOctokit(githubAuthToken)

  const latest = await octokit.rest.repos.getLatestRelease({
    owner: 'gitleaks',
    repo: 'gitleaks',
  })

  return latest.data.tag_name.trim().replace(/^[vV]/, '') // strip the 'v' prefix
}

const BASE_URL = 'https://github.com/gitleaks/gitleaks/releases/download/'

/**
 * Builds the download URL for a given platform, architecture, and version.
 *
 * @link https://github.com/gitleaks/gitleaks/releases
 * @throws {Error} on an invalid version or an unsupported platform/arch combination
 */
export const distUrl = (platform: typeof process.platform, arch: typeof process.arch, version: string): URL => {
  version = version.trim().replace(/^[vV]/, '') // strip the 'v' prefix
  const { major } = parseVersion(version) ?? {}

  if (major === undefined) {
    throw new Error(`Invalid version: ${version}`)
  }

  const asset = (name: string): URL => new URL(`${BASE_URL}v${version}/${name}`)
  const unsupported = (): Error => new Error(`Unsupported platform/arch (${platform}/${arch}) for v${version}`)

  // v7.x and older
  if (major <= 7) {
    if (arch !== 'x64') {
      throw unsupported()
    }

    switch (platform) {
      case 'linux':
        return asset('gitleaks-linux-amd64')
      case 'darwin':
        return asset('gitleaks-darwin-amd64')
      case 'win32':
        return asset('gitleaks-windows-amd64.exe')
    }

    throw unsupported()
  }

  // v8.x and newer
  if (arch !== 'x64' && arch !== 'arm64') {
    throw unsupported()
  }

  switch (platform) {
    case 'linux':
      return asset(`gitleaks_${version}_linux_${arch}.tar.gz`)
    case 'darwin':
      return asset(`gitleaks_${version}_darwin_${arch}.tar.gz`)
    case 'win32':
      return asset(`gitleaks_${version}_windows_${arch}.zip`)
  }

  throw unsupported()
}
