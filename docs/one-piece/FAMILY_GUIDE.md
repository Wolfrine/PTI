# One Piece family viewing

**Release preparation draft.** The app is in draft PR43. Final capacity, production Cast, activation and live-site acceptance remain release gates. The address below is the intended release address, not a claim that the app is already live.

Open **PTI → All Apps → One Piece**, or bookmark `https://pti-app-2ab59.web.app/one-piece/`. Use your invited Google account on the home network. The always-on PC must be on, with its Windows owner signed in. Each person keeps separate progress.

## One-time device setup

The PC's household certificate is already trusted on its Windows owner's account. Each Android phone/tablet or other laptop needs the public certificate once. In the app, open **Home connection**, download the household certificate, check the displayed fingerprint against the administrator's setup record, and install it as a CA certificate in the device settings. Return to the app, open its connection test, allow local-network access when the browser asks, then choose **Check again**. Finish trust setup if a warning appears; do not bypass it.

Only the public certificate is transferred. The TV uses a separately approved, limited home-LAN media link and does not need this CA installation. Android menus vary; actual physical-device trust/installation is still a release acceptance check.

Use **Install app** when it appears, or the browser's install option. One Piece has its own app identity and icon. Installing it does not replace PTI. Watching still needs the home network and PC; fetching an episode that is not prepared also needs internet/source access. Videos are not downloaded to the phone for offline viewing.

## First household setup

The administrator pairs the PC once. Use the one-use pairing code shown in a real local PC terminal, check the Google account shown in the app, then choose **Confirm owner account**. Create the family library when prompted. Never share the setup code, protected runtime folder or private certificate keys.

The owner opens **Your account → Family invitations**, enters each person's Google email and display name, and chooses **Save invitation**. Saving the record does not send email. Share the app link normally. Each invited person opens it with the matching Google account and chooses **Accept invitation**.

Each person also chooses **Confirm with Google** for the one-time PC account connection. Allow the Google confirmation popup and check the account shown. The PC can then prepare episodes and maintain that person's playback/progress while the sender is asleep. **Disconnect and sign out** revokes that account's PC access. If the PC cannot confirm disconnection, the app explains that uncertainty and offers an explicit local-only sign-out; that choice does not establish that the PC connection was revoked.

## Watching

- Use **Resume episode** when available, an episode number, or the numbered ranges. Titles stay hidden by default. **Your account → Show verified episode titles** enables title search where titles are supplied; the current catalogue has titles from source filenames for episodes 1001–1085. Earlier episodes are searchable by number.
- New episodes may show **Preparing** while the PC fetches and prepares them automatically. First preparation can take minutes. No one needs to download, rename or choose a video file. Already prepared episodes start and seek much faster.
- Japanese audio and full English dialogue subtitles are the defaults. Use **Audio & subtitles** to change available tracks. Preferences follow the account.
- Use fullscreen for a PC connected to the TV by HDMI. Keyboard Space/arrows operate the focused native player; page-level arrows seek ten seconds, and K/F provide playback/fullscreen shortcuts.
- To cast, choose the Cast control and select the TV. The device becomes a remote with play/pause, seeking, volume, subtitles and next episode. Choose **Continue on this device** to return at the TV's actual position. The app will not take over an unrelated active TV session silently.
- Enable **Play next automatically** if desired. Episode589 stops at missing590 and offers explicit continuation to591. Episode1000→1001 crosses collections normally. These sources end at1085; Netflix remains separate.
- A second device on the same profile offers an explicit takeover. Use different invited accounts for independent watching.

## When something goes wrong

The library remains browsable when the PC is unavailable, provided the app/catalogue has loaded. Check home Wi-Fi, PC power/Windows sign-in and **Home connection**, then retry. After a PC restart, sign in to its Windows owner's account before watching; the companion does not run before Windows login. Guest Wi-Fi can isolate devices and prevent access or TV discovery. Version1 does not provide remote viewing outside the home.

If a source fails, retry from the app. Preparation is bounded and automatic; do not delete files from the runtime/cache folders manually. If another device owns the profile, use its takeover prompt deliberately. If the TV is busy, leave its current viewing untouched and retry when it is idle.

Administrative recovery and the exact public-CA fingerprint are documented in [ONEPIECE_RUNTIME.md](ONEPIECE_RUNTIME.md). Current acceptance and hardware gaps are in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

Still unverified on the actual family setup: Google owner pairing, invitations and each viewer's PC account connection; Android certificate trust/PWA installation/playback; HDMI picture and sound; phone sleep/reconnection; and Windows reboot/logon recovery. Desktop-sized and mobile-sized browser fixtures do not complete those checks.
