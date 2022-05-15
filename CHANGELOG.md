# Changelog

Releases and notable changes to this project are documented here.

## [v1.3.8] - 2022-05-15

### Fixed

- Badge requests are allowed to be cached.
- Dependency updates.
- Minor fixes.

## [v1.3.7] - 2022-04-08

### Added

- If publish requests are made without the topic actually having updated, behave like a proper caching client by negotiating etag/last-modified fields for topic fetches.

### Fixed

- Timestamps on admin pages are displayed more succinctly.
- Dependency updates.

## [v1.3.6] - 2022-03-19

### Added

- Recent history of topic publish updates are now displayed on topic details page.

### Fixed

- Dependency updates.

## [v1.3.5] - 2022-02-23

### Added
- IndieAuth profile logins now support latest spec, id est metadata discovery and issuer validation.
- Topic content update history is now tracked.

### Fixed

- Fixed potential race condition which could cause a subscriber to miss an update.
- Fixed postgres listener to more properly deal with errors.
- Removed accidental logging of response body during HEAD requests.
- Fixed session logout link on root page.
- Dependency updates.

## [v1.3.4] - 2022-01-23

### Fixed

- Dependency updates.

## [v1.3.3] - 2022-01-03

### Fixed

- Refactor of authenticated sessions and HTML template rendering, split into sub-modules.
- Dependency updates.

## [v1.3.2] - 2021-12-29

### Fixed

- Minor fix and update to HTML templates.
- Dependency updates.

## [v1.3.1] - 2021-10-23

### Fixed

- Login credentials are no longer logged.

## [v1.3.0] - 2021-10-23

### Added

- IndieAuth logins now supported, admin overview page will show topics related to the authenticated profile's host.
- Due to the new session-based admin login system, the config value `encryptionSecret` will need to be populated when upgrading.

## [v1.2.2] - 2021-10-05

### Fixed

- Dependency updates.

## [v1.2.1] - 2021-09-10

### Fixed

- Minor issues and dependency updates.

## [v1.2.0] - 2021-08-28

### Added

- Accept multiple topics in publish requests.
- Expired subscription entries are removed from the database when their topics are updated.
- Topics which have been marked deleted are removed from the database after all subscribers have been notified.

## [v1.1.5] - 2021-08-23

### Fixed

- Reverted change introduced in v1.1.3 which consolidated db connections, as it was causing data-integrity issues.
- Issue with SQLite backend causing admin details about subscriptions to show errors.
- Verifications will not be attempted until their topics become active, reducing worker activity in certain situations.

## [v1.1.4] - 2021-08-16

### Fixed

- Prevent task processor from being re-invoked if it is already running.

### Added

- Allow more configuration of html page content.

## [v1.1.3] - 2021-08-13

### Fixed

- Worker tasks, such as delivering content updates, now share one database context.  This reduces the connection load for Postgres backends, affording greater scalability.

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

[Unreleased]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=HEAD;hp=v1.3.8
[v1.3.8]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.3.8;hp=v1.3.7
[v1.3.7]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.3.7;hp=v1.3.6
[v1.3.6]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.3.6;hp=v1.3.5
[v1.3.5]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.3.5;hp=v1.3.4
[v1.3.4]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.3.4;hp=v1.3.3
[v1.3.3]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.3.3;hp=v1.3.2
[v1.3.2]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.3.2;hp=v1.3.1
[v1.3.1]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.3.1;hp=v1.3.0
[v1.3.0]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.3.0;hp=v1.2.2
[v1.2.2]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.2.2;hp=v1.2.1
[v1.2.1]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.2.1;hp=v1.2.0
[v1.2.0]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.2.0;hp=v1.1.5
[v1.1.5]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.1.5;hp=v1.1.4
[v1.1.4]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.1.4;hp=v1.1.3
[v1.1.3]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.1.3;hp=v1.1.2
[v1.1.2]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.1.2;hp=v1.1.1
[v1.1.1]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.1.1;hp=v1.1.0
[v1.1.0]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.1.0;hp=v1.0.0
[v1.0.0]: https://git.squeep.com/?p=websub-hub;a=commitdiff;h=v1.0.0;hp=v0.0.0
