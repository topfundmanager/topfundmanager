# Publishing site SEO

Saving a profile updates the dashboard and the existing managed recommendation endpoints. It does **not** update a site's live homepage. Publishing freezes the saved revision in `published_snapshot`; the connected site reads that published endpoint on each request. Later saves remain private drafts until published again.

## One-time rollout

1. Apply `supabase/migrations/202609240001_site_seo_publications.sql` to the **Top Fund Manager production Supabase project**. Do not apply it to another Supabase organization or project.
2. Deploy this Top Fund Manager branch. Confirm `/api/forms/seo` loads and an unpublished `/api/seo/{siteId}/published` returns 404.
3. Deploy the SEO connectors in `ghicontractors`, `jccaring`, `nocostnurse`, `theregurus`, and `topfundinjury`. Top Fund Manager has its own connector in `functions/_middleware.js`.
4. In `/dashboard`, review a site's profile, save changes if needed, set it to Ready, and select **Publish to site**. The dashboard checks the live page for the exact revision marker. If deployment propagation delays verification, select **Check live site** again.

No existing profile is automatically published by the migration. This matters because at least one seeded profile has a stale GHI Contractors phone number. Review facts, canonical URL, structured data, and crawler policy before publishing.

The publisher currently owns homepage SEO metadata and root `robots.txt`/`llms.txt` for each connected site. Interior pages, and Top Fund Injury's Spanish page, retain their own SEO until page-specific profiles are added. The dashboard's older `/api/seo/{siteId}` endpoints remain the latest saved recommendations; `/api/seo/{siteId}/published` endpoints are the live publication source.
