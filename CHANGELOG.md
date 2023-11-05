# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog][keepachangelog] and this project adheres to [Semantic Versioning][semver].

## v1.2.0

### Changed

- Version of node runtime for action from node16 to node20

## v1.1.4

### Changed

- Action dependencies were updated

## v1.1.3

### Changed

- Action dependencies were updated

## v1.1.2

### Fixed

- Alternative config lookup order (new order is: `./gitleaks.toml`, `./.gitleaks.toml`, `./.github/gitleaks.toml`, `./.github/.gitleaks.toml`)
- Alternative configs' lookup will be ignored when environment variable `GITLEAKS_CONFIG` is set

## v1.1.1

### Fixed

- Log messages formatted

## v1.1.0

### Added

- Searching for the config file (`.gitleaks.toml`, `gitleaks.toml`) inside `.github` directory if `with.config-path` is not provided
- Verbose output for GitLeaks v7.x

## v1.0.0

### Added

- First action release (GitLeaks v7.x and v8.x are supported)

[keepachangelog]:https://keepachangelog.com/en/1.0.0/
[semver]:https://semver.org/spec/v2.0.0.html
