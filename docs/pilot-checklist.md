# Pilot and launch checklist (milestone 7)

The automated checks below are done and repeatable (`npm test`, `npm run test:e2e`). The pilot itself needs real people, a real mailbox and the production server, so those items stay open until someone runs them. Tick each one and note the date, who ran it and the evidence.

## Already verified automatically (5 October 2026)

- [x] **Learner journey:**
  - invitation email → OTP sign-in → required password change → requested part;
  - navigation with commands and links, image enlargement;
  - optional answer, explicit save, failed save kept and retried;
  - save/discard/stay dialog for unsaved answers, Enter as a newline in answers;
  - My answers page and export.
- [x] **Administrator journey:**
  - creating accounts in bulk with a result per address;
  - resend, deactivate/reactivate, credential reset, deletion with typed confirmation;
  - last-administrator protection;
  - reading and exporting answers;
  - publishing a valid update, rejecting an invalid one while the old revision keeps serving;
  - redeploy recovery of revision files.
- [x] **Markdown:**
  - one sanitized dialect for course pages, response previews and admin views;
  - `<script>`, event handlers and `javascript:` links are removed;
  - external images are not loaded.
- [x] **Access boundaries:**
  - signed-out requests get sign-in or 401 for pages, images, search, exports and saving;
  - learners get 403 in administration and cannot read others' answers;
  - forms posted from other sites are rejected.
- [x] **Accessibility:** axe finds no serious violations on learner, account and admin pages in both themes; the main journeys work by keyboard; no horizontal scroll at 375 px and 700 px.
- [x] **Failures:**
  - SMTP failure recorded and retryable;
  - expired, used and replaced OTPs and reset links rejected;
  - failed answer saves never report success;
  - unreachable repository or missing branch reported while content keeps serving.
- [x] **Production image:** builds, runs as an unprivileged user, applies migrations at start, passes its health check, publishes from git; the Content Security Policy is active and pages work under it.
- [x] **Backup and restore drill** on the development database (see `docs/operations.md`).

## Before the pilot

- [ ] Railway deployment done (`docs/operations.md`), HTTPS working, `/health` returns `ok`.
- [ ] Production SMTP configured with SPF/DKIM; a test invitation arrives in Gmail, Seznam and Outlook mailboxes and is not marked as spam.
- [ ] Real support contact (`SUPPORT_EMAIL`) set and content owner named.
- [ ] Real course content published; `npm run content:validate` shows no errors.
- [ ] Regular `pg_dump` backups kept outside Railway; **restore drill repeated against the Railway database**.
- [ ] Policy values reviewed one last time: invitation 7 days, reset 60 minutes, session 30 days, deletion removes answers.

## Pilot with beginners

Run it with 3–5 beginners, each using their own laptop with the site **beside their real editor and terminal**. Observe without helping, and write down where they hesitate.

- [ ] Invitation email found and understood; first sign-in with the OTP; password change.
- [ ] Opening a lecture; moving with `/next`, `/back`, `/open 2`, and with the links; returning home.
- [ ] Understanding that the command bar is website navigation, not their terminal.
- [ ] Reading screenshots and enlarging an image; copying a terminal command.
- [ ] Writing an optional answer, previewing it, **saving explicitly**, finding it again under Moje odpovědi.
- [ ] Skipping an exercise without being blocked.
- [ ] Using the site on a phone (reading only is fine).
- [ ] Screen-reader pass (VoiceOver + Safari) and 200 % browser zoom by a tester.

## Administrator rehearsal

- [ ] Invite the pilot group in bulk, including one deliberately wrong address.
- [ ] Resend an invitation; recover one account with **Obnovit přístup**.
- [ ] Read and export the pilot answers.
- [ ] Publish a valid content change; then push an invalid one and confirm the error and that learners still see the previous version.

## Release gate

Launch only when all of these hold:

- [ ] The learner and administrator journeys above pass on the production server.
- [ ] There is no known access-control defect and no known defect that loses saved answers.
- [ ] The administrator can publish materials and handle account recovery without developer help (`docs/admin-guide.md`).
- [ ] Launch content is published with an explicit **Aktualizovat obsah**. There is no background publishing.
