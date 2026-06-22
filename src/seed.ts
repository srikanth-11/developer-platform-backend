/**
 * Demo data seeder.
 *
 * Creates TWO separate accounts so each dashboard is its own login:
 *   - publisher@example.com  → org "Acme APIs" (PUBLISHER): publishes marketplace APIs
 *   - subscriber@example.com → org "Acme Labs" (SUBSCRIBER): apps, API keys,
 *     ~75k request logs (analytics + billing), and subscriptions to Acme's APIs
 *
 * Both passwords: password123. Idempotent: re-running wipes these users' orgs.
 *
 * Run:  npm run seed   (from backend/)
 */
import './polyfills';

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';
import { AuthService } from './auth/auth.service';
import { OrganizationsService } from './organizations/organizations.service';
import { ApplicationsService } from './applications/applications.service';
import { ApiKeysService } from './api-keys/api-keys.service';
import { FeatureFlagsService } from './feature-flags/feature-flags.service';
import { BillingService } from './billing/billing.service';
import { MarketplaceService } from './marketplace/marketplace.service';
import { OrganizationType } from './common/enums/organization-type.enum';
import { Plan } from './common/enums/plan.enum';

const PASSWORD = 'password123';
const PUBLISHER_EMAIL = 'publisher@example.com';
const SUBSCRIBER_EMAIL = 'subscriber@example.com';
const LEGACY_EMAILS = ['demo@example.com']; // wiped if present from older seeds
const LOG_ROWS = 75_000;

const log = (msg: string) => console.log(`[seed] ${msg}`);

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const get = <T>(t: new (...a: any[]) => T) => app.get(t, { strict: false });

  const ds = get(DataSource);
  const users = get(UsersService);
  const auth = get(AuthService);
  const orgs = get(OrganizationsService);
  const apps = get(ApplicationsService);
  const apiKeys = get(ApiKeysService);
  const flags = get(FeatureFlagsService);
  const billing = get(BillingService);
  const marketplace = get(MarketplaceService);

  // Registration auto-provisions the workspace (org + default app for
  // subscribers). For a brand-new user we register; for an existing user (re-run)
  // whose orgs were just wiped, we provision the same way without re-registering.
  async function registerUser(
    email: string,
    firstName: string,
    lastName: string,
    type: OrganizationType,
  ) {
    let u = await users.findByEmail(email);
    if (!u) {
      await auth.register({ email, password: PASSWORD, firstName, lastName, type });
      u = await users.findByEmail(email);
    } else {
      const org = await orgs.create(u.id, `${firstName}'s workspace`, type);
      if (type === OrganizationType.SUBSCRIBER) {
        await apps.create(org.id, { name: 'Default', description: 'Default application for your API keys.' });
      }
    }
    if (!u) throw new Error(`user ${email} unavailable`);
    const org = (await orgs.findMyOrganizations(u.id))[0];
    log(`provisioned ${type} ${email} → workspace ${org.id.slice(0, 8)}`);
    return { user: u, orgId: org.id };
  }

  // --- Clean existing orgs for all seed users (idempotency) ---
  for (const email of [PUBLISHER_EMAIL, SUBSCRIBER_EMAIL, ...LEGACY_EMAILS]) {
    const u = await users.findByEmail(email);
    if (!u) continue;
    for (const o of await orgs.findMyOrganizations(u.id)) {
      await wipeOrg(ds, o.id);
      log(`wiped existing org ${o.name} (${o.id.slice(0, 8)}) of ${email}`);
    }
  }

  // ===== PUBLISHER account =====
  const pub = await registerUser(PUBLISHER_EMAIL, 'Paula', 'Publisher', OrganizationType.PUBLISHER);
  await ds.query(`UPDATE organizations SET name='Acme APIs' WHERE id=$1`, [pub.orgId]);
  await flags.set(pub.orgId, 'api_marketplace', true);
  const apiA = await marketplace.publish(pub.orgId, {
    name: 'Acme Weather API', description: 'Global weather data, forecasts, and historical records.',
    category: 'Data', version: 'v2', baseUrl: 'https://api.acme-weather.test', pricePerMonth: 29,
  });
  const apiB = await marketplace.publish(pub.orgId, {
    name: 'Acme Payments API', description: 'Accept payments, payouts, and refunds.',
    category: 'Finance', version: 'v1', baseUrl: 'https://api.acme-pay.test', pricePerMonth: 99,
  });
  log(`PUBLISHER ${PUBLISHER_EMAIL} → "Acme APIs" with 2 published APIs`);

  // ===== SUBSCRIBER account =====
  const subAcc = await registerUser(SUBSCRIBER_EMAIL, 'Sam', 'Subscriber', OrganizationType.SUBSCRIBER);
  const orgId = subAcc.orgId;
  await ds.query(`UPDATE organizations SET name='Acme Labs' WHERE id=$1`, [orgId]);
  await billing.subscribe(orgId, Plan.PRO);
  await flags.set(orgId, 'api_marketplace', true);
  log(`SUBSCRIBER ${SUBSCRIBER_EMAIL} → "Acme Labs", plan=PRO`);

  // API keys live under the auto-created "Default" application.
  const defaultApp = (await apps.findAllForOrg(orgId))[0];
  const appIds: string[] = [defaultApp.id];
  const keyIds: string[] = [];
  for (const name of ['Production', 'Staging', 'CI']) {
    const k = await apiKeys.create(orgId, defaultApp.id, { name });
    keyIds.push(k.id);
  }
  await apiKeys.revoke(orgId, defaultApp.id, keyIds[1]); // revoke "Staging"
  log(`created ${keyIds.length} API keys under the default app (1 revoked)`);

  // Gateway request logs → analytics + billing usage.
  await seedApiLogs(ds, orgId, appIds, keyIds, LOG_ROWS);
  log(`inserted ${LOG_ROWS.toLocaleString()} request logs across the last 30 days`);
  await ds.query(
    `UPDATE api_keys k SET usage_count = s.cnt, last_used_at = s.last
       FROM (SELECT api_key_id, COUNT(*) AS cnt, MAX("createdAt") AS last
               FROM api_logs WHERE "organizationId" = $1 AND api_key_id IS NOT NULL
              GROUP BY api_key_id) s WHERE k.id = s.api_key_id`,
    [orgId],
  );
  await ds.query(
    `UPDATE subscriptions SET current_period_start = now() - interval '30 days',
            current_period_end = now() + interval '15 days' WHERE "organizationId" = $1`,
    [orgId],
  );

  // A closed invoice for last month.
  await ds.query(
    `INSERT INTO billing_records
       (id, "createdAt", "updatedAt", "organizationId", plan, period_start, period_end,
        included_requests, used_requests, overage_requests, base_cost, overage_cost, total_cost, status)
     VALUES (gen_random_uuid(), now() - interval '15 days', now() - interval '15 days', $1, 'pro',
        date_trunc('month', now() - interval '1 month'), date_trunc('month', now()),
        1000000, 942317, 0, 49.00, 0.00, 49.00, 'invoiced')`,
    [orgId],
  );

  // Subscribe "Acme Labs" to Acme's published APIs — seeded directly so the demo
  // doesn't depend on completing real Stripe checkout.
  for (const apiId of [apiA.id, apiB.id]) {
    await ds.query(
      `INSERT INTO marketplace_subscriptions
         (id, "createdAt", "updatedAt", "subscriberOrganizationId", "apiId", status, stripe_subscription_id)
       VALUES (gen_random_uuid(), now(), now(), $1, $2, 'active', NULL)
       ON CONFLICT ("subscriberOrganizationId", "apiId") DO NOTHING`,
      [orgId, apiId],
    );
  }
  log('subscribed "Acme Labs" to both Acme APIs');

  await app.close();
  log('✅ done.');
  log(`   publisher login : ${PUBLISHER_EMAIL} / ${PASSWORD}`);
  log(`   subscriber login: ${SUBSCRIBER_EMAIL} / ${PASSWORD}`);
}

/** Delete all data belonging to an org, then the org itself. */
async function wipeOrg(ds: DataSource, orgId: string) {
  const stmts = [
    `DELETE FROM api_logs WHERE "organizationId" = $1`,
    `DELETE FROM feature_flags WHERE "organizationId" = $1`,
    `DELETE FROM subscriptions WHERE "organizationId" = $1`,
    `DELETE FROM billing_records WHERE "organizationId" = $1`,
    `DELETE FROM marketplace_subscriptions WHERE "subscriberOrganizationId" = $1`,
    `DELETE FROM marketplace_apis WHERE "ownerOrganizationId" = $1`,
    `DELETE FROM api_keys WHERE "organizationId" = $1`,
    `DELETE FROM applications WHERE "organizationId" = $1`,
    `DELETE FROM organization_members WHERE "organizationId" = $1`,
    `DELETE FROM organizations WHERE id = $1`,
  ];
  for (const sql of stmts) await ds.query(sql, [orgId]);
}

/** Bulk-insert synthetic api_logs spread across the last 30 days. */
async function seedApiLogs(ds: DataSource, orgId: string, appIds: string[], keyIds: string[], rows: number) {
  await ds.query(
    `
    INSERT INTO api_logs
      (id, "createdAt", "updatedAt", request_id, "organizationId", "applicationId", api_key_id,
       method, endpoint, status_code, response_time_ms, ip_address, user_agent)
    SELECT
      gen_random_uuid(), d.ts, d.ts, gen_random_uuid(), $1::uuid,
      ($2::uuid[])[1 + floor(random() * array_length($2::uuid[], 1))::int],
      ($3::uuid[])[1 + floor(random() * array_length($3::uuid[], 1))::int],
      (ARRAY['GET','POST','GET','GET','POST','DELETE','PATCH','GET'])[d.idx],
      (ARRAY['/v1/users','/v1/payments','/v1/orders','/v1/products',
             '/v1/auth/token','/v1/webhooks','/v1/invoices','/v1/search'])[d.idx],
      CASE WHEN d.r < 0.90 THEN 200 WHEN d.r < 0.94 THEN 201 WHEN d.r < 0.97 THEN 400
           WHEN d.r < 0.985 THEN 404 ELSE 500 END,
      d.resp, '203.0.113.' || (1 + floor(random() * 254))::int, 'DemoSeed/1.0'
    FROM (
      SELECT
        now() - (random() * interval '29 days') - (random() * interval '24 hours') AS ts,
        1 + floor(power(random(), 2) * 8)::int AS idx,
        random() AS r,
        (15 + floor(random() * 120) + CASE WHEN random() < 0.06 THEN floor(random() * 900) ELSE 0 END)::int AS resp
      FROM generate_series(1, $4::int)
    ) d
    `,
    [orgId, appIds, keyIds, rows],
  );
}

main().catch((err) => { console.error('[seed] FAILED:', err); process.exit(1); });
