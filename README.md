<p align="center">
  <img src="https://github.com/gacts/gitleaks/assets/7326800/778c1c79-c36b-4a52-83cd-3ab2a2bb8f3e" alt="Logo" width="250" />
</p>

# Run [GitLeaks][gitleaks] action

![Release version][badge_release_version]
[![Build Status][badge_build]][link_build]
[![License][badge_license]][link_license]

This action installs [GitLeaks][gitleaks] of the requested version (`latest` by default) and runs it. Add it to
your workflow and forget about it. It works on **Linux** (`ubuntu-latest`), **macOS** (`macos-latest`), and
**Windows** (`windows-latest`).

If you need custom GitLeaks flags, set `with.run: false` to only install it, and run `gitleaks` yourself - the binary
is added to `PATH`, and its location is available in the `gitleaks-bin` [output](#outputs).

Why this one:

- **No license key** - works in any repository, including private ones (unlike the
  [official action](https://github.com/gitleaks/gitleaks-action)).
- **No Docker/building in runtime** - it is a native JavaScript action (no image to pull or build, no extra overhead).
- **Caching** - the GitLeaks binary is cached between runs, so the useful work starts in about 3 seconds.

> [!TIP]
> If neither `with.config-path` nor the `GITLEAKS_CONFIG` environment variable is set, the action uses the first
> existing non-empty [config file](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml) from:
> `gitleaks.toml`, `.gitleaks.toml`, `.github/gitleaks.toml`, `.github/.gitleaks.toml` _(relative to the repository
> root)_. Otherwise, the GitLeaks default config is used.

## Additional Configuration

### `gitleaks:allow`

> [!NOTE]
> Since GitLeaks **v8.10.0**

If you are knowingly committing a test secret that GitLeaks will catch you can add a `gitleaks:allow` comment to
that line, which instructs GitLeaks to ignore that secret. Example:

```python
class CustomClass:
    discord_client_secret = '8dyfuiRyq=vVc3RRr_edRk-fK__JItpZ' #gitleaks:allow
```

### `.gitleaksignore`

> [!NOTE]
> Since GitLeaks **v8.10.0**

You can ignore specific findings by creating a `.gitleaksignore` file at the root of your repo. In release v8.10.0
GitLeaks added a `Fingerprint` value to the GitLeaks report. Each leak, or finding, has a Fingerprint that uniquely
identifies a secret. Add this fingerprint to the `.gitleaksignore` file to ignore that specific secret. See
GitLeaks' [.gitleaksignore](https://github.com/gitleaks/gitleaks/blob/master/.gitleaksignore) for an example.

> [!NOTE]
> This feature is experimental and is subject to change in the future.

## Usage

```yaml
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with: {fetch-depth: 0}

      - name: Check for GitLeaks
        uses: gacts/gitleaks@v1
        #id: gitleaks
        #with:
        #  version: latest
        #  config-path: .github/.gitleaks.toml
        #  path: any/directory/path

      #- if: ${{ always() }} # reason - https://github.com/gitleaks/gitleaks/issues/782
      #  uses: github/codeql-action/upload-sarif@v4
      #  with:
      #    sarif_file: ${{ steps.gitleaks.outputs.sarif }}
```

> [!NOTE]
> Use `actions/checkout` before the `gacts/gitleaks` step. To scan the full git history, set `fetch-depth: 0`
> (by default, only the latest commit is checked out).

## Customizing

### Inputs

The following inputs can be used as `step.with` keys:

| Name               |    Type   |          Default          | Required | Description                                                      |
|--------------------|:---------:|:-------------------------:|:--------:|------------------------------------------------------------------|
| `version`          |  `string` |          `latest`         |   yes    | GitLeaks version (`latest` or in `1.2.3` format)                 |
| `config-path`      |  `string` |      auto-discovered      |    no    | Path to the config file (see the tip above for the lookup order) |
| `path`             |  `string` | current working directory |    no    | Path to the repository, directory, or file                       |
| `run`              | `boolean` |           `true`          |    no    | Set to `false` to only install GitLeaks without running it       |
| `fail-on-error`    | `boolean` |           `true`          |    no    | Set to `false` to not fail the step when GitLeaks finds leaks    |
| `generate-summary` | `boolean` |           `true`          |    no    | Publish the findings to the job summary                          |
| `github-token`     |  `string` |   `${{ github.token }}`   |    no    | GitHub auth token (used to resolve the `latest` version)         |

### Outputs

In subsequent steps you will be able to use the following variables:

| Description                                                     | How to use in your workflow                  | Example                        |
|-----------------------------------------------------------------|----------------------------------------------|--------------------------------|
| Path to the GitLeaks binary file                                | `${{ steps.gitleaks.outputs.gitleaks-bin }}` | `/tmp/gitleaks-8.7.1/gitleaks` |
| Path to the report in [SARIF format][sarif]                     | `${{ steps.gitleaks.outputs.sarif }}`        | `/tmp/gitleaks.sarif`          |
| GitLeaks exit code (set only if `inputs.run` is `true`)         | `${{ steps.gitleaks.outputs.exit-code }}`    | `1`                            |

## How do I remove a secret from git's history?

[GitHub][removing-sensitive-data] has a great article on this using the [BFG Repo Cleaner][bfg].

[removing-sensitive-data]:https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
[bfg]:https://rtyley.github.io/bfg-repo-cleaner/

## Alternative actions

- [Official GitHub action](https://github.com/gitleaks/gitleaks-action) (license key is required)

## Releasing

To release a new version:

- Build the action distribution (`make build` or `npm run build`).
- Commit and push changes (including `dist` directory changes - this is important) to the `master|main` branch.
- Publish the new release using the repo releases page (the git tag should follow the `vX.Y.Z` format).

Major and minor git tags (`v1` and `v1.2` if you publish a `v1.2.Z` release) will be updated automatically.

> [!TIP]
> Use [Dependabot](https://bit.ly/45zwLL1) to keep this action updated in your repository.

## Support

[![Issues][badge_issues]][link_issues]
[![Pull Requests][badge_pulls]][link_pulls]

If you find any errors in the action, please [create an issue][link_create_issue] in this repository.

## License

This is open-source software licensed under the [MIT License][link_license].

[badge_build]:https://img.shields.io/github/actions/workflow/status/gacts/gitleaks/tests.yml?branch=master&maxAge=30
[badge_release_version]:https://img.shields.io/github/release/gacts/gitleaks.svg?maxAge=30
[badge_license]:https://img.shields.io/github/license/gacts/gitleaks.svg?longCache=true
[badge_issues]:https://img.shields.io/github/issues/gacts/gitleaks.svg?maxAge=45
[badge_pulls]:https://img.shields.io/github/issues-pr/gacts/gitleaks.svg?maxAge=45
[link_build]:https://github.com/gacts/gitleaks/actions
[link_license]:https://github.com/gacts/gitleaks/blob/master/LICENSE
[link_issues]:https://github.com/gacts/gitleaks/issues
[link_create_issue]:https://github.com/gacts/gitleaks/issues/new
[link_pulls]:https://github.com/gacts/gitleaks/pulls
[gitleaks]:https://github.com/gitleaks/gitleaks
[sarif]:https://github.com/microsoft/sarif-tutorials
