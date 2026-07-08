# Sighting Trust & Monetization — At-Scale Backlog

**Status:** Deferred by design (2026-07-08) until the app moves beyond the trusted
~10-user cohort toward public scale. **This is a priority backlog item — do not
lose it.** Revisit when opening registration beyond invited users.

Context: this is phase 3 of the sighting-trust plan. Phases 1–2 (presence
attestation on `logSighting`, community confirm/dispute with a trust-signal
freshness badge) ship during the 2026-07 hardening pass; see the roadmap in that
PR series. This doc holds the pieces that only make sense at scale.

---

## Reporter reputation

A rolling per-spotter accuracy signal derived from community verdicts on their
sightings.

- **Inputs:** confirmed-vs-disputed counts already denormalized onto sightings by
  the confirmation feature (`confirmCount` / `disputeCount`). Aggregate per
  spotter with a windowed ratio (e.g. last 90 days) so old behavior decays.
- **Computation:** server-side only (scheduled function or incremental update in
  the `confirmSighting` callable). Never client-writable; store on
  `/publicProfiles/{uid}` as a coarse tier, not a raw number.
- **Display:** a subtle trust hint next to the spotter on sightings ("Reliable
  spotter" tier), not a leaderboard — avoid shame mechanics.
- **Why deferred:** with ~10 users who know each other, small-sample reputation
  is statistical noise and social friction. It becomes invaluable once sightings
  come from strangers.
- **Guardrails when built:** minimum-sample threshold before any tier shows;
  disputes rate-limited and presence-attested like confirmations so reputation
  itself can't be griefed; new accounts start neutral, not untrusted.

## Monetization ideas (agreed direction)

Principle: **verification stays free.** Verified sightings are the commons that
makes the map worth using; paywalling verification degrades data quality for
everyone. Monetize *consumption* of trusted data instead:

1. **Instant push alerts** when a *verified* sighting matches a hunt-list bottle
   (free tier: digest/delayed alerts).
2. **Wider alert radius** — free tier gets a local radius; paid expands it
   (region/state).
3. **Sighting history** — free shows current/fresh sightings; paid unlocks price
   history and past sighting timelines per bottle/store.

These all sit on top of the trust mechanics, which is why reputation + verified
counts must be solid before charging for anything built on them.
