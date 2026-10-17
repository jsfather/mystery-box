# A little world for the two of you

## Set up your two accounts

On a **fresh database**, the server creates the first account from `ADMIN_USERNAME`, `ADMIN_NAME`, and `ADMIN_PASSWORD`. The default username is `husband`. To create both accounts immediately, also set `PARTNER_USERNAME` (default `wife`), `PARTNER_NAME`, and an independent `PARTNER_PASSWORD` of at least 16 characters.

If you leave `PARTNER_PASSWORD` empty, sign in to the first account, open **You & me**, and create her account there. There are no hardcoded passwords. Both accounts can use every control, manage users, and read the shared history and journal. Share the login details with each other privately.

These environment variables bootstrap an empty database only. Afterward, edit profiles or passwords in **You & me**. Changing an environment password does not replace an existing account’s password. Existing installations retain their clock settings and stored messages; notes from before accounts were introduced are labeled “Before accounts.”

Profiles have separate usernames, display names and scrypt password hashes. Sessions survive app/server restarts and expire after 30 days. Password changes or disabling an account invalidate its sessions immediately. Changing your own password requires your current password. You cannot disable the account you are using. Disabling preserves authorship and history. Accounts are equal trusted owners, so either owner can reset another account’s password or create another owner account; do not create accounts for untrusted visitors.

## Save your special second

Open **Our story**:

1. Enter your names. This dashboard label can include Persian text.
2. Enter the Gregorian date, time **and seconds** when your story began.
3. Choose the IANA timezone where it happened, such as `Asia/Tehran`. This is independent of the phone’s timezone and the clock’s current display timezone.
4. Set a short LCD dedication, such as `YOU & ME <3`. The physical character LCD still requires Latin/ASCII text, up to 16 characters.
5. Choose **Our time together**, **Date & time**, **A little of both**, or scheduled story moments.
6. Choose a counter format: days/time, total seconds, total days, weeks/days, total hours, or a rotating view.
7. For scheduled moments, set a repeat interval in minutes and a duration in seconds, for example **every 10 minutes for 30 seconds**.

The chosen moment is saved as an absolute instant. The timer shows complete elapsed **days, hours, minutes and seconds**. One elapsed day is exactly 86,400 seconds; this is not a calendar-month/year breakdown. Changing the display calendar or timezone never changes that starting instant. Future start times are rejected. If you choose a time repeated by a daylight saving transition, expand “If the clocks changed that night” to pick the first or second occurrence. Nonexistent local times are rejected.

The LCD dedicates the first row to your title and uses the second row for a compact counter such as `1234d 05:06:07`. Alternate mode switches between the clock and love counter every 12 seconds. Scheduled mode opens a story window at each fixed UTC interval boundary; its duration must be shorter than its interval. With a 10-minute interval, windows start on UTC :00, :10, :20, and so on. The schedule follows elapsed time through DST changes. The dashboard offers an immediate mode dropdown next to the backlight control. Messages temporarily take priority, and your chosen display resumes when the message window ends.

**Upload the updated firmware (1.1.0)** to keep the love counter running during network loss. The firmware caches the starting instant and counts using the onboard RTC while power remains on. An `*` marks offline output. During an outage, alternate and scheduled modes fall back to the love counter. The updated sketch preserves the selected counter format offline, including rotating formats. Reflash to obtain that behavior; the online formats work with the previous sketch. After a complete power loss, it must reconnect to synchronize again; the listed hardware has no RTC backup battery. Older firmware displays online love frames but falls back to its ordinary clock during an outage.

## Your notes and journal

**Messages** is your shared conversation: your own bubbles are on the right and your partner’s on the left, with the sender’s saved name and timestamp. Both accounts see the same messages in real time while the app is open. Messages are grouped by day and by nearby notes from the same person, with timestamps inside each bubble. Search, load earlier messages, or open the three-dot message options to cancel an LCD display window or choose **Show on box again**. New arrivals animate briefly; existing history stays still and reduced-motion preferences are respected. On phones, the conversation uses the available screen height with its composer in view; very short displays allow scrolling to keep every control reachable. Cancelling a display window keeps the chat message. Every newly sent message is also queued for the physical box. The default duration is **two minutes**. Change the default and choose a full-message layout or **time on top / message below** in **Preferences**. The latter keeps the top clock live while long messages scroll across the bottom. Individual messages can override duration. Notes persist after their display windows expire and after server restarts. New notes are no longer automatically deleted after the most recent 100. The live dashboard uses a recent 100-note view; the full archive remains accessible through pagination. Notes already purged by the old version cannot be recovered.

**Our journal** records sign-ins/sign-outs, unsuccessful sign-ins, account changes, settings changes, notes sent/cancelled, server starts/stops, and broker/device connection changes. Entries persist in SQLite and are paginated. They omit passwords, password hashes and session tokens. The journal stores actor names at the time of the action. It is application activity history, not a tamper-proof forensic audit trail against somebody who controls the host/database.

Both partners edit the same settings. Each settings save includes a revision: if another device has saved since you opened a form, the server rejects your stale change rather than silently replacing theirs. Reload the page to review the latest settings before saving again.

Keep the database volume and back it up consistently. It now contains personal notes, names, your special date, password hashes, session hashes, and activity. No private API responses are cached by the service worker. Notes and logs remain on the server until you intentionally erase them through factory reset or restore database data; monitor disk space for long-running installations.

## Appearance and factory reset

The app follows the device’s light/dark appearance by default, including live device-theme changes. Use the Light / Dark / System control in the header or **Preferences** to override it for this browser. On phones, the appearance icon beside the logo opens those choices; connection status and sign-out sit in the same row. Theme choices persist on the device, independently for each browser, and synchronize across its open tabs. The offline page also respects the saved preference. Main text, muted text and conversation color pairs have automated WCAG AA contrast checks.

In **Preferences → Factory reset**, either owner can restore display settings, remove the saved story moment, and cancel active/future LCD messages. Accounts, passwords, sessions and MQTT/Wi-Fi credentials remain. The confirmation form requires your current password and typing `RESET`.

By default the conversation and journal are preserved. Selecting **Also permanently erase our conversation and journal** deletes those records in the same transaction; a new reset journal entry records who performed the reset. There is no undo for this option. This resets server-managed box settings, not the Wi-Fi credentials compiled into the Arduino sketch. Existing installations upgrade automatically with two-minute messages, the full-message layout and the original days/time counter.

## Install on her iPhone

Deploy on your **HTTPS domain** first. On her iPhone:

1. Open the site in **Safari** and sign in with her account.
2. Open Safari’s menu / **Share**.
3. Tap **Add to Home Screen**.
4. Leave **Open as Web App** enabled if offered, then tap **Add**.

The app has a standalone manifest, 192/512-pixel icons, a maskable icon, an Apple touch icon, safe-area layouts, and a service worker. The footer’s **Install app** button shows these steps on iPhone and uses the native installation prompt on supporting browsers. Safari may require a separate sign-in in the installed app.

Only static assets and an offline information page are cached. If the app opens without connectivity, it shows a clear offline screen; it does not cache private messages or pretend to save/send changes offline. Reconnect to use controls. New app versions show an update notice so you can save open forms before reloading. Push notifications and background message delivery on the phone are not included; the physical box continues independently of whether the phone app is open.

Installation was implemented against [Apple’s Home Screen web-app instructions](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios), [WebKit’s standalone web-app behavior](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), and [MDN’s service-worker guidance](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers). Final installation should be checked on her actual iPhone after HTTPS deployment.
