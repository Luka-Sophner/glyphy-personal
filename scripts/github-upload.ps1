param([switch]$Push)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = Join-Path $root 'GitHub-Glyphy'
function Git-Run([string[]]$Arguments) {
    & git -C $target @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('Git failed: ' + ($Arguments -join ' ')) }
}
try {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Install GitHub Desktop, then reopen this script.' }
    # A failed fetch or a three-way conflict stops BEFORE the snapshot is overwritten.
    & (Join-Path $PSScriptRoot 'sync-github.ps1') -Fetch:$Push
    # Explicit source allowlist. No copied databases, photos, archives or Android build output.
    $files = @('package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts',
        'vitest.config.ts','playwright.config.ts','capacitor.config.json','.gitignore',
        'android-version.json','GITHUB_ANDROID_GUIDE.md','prepare-github.bat',
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
        'src/assets/fonts/UniSansHeavy.otf','tests/fixtures/sample-photo.jpg',
        'public/favicon.svg','public/manifest.webmanifest','public/icons/app.svg',
        'public/icons/icon-192.png','public/icons/icon-512.png','public/icons/maskable-512.png',
        '.github/workflows/build-android.yml','.github/workflows/setup-android-signing.yml')
    $files = @($files | Sort-Object -Unique | Where-Object { Test-Path -LiteralPath (Join-Path $root $_) -PathType Leaf })
    # A prepared snapshot can already contain independent edits. Preserve them.
    foreach ($file in $files) {
        $destination = Join-Path $target $file
        if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) { continue }
        $sourceHash = (Get-FileHash -LiteralPath (Join-Path $root $file) -Algorithm SHA256).Hash
        $targetHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
        if ($sourceHash -eq $targetHash) { continue }
        & git -C $target ls-files --error-unmatch -- $file 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Independent file in GitHub copy: $file. Merge it into the source before preparing." }
        & git -C $target diff --quiet HEAD -- $file
        if ($LASTEXITCODE -ne 0) { throw "Independent edits in GitHub copy: $file. Merge both versions before preparing; nothing overwritten." }
    }
    foreach ($file in $files) {
        $source = Join-Path $root $file
        if ((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Symlink refused: $file" }
        if ($file -notmatch '\.(png|otf|jpg)$') {
            $content = [IO.File]::ReadAllText($source)
            if ($content -match '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}') {
                throw "Possible secret detected. Review file: $file"
            }
        }
    }
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
                & git -C $target ls-files --error-unmatch -- $old 2>$null | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "Untracked obsolete file requires review: $old. Nothing deleted." }
                & git -C $target diff --quiet HEAD -- $old
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
    $tracked = @(& git -C $target ls-files)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect repository files.' }
    foreach ($name in $tracked) {
        if ($name -notin $files -and $name -ne '.glyphy-snapshot.json') {
            # Allow deleted paths only when they were in the previous safe snapshot.
            if ((Test-Path -LiteralPath (Join-Path $target $name)) -or $name -notin $previousFiles) {
                throw "Unexpected tracked file. Review before upload: $name"
            }
        }
    }
    Write-Host "Prepared $($files.Count) application files in: $target"
    Write-Host 'Excluded: databases, user photos, ZIP backups, keys, .env, node_modules, dist, android.'
    if (-not $Push) {
        Write-Host 'Nothing uploaded. Open GitHub Desktop > File > Add local repository > this folder.'
        if ((@(& git -C $target remote)) -contains 'origin') {
            Write-Host 'Repository is already configured. To send reviewed updates, run send-github-update.bat.'
        } else {
            Write-Host 'Review changes, commit, Publish repository and KEEP THE CODE PRIVATE.'
        }
        exit 0
    }
    $origin = & git -C $target remote get-url origin
    if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$') { throw 'Publish the PRIVATE repository in GitHub Desktop first (HTTPS origin required).' }
    Write-Host "Destination: $origin"
    # Only allowlisted paths are staged; unknown files in the snapshot are never added.
    Git-Run -Arguments (@('add','--') + $files + @('.glyphy-snapshot.json'))
    Git-Run -Arguments @('add','-u')
    Git-Run -Arguments @('diff','--cached','--stat')
    Write-Host 'Check on GitHub that the repository is PRIVATE and review the file list above.'
    $answer = Read-Host 'Type SEND PRIVATE to authorize upload, or press Enter to cancel'
    if ($answer -cne 'SEND PRIVATE') { Write-Host 'Upload cancelled.'; exit 0 }
    & git -C $target diff --cached --quiet
    if ($LASTEXITCODE -eq 1) {
        # No global identity changes; no email/login/token embedded in the script.
        Git-Run -Arguments @('-c','user.name=Glyphy owner','-c','user.email=glyphy@users.noreply.github.com','commit','-m','Update Glyphy Android source')
    } elseif ($LASTEXITCODE -ne 0) { throw 'Could not inspect staged changes.' }
    Git-Run -Arguments @('push','-u','origin','main')
    Write-Host 'Uploaded. GitHub > Actions > Build Glyphy Android APK > Run workflow.'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
