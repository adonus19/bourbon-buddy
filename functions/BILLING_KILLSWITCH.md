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

> **Two tips that prevent most confusion:**
> 1. The **project picker** at the very top of the Console must say
>    **bourbonbuddy-dev** on every page below.
> 2. Use the Console's **top search bar** to navigate — menu layouts move, search
>    doesn't. The exact term to type is given in each step.
>
> **Verify your project number first:** search bar → `Dashboard` → the
> "Project info" card → **Project number** should be **906555272492**. If yours
> differs, your service-account email uses your number instead (format
> `PROJECTNUMBER-compute@developer.gserviceaccount.com`).

### 1. Create the Pub/Sub topic

Search bar → `Pub/Sub` → **Topics** → **`+ CREATE TOPIC`** → Topic ID exactly
**`billing-alerts`** → **Create**. (Or `gcloud pubsub topics create billing-alerts`.)

### 2. Deploy the function

```
firebase deploy --only functions:capBillingAtBudget
```

It subscribes to the `billing-alerts` topic automatically. (Create the topic in
step 1 first, or the trigger has nothing to bind to.)

### 3. Create the budget and connect it to the topic

Search bar → `Budgets` (or **Billing → Budgets & alerts**) → **`CREATE BUDGET`**:
- **Scope** page: under "Projects," select **bourbonbuddy-dev** → Next.
- **Amount** page: Target amount → **`25`** (your monthly ceiling; start low) → Next.
- **Actions** page: leave the default 50 / 90 / 100% alert thresholds (these drive
  the warning emails). Then check **"Connect a Pub/Sub topic to this budget,"**
  choose this project, and select the **`billing-alerts`** topic → **Finish**.

The kill-switch fires on the cost-vs-budget check the function does on each
message, independent of those email thresholds.

### 4. Grant the function permission to detach billing

The function runs as the Compute Engine default service account:
**`906555272492-compute@developer.gserviceaccount.com`**. Grant it a role that
can unlink billing.

**Recommended (least privilege), click by click:**
1. Search bar → `IAM` → open **"IAM"** (under IAM & Admin). Project picker must
   say **bourbonbuddy-dev**.
2. Click **`+ GRANT ACCESS`** near the top.
3. In **"New principals,"** paste the service-account email above.
4. Under **"Select a role,"** filter for **`Project Billing Manager`** and choose
   it (in the "Billing" group).
5. **Save**.

You do **not** need the function's details page — the SA email is given directly
above.

**Fallback** (only if the kill-switch later logs a permission error when
disabling billing): search bar → `Billing` → left nav **"Account management"** →
**"ADD PRINCIPAL"** → same SA email → role **Billing Account Administrator**
(`roles/billing.admin`) → Save.

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
