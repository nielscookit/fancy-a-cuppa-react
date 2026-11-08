# Tea Detail product images

Public activation authorized by Stephan on 2026-11-08. Images are hotlinked directly; no image files, image proxy, Storage bucket or service-worker cache is used.

`public.tea_product_images` is a manually curated projection with one row per published tea: `tea_id`, `source_image_url`, `source_page_url`. Browser roles have SELECT only, guarded by RLS. The private `tea_product_image_candidates` table and its review notes remain inaccessible to browser roles. No privileged keys are used by the app.

Initial selection: 139 products. Candidates were assessed against the existing visual review notes: recognizable front packaging, matching product, reachable HTTPS resource, usable dimensions. Tea bags/boxes/tins with packaging-size or edition differences may identify the tea but do not establish GTIN identity. Unclear matches, leaf-only pictures, backs, watermarks, multiple ambiguous packages and unreadable variety labels remain excluded. Brahmaputra candidate 6c4f94d4-b65d-417f-8c2e-9ee92b13119f is explicitly selected per the design reference and instruction. Research statuses were not overwritten with a blanket approval.

To change the selection, update the curated table through an administrative database connection after reviewing the candidate. Browser roles cannot change it. No private notes belong in this projection.

The gallery starts on the existing category image. Dots and a second page appear only after the external product image loads. Metadata timeout: 8 seconds. Image-load timeout: 15 seconds. A failed image removes the second page and dots, including if an enlarged image fails. Each tea mounts a fresh gallery. Packaging uses contain with a fixed-size stage; the reference bag's internal white margins are accounted for by the stage padding. External retrieval uses no-referrer.

The shared category icon and title/manufacturer stay outside the moving track. Native horizontal swipes and dots select the image; vertical gestures remain available to the detail scroller. Movement beyond 8px suppresses zoom; only a product tap opens the MUI Dialog. Dialog close restores the detail state. Source page is an optional explicit external link.
