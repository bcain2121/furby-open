# Guided installer

Furby Open provides thin operating-system bootstrappers plus one shared Node.js onboarding wizard. The platform scripts install files and dependencies; `npm run setup` handles identity, private personality, Telegram, Pi login guidance, and validation consistently on every operating system.

## Before you begin

You need:

- a macOS, Windows 10/11, or mainstream Linux computer that stays on while the bot is running
- a Telegram account
- a ChatGPT Plus/Pro, Claude Pro/Max, GitHub Copilot, or supported API-provider account
- permission to install software on the computer when system tools are missing

Do not run Furby Open inside a disposable web-agent sandbox. Telegram polling and local data need a persistent computer.

## Double-click installation

### macOS

1. Download and unzip `Furby-Open-Installer-macOS-Linux.zip` from the tagged release.
2. Double-click `Install-Furby-Open.command`.
3. If Gatekeeper blocks it, Control-click the file, choose **Open**, and confirm **Open**.
4. Keep the Terminal window open and follow one prompt at a time.

The launcher runs the reviewable `install.sh` beside it. It does not bypass Gatekeeper or request secrets outside the terminal.

### Windows

1. Download and unzip `Furby-Open-Installer-Windows.zip` from the tagged release.
2. Double-click `Install-Furby-Open.cmd`.
3. Keep the Command Prompt window open.
4. Accept Windows Package Manager prompts only for packages you want installed.

The `.cmd` launcher opens `install.ps1` from the same folder. PowerShell's process-only execution-policy bypass is used because downloaded local scripts are commonly blocked; it does not change the computer's permanent execution policy.

### Linux

Most Linux file managers do not have one universal double-click policy for shell scripts. Either right-click `install.sh` and choose **Run as Program**, or open a terminal in the unzipped folder and run:

```bash
chmod +x install.sh
./install.sh
```

## Direct terminal installation

### macOS or Linux

```bash
curl -fL https://raw.githubusercontent.com/bcain2121/furby-open/v0.1.0-alpha.4/install.sh -o install-furby-open.sh
less install-furby-open.sh
bash install-furby-open.sh
```

### Windows PowerShell

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/bcain2121/furby-open/v0.1.0-alpha.4/install.ps1 -OutFile "$env:TEMP\install-furby-open.ps1"
Get-Content "$env:TEMP\install-furby-open.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\install-furby-open.ps1"
```

Downloading first allows you or a trusted technical person to inspect the script before running it. Installer releases also include `SHA256SUMS.txt` for bundle verification. Avoid commands from unofficial mirrors.

## What gets installed

Default application location:

- macOS/Linux: `~/FurbyOpen`
- Windows: `%USERPROFILE%\FurbyOpen`

The installer:

1. checks Git and Node.js
2. offers to install missing prerequisites
3. clones the pinned release rather than an arbitrary branch
4. installs exactly the JavaScript dependency versions in `package-lock.json`
5. performs a TypeScript build check
6. opens the shared guided setup

On macOS/Linux, the fallback Node installer downloads the official latest Node 22 archive from `nodejs.org`, verifies it against the official `SHASUMS256.txt`, and extracts it under `~/.local/share/furby-open/`. It links the commands under `~/.local/bin/` and adds that standard user-bin directory to `~/.profile` (and `~/.zprofile` on macOS). It does not require administrator access.

On Windows, Git and Node.js are installed through Windows Package Manager using `Git.Git` and `OpenJS.NodeJS.22` after confirmation.

`ffmpeg` and Poppler are feature dependencies. Text chat works without them; voice/media conversion needs `ffmpeg`, and PDF extraction needs `pdftotext`.

## Guided setup stages

`npm run setup` asks for:

1. assistant and owner names, timezone, optional weather city, tone, proactivity, dislikes, and recurring interests
2. secure Telegram setup through the dedicated hidden-input helper
3. Pi `/login` and `/model` through Pi's own interactive/provider flow
4. local and Telegram validation

Telegram tokens are never echoed. OAuth and API-provider authentication stay in Pi/provider-owned interfaces. The installer never starts the bot automatically; after all required checks pass, it offers a final explicit **Start now?** prompt whose default answer is No.

## Custom installation locations

macOS/Linux:

```bash
FURBY_OPEN_INSTALL_DIR="$HOME/Applications/FurbyOpen" bash install-furby-open.sh
```

Windows:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\install.ps1 -InstallDirectory 'D:\FurbyOpen'
```

## Resume after interruption

The installer does not erase completed steps. From the application folder, rerun:

```bash
npm run setup
```

Targeted commands are also available:

```bash
npm run setup:telegram
npm run verify:telegram
npx pi
npm run doctor
```

## Common problems

### “Guided setup needs a normal interactive terminal”

The command was run inside a coding-agent tool or redirected shell without a TTY. Open Terminal, PowerShell, or Command Prompt yourself, enter the Furby Open folder, and run `npm run setup`. Never solve this by pasting credentials into agent chat.

### Git or Node was installed but is still not found on Windows

Close the installer window and double-click `Install-Furby-Open.cmd` again. Windows may not expose a newly updated PATH to an already-running process.

### macOS says the developer cannot be verified

Control-click `Install-Furby-Open.command`, choose **Open**, and inspect `install.sh` if desired. Do not disable Gatekeeper globally.

### `ffmpeg` or `pdftotext` is missing

You can finish text-only setup. Install the missing feature later, then rerun `npm run doctor`.

### Bot or model login is incomplete

Rerun `npm run setup`. It updates only targeted identity values and never displays an existing Telegram token.

## Uninstall

Stop Furby Open, then delete its application folder. That folder contains `.env`, `.data`, personality, conversations, and workspace files, so make a private backup first if you want to keep them. Pi's shared provider login under `~/.pi/agent/` is outside the application and is not deleted automatically.
