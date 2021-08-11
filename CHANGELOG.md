# Changelog

Releases and notable changes to this project are documented here.

## [Unreleased]

## [v1.1.2] - 2021-08-11

### Added

- Make use of the content-type charset when parsing topic content, recoding to UTF8 when needed.

### Fixed

- Feed parser could return a non-list for a single link entry, handle that case.

## [v1.1.1] - 2021-08-09

### Fixed

- Parsing of topic content-types which include encoding.

## [v1.1.0] - 2021-08-08

### Added

- Caching of topic contents for Postfix database backends.  This should greatly reduce the db load when many subscribers to a topic are delivered an update.
- Minor cleanup to generated HTML pages.

## [v1.0.0] - 2021-08-01

### Added

- Everything.  MVP first stable release.

---

[Unreleased]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=HEAD;hp=v1.1.2
[v1.1.2]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.1.2;hp=v1.1.1
[v1.1.1]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.1.1;hp=v1.1.0
[v1.1.0]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.1.0;hp=v1.0.0
[v1.0.0]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.0.0;hp=v0.0.0
