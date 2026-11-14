$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$verification = Join-Path $project '.verification'
$fixture = Join-Path $verification ('upload-test-' + [Guid]::NewGuid().ToString('N'))
$repo = Join-Path $fixture 'GitHub-Glyphy'
$realGit = (Get-Command git -CommandType Application | Select-Object -First 1).Source
$shell = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { (Get-Command powershell.exe).Source } else { (Get-Process -Id $PID).Path }
$utf8 = New-Object Text.UTF8Encoding($false)
function Write-Fixture([string]$Name, [string]$Content) {
    $file = Join-Path $fixture $Name
    New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null
    [IO.File]::WriteAllText($file, $Content, $utf8)
}
function Git-Fixture([string[]]$Arguments) {
    $value = & $realGit -C $repo @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Fixture Git failed.' }
    return $value
}
try {
    foreach ($directory in @('src','scripts','tests')) { New-Item -ItemType Directory -Path (Join-Path $fixture $directory) -Force | Out-Null }
    foreach ($name in @('github-upload.ps1','sync-github.ps1')) { Copy-Item -LiteralPath (Join-Path $project "scripts/$name") -Destination (Join-Path $fixture "scripts/$name") }
    # Only transport is mocked. Git status, diff, origin validation and worktree checks use real Git.
    $mock = @'
$script:GlyphyGitAccount = 'Luka-Sophner'
function Initialize-GlyphyGit {}
function Show-GlyphyGit {}
function Invoke-GlyphyGit {
    param([string]$Repository, [string[]]$Arguments, [switch]$Network, [switch]$Interactive)
    $root = Split-Path -Parent $PSScriptRoot
    Add-Content -LiteralPath (Join-Path $root 'calls.jsonl') -Value (ConvertTo-Json -Compress -InputObject @{Args=$Arguments;Network=$Network.IsPresent})
    if ($Arguments[0] -in @('push','commit','add')) { throw 'Unexpected mutation before upload approval.' }
    if ($Arguments[0] -eq 'fetch') {
        if (Test-Path -LiteralPath (Join-Path $root 'fail-fetch')) { throw 'Synthetic fetch failure.' }
        $global:LASTEXITCODE=0
        return
    }
    if ($Arguments[0] -eq 'ls-remote') {
        $global:LASTEXITCODE=0
        return ('0' * 40) + "`trefs/heads/main"
    }
    & '__GIT__' -C $Repository @Arguments
}
function Assert-GlyphyOrigin([string]$Repository) {
    $origin = Invoke-GlyphyGit -Repository $Repository -Arguments @('remote','get-url','origin')
    if ($origin -ne 'https://github.com/Luka-Sophner/glyphy-personal.git') { throw 'Unexpected fixture origin.' }
}
'@
    Write-Fixture 'scripts/github-git.ps1' ($mock.Replace('__GIT__', $realGit.Replace("'", "''")))
    Write-Fixture 'package.json' '{"source":"new source must not overwrite prepared work"}'
    Write-Fixture 'GitHub-Glyphy/package.json' '{"prepared":"base"}'
    Write-Fixture 'GitHub-Glyphy/.glyphy-snapshot.json' '["package.json"]'
    Git-Fixture @('init','-b','main') | Out-Null
    Git-Fixture @('config','user.name','Fixture') | Out-Null
    Git-Fixture @('config','user.email','fixture@example.invalid') | Out-Null
    Git-Fixture @('config','core.autocrlf','false') | Out-Null
    Git-Fixture @('add','.') | Out-Null
    Git-Fixture @('commit','-m','base') | Out-Null
    Git-Fixture @('remote','add','origin','https://github.com/Luka-Sophner/glyphy-personal.git') | Out-Null
    Git-Fixture @('update-ref','refs/remotes/origin/main','HEAD') | Out-Null
    Write-Fixture 'GitHub-Glyphy/package.json' '{"prepared":"independent uncommitted Desktop edit"}'
    $before = (Get-FileHash -LiteralPath (Join-Path $repo 'package.json')).Hash
    $index = (Get-FileHash -LiteralPath (Join-Path $repo '.git/index')).Hash
    foreach ($mode in @('-CheckConnection', '-Push', 'fetch-failure')) {
        if ($mode -eq 'fetch-failure') { Write-Fixture 'fail-fetch' '1' }
        $argument = if ($mode -eq 'fetch-failure') { '-Push' } else { $mode }
        $oldPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $output = @('') | & $shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $fixture 'scripts/github-upload.ps1') $argument 2>&1
        $code = $LASTEXITCODE
        $ErrorActionPreference = $oldPreference
        if ($mode -eq 'fetch-failure') {
            if ($code -eq 0 -or ($output -join "`n") -notmatch 'Synthetic fetch failure') { throw 'Fetch failure was not propagated.' }
        } elseif ($code -ne 0) { throw "Mode $mode failed: $($output -join ' ')" }
        if ((Get-FileHash -LiteralPath (Join-Path $repo 'package.json')).Hash -ne $before -or (Get-FileHash -LiteralPath (Join-Path $repo '.git/index')).Hash -ne $index) { throw 'Prepared content or index was changed.' }
        Write-Host "PASS: $mode preserves prepared edits and index"
    }
    $calls = @(Get-Content -LiteralPath (Join-Path $fixture 'calls.jsonl') | ForEach-Object { $_ | ConvertFrom-Json })
    if (@($calls | Where-Object { $_.Args[0] -in @('push','commit','add') }).Count) { throw 'Unexpected mutation was attempted.' }
    if (@($calls | Where-Object { $_.Args[0] -eq 'fetch' -and $_.Network }).Count -ne 2) { throw 'Both upload attempts must fetch before continuing.' }
    Write-Host 'PASS: check is read-only; upload cancellation and failed fetch never stage, commit or push'
} finally {
    $full = [IO.Path]::GetFullPath($fixture)
    if (-not $full.StartsWith($verification + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup path.' }
    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Recurse -Force }
}
