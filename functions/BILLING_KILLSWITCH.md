# Billing Kill-Switch Runbook (BB-120)

The `capBillingAtBudget` Cloud Function disables billing on the project once
actual spend reaches a Cloud Billing budget. It's the hard ceiling that stops a
bug or abuse from running up an unbounded bill.

**How it works:** a Cloud Billing budget publishes spend updates to the
`billing-alerts` Pub/Sub topic several times a day. The function reads each
message and, when `costAmount >= budgetAmount`, detaches the billing account from
the project. Paid services (Firestore, Functions, Storage) then stop; the app
degrades to the free tier until you re-enable billing manually.

> ⚠️ This is a backstop, not a real-time guard — Cloud Billing data lags by a few
> hours. Treat the budget number as "the most I'm willing to lose in a day-ish,"
> not an exact cutoff.

---

## One-time setup (Console + CLI — only you can do this)

Project: **bourbonbuddy-dev** · project number **906555272492** · region
**us-central1**.

### 1. Create the Pub/Sub topic

Console → **Pub/Sub → Topics → Create topic** → Topic ID: **`billing-alerts`**
→ Create. (Or `gcloud pubsub topics create billing-alerts`.)

### 2. Deploy the function

```
firebase deploy --only functions:capBillingAtBudget
```

It subscribes to the `billing-alerts` topic automatically. (Deploy the topic in
step 1 first, or the trigger has nothing to bind to.)

### 3. Create the budget and connect it to the topic

Console → **Billing → Budgets & alerts → Create budget**:
- **Scope:** this project (bourbonbuddy-dev).
- **Amount:** your ceiling, e.g. **$25/month** (start low; raise as real usage warrants).
- **Threshold rules:** leave the defaults (50% / 90% / 100% of *actual*) — these
  drive the warning emails. The kill-switch itself fires on the 100%-of-actual
  condition the function evaluates.
- **Manage notifications → "Connect a Pub/Sub topic to this budget"** → select
  this project and the **`billing-alerts`** topic → **Save**.

### 4. Grant the function permission to detach billing

Find the function's runtime service account: Console → **Cloud Functions →
capBillingAtBudget → Details**. For gen-2 it's the Compute Engine default SA:
**`906555272492-compute@developer.gserviceaccount.com`**.

Grant it a role that can unlink billing (pick one):
- **Recommended (least privilege):** Console → **IAM & Admin → IAM → Grant
  access** → principal = the SA above → role = **Project Billing Manager**
  (`roles/billing.projectManager`).
- **Fallback (Google's documented option):** Console → **Billing → Account
  management → Add principal** → the SA above → role = **Billing Account
  Administrator** (`roles/billing.admin`).

If the kill-switch ever logs a permissions error when trying to disable billing,
use the fallback role.

---

## Test it (safely)

Publish a message **below** the budget and confirm the no-op path — this does
**not** disable anything:

```
gcloud pubsub topics publish billing-alerts \
  --message '{"costAmount":1,"budgetAmount":25,"currencyCode":"USD"}'
```

Then check the logs — you should see "…is under budget…; no action":

```
firebase functions:log --only capBillingAtBudget
```

> Do **not** test the disable path by publishing `costAmount >= budgetAmount`
> against the real project — it will actually disable billing. Only do that in a
> throwaway project if you want to see the full path.

---

## If the kill-switch trips (re-enable billing)

1. **Find out why first.** Check `firebase functions:log` and the GCP billing
   reports — don't just raise the ceiling and re-enable into the same runaway.
2. Re-attach billing: Console → **Billing → My Projects → bourbonbuddy-dev →
   Actions (⋮) → Change billing / Link a billing account** → select your billing
   account.
3. Paid services resume automatically; no redeploy needed.
4. Re-enable promptly — prolonged disablement can affect some resources (Firestore
   *data* persists, but functions and other services stop).

---

## Notes

- The budget publishes to the topic regularly with the running cost; the function
  decides when to act, so the threshold percentages are only for the email alerts.
- Disabling billing is intentionally blunt. Once App Check (BB-121) and per-user
  quotas (BB-122) are in, the kill-switch should rarely (ideally never) fire — it's
  the last line of defense, not the first.
