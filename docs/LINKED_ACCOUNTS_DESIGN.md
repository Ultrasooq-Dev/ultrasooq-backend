# Linked Accounts Design

**Status:** Approved 2026-05-16
**Supersedes:** `MULTI_PERSONA_REFACTOR.md` (which was over-engineered)
**Stakeholders:** Backend, Frontend

## 1. The model

Ultrasooq's multi-account feature is the **Twitter "Add account" / Stripe Connect** model, not the "personas of one identity" model.

```
ONE login (master.email + master.password)
   │
   └── Active session (Better Auth)
       │
       ├── Master identity (BUYER by default — own orders, cart, profile)
       ├── Sub-account #1 (independent COMPANY — own orders, cart, profile)
       ├── Sub-account #2 (independent FREELANCER — own orders, cart, profile)
       └── ...
       
Switch between them with one click. No re-auth.
```

### Per-account independence

| What's shared | What's per-account |
|---|---|
| Login credentials (master's email + password only) | Profile (firstName, lastName, profile picture, address) |
| Active session (one cookie, switchable target) | Display name / accountName |
| Audit trail visible to platform admins | Trade role (BUYER / COMPANY / FREELANCER) |
| | Identity proof / company documents |
| | Orders, Cart, Wishlist, Products, RFQ, Wallet |
| | Status (WAITING vs ACTIVE) |

### Master's privileges over the family

- ✅ Create new sub-accounts
- ✅ Delete sub-accounts (soft-delete only — preserves order history)
- ✅ Switch to any sub-account in the family
- ❌ Read/edit a sub's private profile data (sub is sovereign post-creation)
- ❌ Spend from a sub's wallet
- ❌ Modify a sub's orders

### Sub-account login

Sub-accounts have **no direct login**. They're switch-only from the master session. If you need someone else to operate a sub-account, that's the `TeamMember` feature (separate concept, separate table, separate credentials).

## 2. Why the current schema works as-is

The existing `User` table with `addedBy` self-FK already implements this model correctly:

- `User.email @unique` — satisfied by synthesizing `master+sub-XXXX@domain` (internal plumbing, never shown to users)
- `User.addedBy: String?` — points at master; null for masters themselves
- Sub-accounts have no `Account` (credential) row — auth is always via master
- Each sub-account has its own FKs into Cart, Order, Product, Wallet, etc.

**The bug was UX, not architecture.** The synthesized email was *leaking into the UI*, making sub-accounts look like separate emails when they're actually internal IDs.

## 3. The 4 changes that actually need to happen

### Change #1 — Hide synthesized email in UI

**Scope:** Frontend only. The `seller+sub-XXXX@ultrasooq.com` email is internal plumbing and should never appear in any user-facing surface.

**Files:**
- `frontend/app/my-accounts/page.tsx` — the "Switch account" page. Replace every `account.email` render with `master.email` + `account.accountName`.
- Header avatar / user menu — show master's email, current sub's accountName as a sub-label.
- Sub-account card → Email field — replace with "Sub-account" badge or hide entirely.
- `frontend/app/[locale]/profile/...` — profile pages should not show the synthesized email anywhere.

**Backend impact:** None. API still returns the email field (used as the unique key in DB joins); frontend just doesn't display it.

### Change #2 — Add "delete sub-account" capability

**Backend:**
- New endpoint: `DELETE /api/v1/user/account/:id`
- Service: `UserService.deleteSubAccount(targetId, req)` in `user.service.ts`
- Validation: master must own the target (`target.addedBy === master.id`)
- Validation: cannot delete the master itself (would orphan the family)
- Behavior: soft-delete via `status = 'DELETE'` + `deletedAt: new Date()` — preserves all FK chains
- Cascade behavior: subs already point at the master via `addedBy`, no cascade needed
- Response: 200 + updated `myAccounts` payload (or empty 204, frontend refetches)

**Frontend:**
- `my-accounts/page.tsx`: trash icon on each sub-account card
- Confirm dialog: "Delete this sub-account? Its order history will be preserved but you won't be able to switch to it again."
- On confirm: call `DELETE /user/account/:id`, refetch myAccounts

### Change #3 — Fix Bug #4 (stale legacy JWT cookie blocks admin)

The `SuperAdminAuthGuard` checks the legacy `ultrasooq_accessToken` cookie before falling through to Better Auth ([backend/src/guards/SuperAdminAuthGuard.ts:116-145]). If that cookie holds a non-admin user's JWT (e.g. left over from a `switchAccount` to a buyer sub), the guard 403s before the current Better Auth admin session ever gets checked.

**Two equivalent fixes — pick one:**

**Option A (preferred): Drop the legacy cookie path entirely.**
- Better Auth's session is now the source of truth for `who is logged in`.
- `POST /user/switchAccount` should update something else (a `Session.activePersonaId`-like field, OR the legacy cookie kept only for the current user's switching purpose but never used for admin gating).
- Remove the legacy JWT check from `SuperAdminAuthGuard`.

**Option B: Clear legacy cookie on sign-out.**
- Add a Better Auth `signOut` hook that clears `ultrasooq_accessToken` and `ultrasooq_refreshToken`.
- Leaves the legacy path in the guard, so other endpoints that rely on it (if any) still work.
- Smaller surface area but only fixes the sign-out → sign-in case; doesn't fix the case where you forget to sign out.

### Change #4 — Verify profile-edit independence

Test cases:
1. Log in as master → switch to sub-account → edit firstName → save → switch back to master → confirm master's firstName unchanged.
2. Log in as master → edit firstName → save → switch to sub → confirm sub's firstName unchanged.
3. Same for profilePicture, dateOfBirth, gender, phoneNumber.

If any of these bleed across the family, the `PATCH /user/me` endpoint is updating the wrong row (probably the master always). Fix: ensure the update targets `req.user.id`, where `req.user` is the **active sub**, not the master.

## 4. Out of scope

- A separate `Persona` table — not needed.
- Cross-account analytics ("show me total spend across all my accounts") — possible future feature, but not required for this design.
- Per-sub login credentials — explicitly rejected; if you need that, use `TeamMember`.
- A real `+sub-XXXX` email being sendable — never. It's internal plumbing only.
- Cascading delete (deleting master deletes subs) — not in this design. Master deletion is a separate admin-only operation handled outside this feature.

## 5. What's NOT changing

- The `User.addedBy` FK structure.
- The `synthesized email` at the DB level (only its UI exposure changes).
- The `switchAccount` API contract.
- Any of the 55 commerce tables that FK to `User`.
- The Bug #1/#2/#3 fixes from the same day are independent and stay shipped.

## 6. Acceptance checklist

- [ ] No screen anywhere shows `+sub-XXXX@`
- [ ] Master can delete a sub via the my-accounts page
- [ ] Deleted sub-accounts don't appear in `myAccounts` response
- [ ] Deleted sub's orders are still queryable in admin (soft delete preserved data)
- [ ] Admin in admin panel can access `/admin/pending-organizations` after switching from a sub session (Bug #4)
- [ ] Profile edit while switched to a sub only changes that sub's record (Change #4 verification)
