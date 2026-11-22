param([switch]$Push, [switch]$CheckConnection, [switch]$Login)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'github-git.ps1')
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = Join-Path $root 'GitHub-Glyphy'
function Git-Run([string[]]$Arguments) {
    Invoke-GlyphyGit -Repository $target -Arguments $Arguments -Network:($Arguments[0] -eq 'push') -Interactive:$Push
    if ($LASTEXITCODE -ne 0) { throw ('Git failed: ' + ($Arguments -join ' ')) }
}
try {
    Initialize-GlyphyGit
    if (([int]$Push.IsPresent + [int]$CheckConnection.IsPresent + [int]$Login.IsPresent) -gt 1) { throw 'Choose only one mode: upload, --check or --login.' }
    if ($CheckConnection -or $Login) {
        Assert-GlyphyOrigin $target
        Show-GlyphyGit
        if ($Login) {
            Write-Host 'Opening Git Credential Manager browser sign-in. Choose Luka-Sophner. No token or password should be pasted into this script.'
            Invoke-GlyphyGit -Arguments @('credential-manager','github','login','--username','Luka-Sophner','--browser') -Network -Interactive
        }
        $refs = @(Invoke-GlyphyGit -Repository $target -Arguments @('ls-remote','--exit-code','origin','refs/heads/main') -Network)
        if ($refs.Count -ne 1) { throw 'GitHub did not return main. Connection verification was not successful.' }
        Write-Host 'Connection verified: repository main is readable with the selected account.'
        Write-Host 'No files copied, staged or committed. Nothing pushed. Write permission was not tested.'
        exit 0
    }
    if ($Push) { Show-GlyphyGit; Write-Host 'A first CLI sign-in may open in the browser. Choose Luka-Sophner.' }
    # A failed fetch or a three-way conflict stops BEFORE the snapshot is overwritten.
    & (Join-Path $PSScriptRoot 'sync-github.ps1') -Fetch:$Push -Interactive:$Push
    # Explicit source allowlist. No copied databases, photos, archives or Android build output.
    $files = @('package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts',
        'vitest.config.ts','playwright.config.ts','capacitor.config.json','.gitignore',
        'android-version.json','README.md','GITHUB_ANDROID_GUIDE.md','prepare-github.bat',
        'send-github-update.bat','setup-signing.bat','build-android.bat','INSTALL_ANDROID.md','V1.1_REPORT.md')
    foreach ($dir in @('src','scripts','tests')) {
        Get-ChildItem -LiteralPath (Join-Path $root $dir) -Recurse -File | Where-Object {
            $_.Extension -in @('.ts','.tsx','.mts','.mjs','.js','.css','.ps1') -and
            -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
        } | ForEach-Object { $files += $_.FullName.Substring($root.Length + 1).Replace('\','/') }
    }
    # Only reviewed application illustrations and icons; arbitrary SVG/images are excluded.
    $files += @('src/assets/glyphs/glyph-placeholder.svg','src/assets/glyphs/house-demo.svg',
        'src/assets/glyphs/water-demo.svg','src/assets/icons/glyphy-mark.svg',
        'src/assets/icons/note.svg','src/assets/icons/groups-close.svg',
        'src/assets/icons/groups-edit.svg','src/assets/icons/groups-action-bg.svg',
        'src/assets/icons/groups-trash.svg','src/assets/icons/groups-drag.svg',
        'src/assets/icons/nav-home.svg','src/assets/icons/nav-dictionary.svg',
        'src/assets/icons/nav-glyphs.svg','src/assets/icons/nav-diary.svg',
        'src/assets/settings/sleepy-glyphy.svg','src/assets/settings/next-profile.svg',
        'src/assets/settings/profile-pencil.svg','src/assets/settings/account-avatar.svg',
        'src/assets/fonts/UniSansHeavy.otf','tests/fixtures/sample-photo.jpg',
        'public/favicon.svg','public/manifest.webmanifest','public/icons/app.svg',
        'public/icons/icon-192.png','public/icons/icon-512.png','public/icons/maskable-512.png',
        '.github/workflows/build-android.yml','.github/workflows/setup-android-signing.yml',
        'scripts/android-icons/IconTimeline.java','scripts/android-icons/IconScheduler.java',
        'scripts/android-icons/IconReceiver.java','scripts/android-icons/GlyphyApplication.java')
    foreach ($frame in @(45,46,47,48)) {
        $files += "public/icons/frame-$frame.png"
        $files += "public/icons/frame-$frame-maskable.png"
        if ($frame -ne 45) { $files += "public/icons/frame-$frame.svg" }
    }
    $files = @($files | Sort-Object -Unique | Where-Object { Test-Path -LiteralPath (Join-Path $root $_) -PathType Leaf })
    $manifest = Join-Path $target '.glyphy-snapshot.json'
    $previousFiles = @()
    if ($Push) {
        if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { throw 'Prepared snapshot missing. Run prepare-github.bat first and review the files in Desktop.' }
        # Windows PowerShell 5.1 emits JSON arrays as one pipeline object.
        $previousFiles = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
        foreach ($file in $previousFiles) {
            if ($file -notin $files) { throw "Prepared file needs review against the source allowlist: $file. Nothing overwritten." }
        }
        # Upload the existing reviewed worktree. Never regenerate it over Desktop edits.
        $files = @($previousFiles | Where-Object { Test-Path -LiteralPath (Join-Path $target $_) -PathType Leaf })
    }
    # A prepared snapshot can already contain independent edits. Preserve them.
    if (-not $Push) {
        foreach ($file in $files) {
            $destination = Join-Path $target $file
            if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) { continue }
            $sourceHash = (Get-FileHash -LiteralPath (Join-Path $root $file) -Algorithm SHA256).Hash
            $targetHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
            if ($sourceHash -eq $targetHash) { continue }
            Invoke-GlyphyGit -Repository $target -Arguments @('ls-files','--error-unmatch','--',$file) 2>$null | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Independent file in GitHub copy: $file. Merge it into the source before preparing." }
            Invoke-GlyphyGit -Repository $target -Arguments @('diff','--quiet','HEAD','--',$file)
            if ($LASTEXITCODE -ne 0) { throw "Independent edits in GitHub copy: $file. Merge both versions before preparing; nothing overwritten." }
        }
    }
    foreach ($file in $files) {
        $source = Join-Path $(if ($Push) { $target } else { $root }) $file
        if ((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Symlink refused: $file" }
        if ($file -notmatch '\.(png|otf|jpg)$') {
            $content = [IO.File]::ReadAllText($source)
            if ($content -match '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}') {
                throw "Possible secret detected. Review file: $file"
            }
        }
    }
    if (-not $Push) {
        New-Item -ItemType Directory -Path $target -Force | Out-Null
        # Delete only files from the previous generated manifest, inside the checked snapshot path.
        $manifest = Join-Path $target '.glyphy-snapshot.json'
        $previousFiles = @()
        if (Test-Path -LiteralPath $manifest) {
            $previousFiles = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
            foreach ($old in $previousFiles) {
                $full = [IO.Path]::GetFullPath((Join-Path $target $old))
                if (-not $full.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase) -or $old -match '(^|[/\\])\.git([/\\]|$)') { throw 'Unsafe previous manifest path.' }
                if ($old -notin $files -and (Test-Path -LiteralPath $full -PathType Leaf)) {
                    Invoke-GlyphyGit -Repository $target -Arguments @('ls-files','--error-unmatch','--',$old) 2>$null | Out-Null
                    if ($LASTEXITCODE -ne 0) { throw "Untracked obsolete file requires review: $old. Nothing deleted." }
                    Invoke-GlyphyGit -Repository $target -Arguments @('diff','--quiet','HEAD','--',$old)
                    if ($LASTEXITCODE -ne 0) { throw "Edited obsolete file requires review: $old. Nothing deleted." }
                    Remove-Item -LiteralPath $full
                }
            }
        }
        foreach ($file in $files) {
            $destination = Join-Path $target $file
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $root $file) -Destination $destination -Force
        }
        [IO.File]::WriteAllText($manifest, (ConvertTo-Json -InputObject $files), (New-Object Text.UTF8Encoding($false)))
        if (-not (Test-Path -LiteralPath (Join-Path $target '.git'))) { Git-Run -Arguments @('init','-b','main') }
    }
    $tracked = @(Invoke-GlyphyGit -Repository $target -Arguments @('ls-files'))
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect repository files.' }
    foreach ($name in $tracked) {
        if ($name -notin $files -and $name -ne '.glyphy-snapshot.json') {
            # Allow deleted paths only when they were in the previous safe snapshot.
            if ((Test-Path -LiteralPath (Join-Path $target $name)) -or $name -notin $previousFiles) {
                throw "Unexpected tracked file. Review before upload: $name"
            }
        }
    }
    if ($Push) { Write-Host "Using $($files.Count) existing prepared files. Desktop edits were not overwritten." }
    else { Write-Host "Prepared $($files.Count) application files in: $target" }
    Write-Host 'Excluded: databases, user photos, ZIP backups, keys, .env, node_modules, dist, android.'
    if (-not $Push) {
        Write-Host 'Nothing uploaded. Open GitHub Desktop > File > Add local repository > this folder.'
        if ((@(Invoke-GlyphyGit -Repository $target -Arguments @('remote'))) -contains 'origin') {
            Write-Host 'Repository is already configured. To send reviewed updates, run send-github-update.bat.'
        } else {
            Write-Host 'Review the prepared source files and configure the GitHub repository in GitHub Desktop.'
        }
        exit 0
    }
    $origin = Invoke-GlyphyGit -Repository $target -Arguments @('remote','get-url','origin')
    if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?/?$') { throw 'Configure the GitHub repository in GitHub Desktop first (HTTPS origin required).' }
    Write-Host "Destination: $origin"
    Git-Run -Arguments @('diff','HEAD','--stat')
    Git-Run -Arguments @('status','--short')
    Write-Host 'Review the GitHub destination and the file list above before uploading.'
    $answer = Read-Host 'Type SEND GLYPHY to authorize upload, or press Enter to cancel'
    if ($answer -cne 'SEND GLYPHY') { Write-Host 'Upload cancelled.'; exit 0 }
    # Confirmation precedes even staging. Only reviewed paths are added.
    Git-Run -Arguments (@('add','--') + $files + @('.glyphy-snapshot.json'))
    Git-Run -Arguments @('add','-u')
    Invoke-GlyphyGit -Repository $target -Arguments @('diff','--cached','--quiet')
    if ($LASTEXITCODE -eq 1) {
        # No global identity changes; no email/login/token embedded in the script.
        Git-Run -Arguments @('-c','user.name=Glyphy owner','-c','user.email=glyphy@users.noreply.github.com','commit','-m','Update Glyphy Android source')
    } elseif ($LASTEXITCODE -ne 0) { throw 'Could not inspect staged changes.' }
    Git-Run -Arguments @('push','-u','origin','main')
    Write-Host 'Uploaded. GitHub > Actions > Build Glyphy Android APK > Run workflow.'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
