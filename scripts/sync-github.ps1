param([switch]$Fetch, [string]$ProjectRoot, [switch]$Interactive)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'github-git.ps1')
Initialize-GlyphyGit
$root = if ($ProjectRoot) { [IO.Path]::GetFullPath($ProjectRoot) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
$target = Join-Path $root 'GitHub-Glyphy'
if (-not (Test-Path -LiteralPath (Join-Path $target '.git'))) { return }
function Run-Git([string[]]$Arguments) {
    $result = Invoke-GlyphyGit -Repository $target -Arguments $Arguments -Network:($Arguments[0] -eq 'fetch') -Interactive:$Interactive
    if ($LASTEXITCODE -ne 0) { throw ('Git synchronization failed: ' + ($Arguments -join ' ')) }
    return $result
}
$origin = Invoke-GlyphyGit -Repository $target -Arguments @('remote','get-url','origin') 2>$null
if ($LASTEXITCODE -ne 0) { if ($Fetch) { throw 'No origin. Publish the PRIVATE repository in GitHub Desktop first.' }; return }
if ($origin -notmatch '^https://github\.com/Luka-Sophner/glyphy-personal(?:\.git)?/?$') { throw 'Unexpected origin. Review the repository address before synchronizing.' }
if ((Run-Git -Arguments @('branch','--show-current')) -ne 'main') { throw 'Switch GitHub-Glyphy to main in GitHub Desktop first.' }
if ($Fetch) {
    Write-Host 'Fetching remote changes BEFORE copying or staging any source files...'
    Run-Git -Arguments @('fetch','origin') | Out-Host
}
Invoke-GlyphyGit -Repository $target -Arguments @('show-ref','--verify','--quiet','refs/remotes/origin/main')
if ($LASTEXITCODE -ne 0) { if ($Fetch) { throw 'origin/main is unavailable.' }; return }
$ahead = [int](Run-Git -Arguments @('rev-list','--count','HEAD..origin/main'))
if ($ahead -eq 0) { return }
Invoke-GlyphyGit -Repository $target -Arguments @('merge-base','--is-ancestor','HEAD','origin/main')
if ($LASTEXITCODE -ne 0) { throw 'Local and remote history diverged. No files overwritten. Resolve with assistance; never force push.' }
$manifest = Join-Path $target '.glyphy-snapshot.json'
$allowed = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
$changed = @(Run-Git -Arguments @('diff','--name-only','HEAD..origin/main'))
foreach ($file in $changed) {
    if (@(Run-Git -Arguments @('status','--porcelain','--',$file)).Count -gt 0) { throw "Local and remote edits overlap in the GitHub copy: $file" }
    if ($file -eq '.glyphy-snapshot.json' -or ($file -notin $allowed -and $file -cne 'README.md')) { throw "Remote file needs review before synchronization: $file. No files overwritten." }
    $source = [IO.Path]::GetFullPath((Join-Path $root $file))
    if (-not $source.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe remote path.' }
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Local file missing or deleted: $file. No files overwritten." }
    $remote = Run-Git -Arguments @('rev-parse',('origin/main:' + $file))
    $local = Run-Git -Arguments @('hash-object',('--path=' + $file),'--',$source)
    if ($local -eq $remote) { continue }
    if (-not (Run-Git -Arguments @('ls-tree','--name-only','HEAD','--',$file))) { throw "New remote file differs from local source: $file" }
    $old = Run-Git -Arguments @('rev-parse',('HEAD:' + $file))
    if ($local -ne $old -and $local -ne $remote) { throw "Both source and GitHub changed: $file. No files overwritten. Ask to merge these edits." }
}
Run-Git -Arguments @('merge','--ff-only','origin/main') | Out-Host
foreach ($file in $changed) {
    Copy-Item -LiteralPath (Join-Path $target $file) -Destination (Join-Path $root $file) -Force
    Write-Host "Preserved remote update in main source: $file"
}
