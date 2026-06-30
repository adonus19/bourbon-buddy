/**
 * Billing kill-switch (BB-120).
 *
 * A Cloud Billing budget publishes spend notifications to the `billing-alerts`
 * Pub/Sub topic. This function reacts to them and, once actual spend reaches the
 * budget, DISABLES billing on the project — the documented "cap (stop) usage"
 * pattern. It is the hard ceiling that protects against a bug or abuse running
 * up an unbounded bill.
 *
 * ⚠️ Disabling billing stops paid services (Firestore, Functions, Storage).
 * The app degrades to whatever the free tier allows. Re-enabling is a manual
 * Console step — see functions/BILLING_KILLSWITCH.md.
 *
 * Requires: the function's runtime service account must hold a role that can
 * detach billing (Billing Account Administrator on the billing account, or
 * Project Billing Manager). See the runbook.
 */
import { logger } from "firebase-functions/v2";
import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { CloudBillingClient } from "@google-cloud/billing";

const BILLING_ALERTS_TOPIC = "billing-alerts";
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "";
const PROJECT_NAME = `projects/${PROJECT_ID}`;

const billing = new CloudBillingClient();

/** Shape of the budget notification Cloud Billing publishes (fields we use). */
interface BudgetNotification {
  budgetDisplayName?: string;
  costAmount?: number;
  budgetAmount?: number;
  currencyCode?: string;
}

async function isBillingEnabled(projectName: string): Promise<boolean> {
  try {
    const [info] = await billing.getProjectBillingInfo({ name: projectName });
    return info.billingEnabled ?? false;
  } catch (err) {
    logger.error("Failed to read billing info; assuming enabled.", err);
    return true;
  }
}

async function disableBilling(projectName: string): Promise<void> {
  // Setting an empty billingAccountName detaches the billing account.
  await billing.updateProjectBillingInfo({
    name: projectName,
    projectBillingInfo: { billingAccountName: "" },
  });
}

export const capBillingAtBudget = onMessagePublished(
  { topic: BILLING_ALERTS_TOPIC, region: "us-central1", retry: false },
  async (event) => {
    const data = event.data.message.json as BudgetNotification | undefined;

    if (!data || data.costAmount == null || data.budgetAmount == null) {
      logger.info("Budget message had no cost/budget amounts; ignoring.");
      return;
    }

    const { costAmount, budgetAmount, currencyCode = "USD" } = data;
    if (costAmount < budgetAmount) {
      logger.info(
        `Spend ${costAmount} ${currencyCode} is under budget ${budgetAmount}; no action.`
      );
      return;
    }

    if (!PROJECT_ID) {
      logger.error("No project id in environment; cannot disable billing.");
      return;
    }

    if (!(await isBillingEnabled(PROJECT_NAME))) {
      logger.warn(`Billing already disabled for ${PROJECT_NAME}; nothing to do.`);
      return;
    }

    await disableBilling(PROJECT_NAME);
    logger.error(
      `BILLING DISABLED for ${PROJECT_NAME}: spend ${costAmount} ${currencyCode} ` +
        `reached budget ${budgetAmount}. Re-enable manually per the runbook.`
    );
  }
);
