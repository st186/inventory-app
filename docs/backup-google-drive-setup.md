# Backups and Google Drive: one-time setup (owner)

This sets up the new Backup & Restore page and the automatic nightly backup to your Google Drive.
It takes about 15–20 minutes, once. You need a computer with the project folder, Node 18 or newer,
and the Supabase CLI (the same things you use to deploy).

What you get:

- **Every night from 2:30 AM IST** the server makes a full, encrypted backup of every record in the
  app (plus the list of logins, without passwords) and puts it in your Google Drive. It keeps the
  last 30 days and the first backup of each month for a year; older ones go to the Drive bin.
- On the Backup page (owner only): the last backup's status, **Download full backup now**,
  **Check a backup file**, and **Restore** (dry run first, you choose what to restore, typed
  confirmation, and a safety copy of anything it replaces).
- If the nightly backup fails, you get a push notification.

The same one-time Google connection is also used to store the **workplace photos**. Everything the
app puts in Drive lives inside one folder called **Bunny Momos**:

```
Bunny Momos/                      (GDRIVE_FOLDER_ID)
  Backups/                        nightly backups, bunny-momos-backup-YYYY-MM-DD-HHMM.bunnybak
  Workplace photos/YYYY-MM/YYYY-MM-DD/<location>/
```

The app asks Google only for the **drive.file** permission: it can see and change **only the files
and folders it created itself**, never anything else in your Drive. That is also why the folder
must be the one the connect script makes (step 5); a folder you make by hand is invisible to the app.

All commands below are for **PowerShell**, run from the project folder. Run them one at a time.

---

## Step 1 – Backup passphrase (required for any backup)

Every backup file is locked (AES-256) with a key made from this passphrase. **Without it, nobody can
open a backup – not you, not us.** Make a strong one:

```powershell
$b = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

1. Save the printed value in your password manager **and** write it on paper kept somewhere safe.
2. Put it in Supabase (replace the example with your value, keep the double quotes):

```powershell
supabase secrets set --project-ref xssxnhrzxvtejavoqgwg "BACKUP_PASSPHRASE=PASTE-YOUR-PASSPHRASE-HERE"
```

It must be at least 12 characters; until it is set the Backup page says backups are switched off.

If you ever change it, keep the old one too, so older backups still open:

```powershell
supabase secrets set --project-ref xssxnhrzxvtejavoqgwg "BACKUP_PASSPHRASE_PREVIOUS=THE-OLD-PASSPHRASE"
```

## Step 2 – Google Cloud project

1. Open <https://console.cloud.google.com/> signed in with the Google account that should hold the
   backups (the business Gmail is best).
2. Top bar → project picker → **New project** → name it `Bunny Momos` → **Create**, and select it.
3. Menu → **APIs & Services → Library** → search **Google Drive API** → **Enable**.

## Step 3 – OAuth consent screen ("Google Auth Platform")

1. Menu → **APIs & Services → OAuth consent screen** (it may be called **Google Auth Platform**) →
   **Get started**.
2. App name `Bunny Momos backup`, support email = your email → Audience **External** → contact
   email → agree → **Create**.
3. **Data access** → **Add or remove scopes** → tick
   `https://www.googleapis.com/auth/drive.file` (you can paste it in the filter box) → **Update** → **Save**.
4. **Audience** → **Publish app** → confirm, so the status shows **In production**.
   This matters: while it says *Testing*, Google ends the connection after 7 days and the nightly
   backup stops. `drive.file` needs no Google review.

## Step 4 – OAuth client

1. **APIs & Services → Credentials** (or **Clients**) → **Create credentials → OAuth client ID**.
2. Application type **Desktop app**, name `Bunny Momos connect` → **Create**.
3. Copy the **Client ID** and **Client secret** (keep the window open or download the JSON).

"Desktop app" is needed because the connect script receives Google's answer on your own computer.

## Step 5 – Connect your Google Drive (once)

```powershell
node scripts/google-drive-connect.mjs --client-id "PASTE-CLIENT-ID" --client-secret "PASTE-CLIENT-SECRET"
```

Your browser opens Google's page. Sign in with the same Google account and press **Allow**.
If Google says *"Google hasn't verified this app"*, click **Advanced → Go to Bunny Momos backup**
(it is your own app). The browser then says *Connected*, a **Bunny Momos** folder appears in your
Drive, and the terminal prints four commands like these:

```powershell
supabase secrets set --project-ref xssxnhrzxvtejavoqgwg "GDRIVE_CLIENT_ID=..."
supabase secrets set --project-ref xssxnhrzxvtejavoqgwg "GDRIVE_CLIENT_SECRET=..."
supabase secrets set --project-ref xssxnhrzxvtejavoqgwg "GDRIVE_REFRESH_TOKEN=..."
supabase secrets set --project-ref xssxnhrzxvtejavoqgwg "GDRIVE_FOLDER_ID=..."
```

## Step 6 – Save the secrets and deploy

1. Run the four printed commands, one at a time. Then clear the window (`cls`): the refresh token is
   a key to the app's files in your Drive, so do not paste it anywhere else.
   Never put any of these values in the code – the GitHub repository is public.
2. Deploy the server so it has the new backup code:

```powershell
supabase functions deploy make-server-c2dd9b9d --project-ref xssxnhrzxvtejavoqgwg
```

## Step 7 – Turn on the nightly schedule

The schedule is in `supabase/migrations/20261027020000_backup_drive_cron.sql`. Either run
`supabase db push`, or open Supabase → **SQL Editor**, paste the file's contents and press **Run**.

It calls the server at 21:00 UTC (2:30 AM IST) and then every 5 minutes until 03:25 IST. The first
call makes the backup; the later calls only carry on a backup that was too big for one call, and
otherwise return at once. It uses the same cron secret in Vault as the other nightly jobs
(`cron_sync_secret`, set up by the `20261021000000_cron_secret_in_vault` migration), so nothing new
is needed for it.

To turn it off later: `select cron.unschedule('nightly-backup-drive');` in the SQL Editor.

## Step 8 – Test it

1. In the app (owner login) open **Backup** → **Back up to Google Drive now**. When it finishes,
   check Drive: **Bunny Momos → Backups** has a `.bunnybak` file.
2. Press **Download full backup now**, then pick that file under **Check or restore a backup file**
   and press **Check this file**. It should say the file is good and list the logins in it.
3. The next morning the Backup page should show last night's backup.

---

## Restoring

1. Get the backup file (from Drive: right-click → Download; or one you downloaded).
2. Backup page → pick the file → **Check this file** (optional but wise).
3. **Step 1: See what a restore would change** shows, for each kind of record, how many are
   *missing now* (will come back), *changed since*, *the same*, and *new since the backup*
   (never touched – a restore never deletes anything).
4. Tick the kinds to restore, choose **Only put back missing records** (safe) or **Also replace
   records that changed**, type `RESTORE`, and press **Step 2: Restore now**. Keep the screen open
   until it finishes.
5. Before replacing anything, the server saves the current version in `restore-snapshot:…`
   records, and writes what it did to `restore-log:…` (shown under *Recent restores*).

**Logins are not restored.** The backup lists every login (name, email, role); if someone can no
longer sign in, add them again in Employees. If the whole Supabase project were ever lost, you would
first create a new project, deploy the function, set the same `BACKUP_PASSPHRASE`, and create your
own owner login by hand (Supabase → Authentication → Add user, then set `role: cluster_head` in its
app_metadata), then restore from the Backup page.

**Opening a backup without the app** (for example to look inside one):

```powershell
$env:BACKUP_PASSPHRASE = 'YOUR-PASSPHRASE'
node scripts/backup-decrypt.mjs "C:\Users\you\Downloads\bunny-momos-backup-2026-10-27-0230.bunnybak"
```

It writes `rows.ndjson`, `logins.json` and `manifest.json` next to the file. Those are **not**
encrypted – delete them when done.

## What is in a backup

Every row of the app's data table, in key order, with its original key; plus the logins (id, email,
roles, name, created date – never passwords or password hashes). Left out on purpose because they
mean nothing a day later: live rider locations, cached travel times and forecast checks, one-time
approve/reject links, per-person AI usage counters, "reminder already sent" flags, and the backup's
own progress/lock/status and restore safety-copy rows.

## Size and speed limits

A server call may use about 2 seconds of CPU and 256 MB of memory, so the backup works in steps:
each call reads rows (1000 at a time; photo and employee rows 10 at a time), packs them into
encrypted parts of about 4 MB, and stops after about 24 MB or 0.8 s of busy time, saving where it got
to. The download button and the nightly job simply call again until it is done; checking and
restoring send the file back about 8 MB at a time. A backup made over several calls is read over a
few seconds to minutes, so a record changed in between may come from a slightly different moment –
which is why the nightly run is at 2:30 AM.

## Troubleshooting

| Message | What to do |
|---|---|
| Backups are switched off: BACKUP_PASSPHRASE is not set | Step 1, then deploy (step 6). |
| Google Drive is not connected | Steps 2–6. All four `GDRIVE_*` secrets must be set. |
| Google refused the saved sign-in (GDRIVE_REFRESH_TOKEN) | The consent screen is still in Testing, or access was removed at myaccount.google.com/permissions. Do step 3.4, run step 5 again, save the new token. |
| Google Drive cannot find the folder in GDRIVE_FOLDER_ID | The folder was made by hand or deleted. Run step 5 again and save the folder ID it prints. |
| This backup cannot be opened with the passphrase set now | The file was made with another passphrase: set it as `BACKUP_PASSPHRASE_PREVIOUS`. |
| Google did not send a refresh token (connect script) | Open <https://myaccount.google.com/permissions>, remove *Bunny Momos backup*, run step 5 again. |
