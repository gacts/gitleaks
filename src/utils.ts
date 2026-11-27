import { access } from 'fs/promises'
import { join } from 'path'

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on'])

/**
 * Converts a string to a boolean value. Returns true for 'true', '1', 'yes', 'on' (case-insensitive), and false
 * for any other value.
 */
export const stringToBool = (value: string): boolean =>
  TRUE_VALUES.has(
    value
      .trim()
      .replace(/^(['"`])(.*)\1$/, '$2')
      .trim()
      .toLowerCase()
  )

/**
 * Parses a version string in the format of "major.minor.patch" and returns an object with the major, minor, and
 * patch numbers.
 *
 * If the version string is invalid, it returns null.
 *
 * @example
 * ```ts
 * parseVersion('1.2.3')      // { major: 1, minor: 2, patch: 3 }
 * parseVersion('v1.2 ')      // { major: 1, minor: 2, patch: 0 }
 * parseVersion('  V1 ')      // { major: 1, minor: 0, patch: 0 }
 * parseVersion('3.2.1-beta') // { major: 3, minor: 2, patch: 1 }
 * parseVersion('invalid')    // null
 * ```
 */
export const parseVersion = (version: string): { major: number; minor: number; patch: number } | null => {
  const m = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i.exec(version)
  if (!m) {
    return null
  }

  const [major, minor, patch] = [m[1], m[2], m[3]].map((n) => (n === undefined ? 0 : Number(n)))
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return null
  }

  return { major, minor, patch }
}

/**
 * Checks if the given directory is a Git repository by checking for the presence of a `.git` (file for submodules
 * or folder for regular repos) in the given directory.
 */
export const isGitRepo = async (dir: string): Promise<boolean> => {
  try {
    await access(join(dir, '.git'))

    return true
  } catch {
    return false
  }
}
