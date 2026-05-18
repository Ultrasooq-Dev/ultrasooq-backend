# ⚠️ SUPERSEDED — see `LINKED_ACCOUNTS_DESIGN.md`

**Status:** Superseded 2026-05-16, same day as creation.

After review with stakeholders, the originally proposed "shared identity with personas" model is **not what the product wants**. The product wants the **linked-accounts** model (Twitter / Stripe Connect style): one master credential pair unlocks a family of fully independent commercial identities that switch under one session.

Under that model, the current schema is **mostly correct**. No `Persona` table is needed, no FK migration of the 55 commerce tables is needed, no session-model rework is needed.

**See [`LINKED_ACCOUNTS_DESIGN.md`](./LINKED_ACCOUNTS_DESIGN.md)** for the actual design and the 4 small changes required.

This doc is kept only to preserve the discussion trail. **Do not implement anything from it.**
