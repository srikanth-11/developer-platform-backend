/**
 * What an organization is for. Chosen at creation and fixed thereafter.
 *
 *   PUBLISHER  — lists APIs in the marketplace and earns payouts. Cannot subscribe.
 *   SUBSCRIBER — consumes APIs: applications, keys, analytics, and subscribing to
 *                marketplace APIs. Cannot publish.
 *
 * A single user can own one of each (they're separate orgs) and switch between
 * them — each presents its own dashboard.
 */
export enum OrganizationType {
  PUBLISHER = 'publisher',
  SUBSCRIBER = 'subscriber',
}
