<p align="center">
  <img src="https://raw.githubusercontent.com/zricethezav/gifs/master/gitleakslogo.png" alt="Logo" width="250" />
</p>

# Run [gitleaks][gitleaks] action

![Release version][badge_release_version]
[![Build Status][badge_build]][link_build]
[![License][badge_license]][link_license]

This action installs and runs [gitleaks][gitleaks] in your workflow. It can be run on **Linux** (`ubuntu-latest`), **macOS** (`macos-latest`), or **Windows** (`windows-latest`).

## Usage

```yaml
jobs:
  gitleaks:
    runs-on: ubuntu-20.04
    steps:
      - uses: actions/checkout@v3
        with: {fetch-depth: 0}

      - uses: gacts/gitleaks@v1
        id: gitleaks

      #- if: ${{ always() }} # disabling reason - https://github.com/zricethezav/gitleaks/issues/782
      #  uses: github/codeql-action/upload-sarif@v2
      #  with:
      #    sarif_file: ${{ steps.gitleaks.outputs.sarif }}
```

## Customizing

### Inputs

Following inputs can be used as `step.with` keys:

...

### Outputs

...

## Releasing

New versions releasing scenario:

- Make required changes in the [changelog](CHANGELOG.md) file
- Build the action distribution (`make build` or `yarn build`)
- Commit and push changes (including `dist` directory changes - this is important) into the `master` branch
- Publish new release using repo releases page (git tag should follow `vX.Y.Z` format)

Major and minor git tags (`v1` and `v1.2` if you publish `v1.2.Z` release) will be updated automatically.

## Support

[![Issues][badge_issues]][link_issues]
[![Issues][badge_pulls]][link_pulls]

If you find any action errors, please, [make an issue][link_create_issue] in the current repository.

## License

This is open-sourced software licensed under the [MIT License][link_license].

[badge_build]:https://img.shields.io/github/workflow/status/gacts/gitleaks/tests?maxAge=30
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

[gitleaks]:https://github.com/zricethezav/gitleaks
