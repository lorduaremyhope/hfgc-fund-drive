HFGC Real Netlify + Supabase FINAL

Before deploying:
1. In Supabase SQL Editor, run supabase_setup.sql.
2. In Netlify Environment Variables, add:
   ADMIN_USER=admin
   ADMIN_PASS=hfgcpassword
   JWT_SECRET=HFGC2026EuropeRegionFundDriveSecretKey987654321
   SUPABASE_URL=https://ouhqxirsqmfczvzuysna.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your service_role key
3. Deploy this folder to Netlify from GitHub/import project, not simple static-only upload.


Update included: CAD - Canadian Dollar and PHP - Philippine Peso added to public form, admin manual add, and live converter currency dropdowns.
