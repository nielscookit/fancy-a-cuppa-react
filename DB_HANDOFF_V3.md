# Fancy a Cuppa V3 – Backend handoff (2026-11-06)

**For the Database chat. This file is an engineering request, not a database migration.**

The V3 frontend has been extended to read all fields from the live schema
(`teas`, `tea_preparations`, `tea_codes`) and to offer form inputs for those fields.
The production database contains 12 published teas. **Do not modify or delete
existing records as part of the handoff.**

## Confirmed write-contract incompatibilities

The currently deployed `community-tea` Edge Function v2 forwards requests to
`add_community_tea` and `update_community_tea` Postgres RPCs.

- `teas.category` supports 12 categories, but create RPC only accepts
  9 and update RPC accepts 8. Categories `yellow`, `dark`, `mate`
  cannot be written; `pu_erh` can be created but not updated.
- `teas.subcategory` is nullable, yet both RPCs require a non-null value.
- `teas.leaf_style` permits
  `whole`, `broken`, `ctc`, `fannings_dust`, `powder`, `bag`, `other`,
  plus NULL. The update RPC *always overwrites* this value to `bag`
  or `other`. This can silently destroy stored leaf-style information.
- `teas.photo_url` exists and is nullable, but neither RPC persists changes.
- `tea_preparations.instructions` and `source_label` exist, but neither
  RPC persists those fields.
- Barcodes are in `tea_codes`; existing update adds a new barcode but
  does not support replacing or removing an existing code.
- Updating shared records currently lacks an explicit record version check;
  review update ownership and moderation policy before widening write access.

## Request

Review and implement a backward-compatible, safe write contract for
create/update of the full current schema. Preserve RLS; service-role access
must remain exclusively server-side. Confirm allowed values/ranges and
record ownership/moderation rules. Provide the exact accepted JSON payload,
error semantics and versioning for the V3 frontend.

**Do not make undocumented schema changes and do not test with production
writes to the existing 12 teas.** Use a disposable test record or isolated
test environment after agreement. Coordinate with the Concept & Design chat
for the photo-upload interaction (currently the V3 editor provides an HTTPS
image URL field only, not an actual image-upload workflow).

The V3 frontend includes an explicit `assertLegacyWriteIsSafe` guard:
requests that the old API could silently corrupt are blocked. Once the
updated write contract is confirmed and tested, the developer can remove
that compatibility guard and connect full saving.
