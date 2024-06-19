<p align="center">
  <img src="https://github.com/gacts/gitleaks/assets/7326800/778c1c79-c36b-4a52-83cd-3ab2a2bb8f3e" alt="Logo" width="250" />
</p>

# Run [GitLeaks][gitleaks] action

![Release version][badge_release_version]
[![Build Status][badge_build]][link_build]
[![License][badge_license]][link_license]

This action provides a simple way to run [GitLeaks][gitleaks] in your CI/CD pipeline. It can be run on **Linux**
(`ubuntu-latest`), **macOS** (`macos-latest`), or **Windows** (`windows-latest`).

In addition, it supports GitLeaks **v8.x** _(and v7.x)_, and uses the GitHub **caching mechanism** to speed up
your workflow execution time!

> [!TIP]
> The [config file](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml) can be located
> in `.github` directory _(e.g.: `<repo_root>/.github/.gitleaks.toml`)_, and if `with.config-path` was not
> provided - it will be used.

## Additional Configuration

### `gitleaks:allow`

> [!NOTE]
> Since GitLeaks **v8.10.0**

If you are knowingly committing a test secret that GitLeaks will catch you can add a `gitleaks:allow` comment to
that line which will instruct GitLeaks to ignore that secret. Ex:

```java
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
      - uses: actions/checkout@v3
        with: {fetch-depth: 0}

      - name: Check for GitLeaks
        uses: gacts/gitleaks@v1
        #id: gitleaks
        #with:
        #  version: latest
        #  config-path: .github/.gitleaks.toml
        #  path: any/directory/path

      #- if: ${{ always() }} # reason - https://github.com/gitleaks/gitleaks/issues/782
      #  uses: github/codeql-action/upload-sarif@v2
      #  with:
      #    sarif_file: ${{ steps.gitleaks.outputs.sarif }}
```

> [!NOTE]
> You must use `actions/checkout` before the `gacts/gitleaks` step with `fetch-depth: 0`!

## Customizing

### Inputs

Following inputs can be used as `step.with` keys:

| Name            |   Type    |          Default          | Required | Description                                                              |
|-----------------|:---------:|:-------------------------:|:--------:|--------------------------------------------------------------------------|
| `version`       | `string`  |         `latest`          |   yes    | GitLeaks version (`latest` or in `1.2.3` format)                         |
| `config-path`   | `string`  |         built-in          |    no    | Path to the config file                                                  |
| `path`          | `string`  | current working directory |    no    | Path to source                                                           |
| `run`           | `boolean` |          `true`           |    no    | Set it to `true` to run GitLeaks, or `false` if you don't want it to run |
| `fail-on-error` | `boolean` |          `true`           |    no    | Set `false` for exiting without an error when GitLeaks run failed        |
| `github-token`  | `string`  |   `${{ github.token }}`   |    no    | GitHub auth token                                                        |

### Outputs

In subsequent steps you will be able to use the following variables:

| Description                                                     | How to use in your workflow                  | Example                        |
|-----------------------------------------------------------------|----------------------------------------------|--------------------------------|
| Path to the GitLeaks binary file                                | `${{ steps.gitleaks.outputs.gitleaks-bin }}` | `/tmp/gitleaks-8.7.1/gitleaks` |
| Path to the report in [SARIF format][sarif]                     | `${{ steps.gitleaks.outputs.sarif }}`        | `/tmp/gitleaks.sarif`          |
| GitLeaks exit code (will be set only if `inputs.run` is `true`) | `${{ steps.gitleaks.outputs.exit-code }}`    | `1`                            |

## How do I remove a secret from git's history?

[GitHub][removing-sensitive-data] has a great article on this using the [BFG Repo Cleaner][bfg].

[removing-sensitive-data]:https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
[bfg]:https://rtyley.github.io/bfg-repo-cleaner/

## Alternative projects

- [Official GitHub action](https://github.com/gitleaks/gitleaks-action) (license key is required)

## Releasing

To release a new version:

- Build the action distribution (`make build` or `npm run build`).
- Commit and push changes (including `dist` directory changes - this is important) to the `master|main` branch.
- Publish the new release using the repo releases page (the git tag should follow the `vX.Y.Z` format).

Major and minor git tags (`v1` and `v1.2` if you publish a `v1.2.Z` release) will be updated automatically.

## Support

[![Issues][badge_issues]][link_issues]
[![Pull Requests][badge_pulls]][link_pulls]

If you find any errors in the action, please [create an issue][link_create_issue] in this repository.

## License

This is open-source software licensed under the [MIT License][link_license].

[badge_build]:https://img.shields.io/github/actions/workflow/status/gacts/gitleaks/tests.yml?branch=master&maxAge=30
[badge_release_version]:https://img.shields.io/github/release/gacts/gitleaks.svg?maxAge=30
[badge_license]:https://img.shields.io/github/license/gacts/gitleaks.svg?longCache=true
[badge_release_date]:https://img.shields.io/github/release-date/gacts/gitleaks.svg?maxAge=180
[badge_commits_since_release]:https://img.shields.io/github/commits-since/gacts/gitleaks/latest.svg?maxAge=45
[badge_issues]:https://img.shields.io/github/issues/gacts/gitleaks.svg?maxAge=45
[badge_pulls]:https://img.shields.io/github/issues-pr/gacts/gitleaks.svg?maxAge=45

[link_build]:https://github.com/gacts/gitleaks/actions
[link_license]:https://github.com/gacts/gitleaks/blob/master/LICENSE
[link_issues]:https://github.com/gacts/gitleaks/issues
[link_create_issue]:https://github.com/gacts/gitleaks/issues/new
[link_pulls]:https://github.com/gacts/gitleaks/pulls

[gitleaks]:https://github.com/gitleaks/gitleaks
[sarif]:https://github.com/microsoft/sarif-tutorials
