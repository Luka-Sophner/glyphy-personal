$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$verification = Join-Path $project '.verification'
$fixture = Join-Path $verification ('sync-test-' + [Guid]::NewGuid().ToString('N'))
$sync = Join-Path $project 'scripts/sync-github.ps1'
$utf8 = New-Object Text.UTF8Encoding($false)
function Git-Test([string[]]$Arguments) {
    $result = & git -C $repo @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Fixture Git failed: $($Arguments -join ' ')" }
    return $result
}
function Write-TestFile([string]$Path, [string]$Text) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $Path) -Force | Out-Null
    [IO.File]::WriteAllText($Path, $Text, $utf8)
}
try {
    foreach ($scenario in @('fast-forward', 'source-conflict', 'dirty-copy', 'diverged')) {
        $root = Join-Path $fixture $scenario
        $repo = Join-Path $root 'GitHub-Glyphy'
        $relative = '.github/workflows/build-android.yml'
        $source = Join-Path $root $relative
        $copy = Join-Path $repo $relative
        Write-TestFile $source "base`n"
        Write-TestFile $copy "base`n"
        Write-TestFile (Join-Path $repo '.glyphy-snapshot.json') '[".github/workflows/build-android.yml"]'
        Git-Test @('init', '-b', 'main') | Out-Null
        Git-Test @('config', 'user.name', 'Fixture') | Out-Null
        Git-Test @('config', 'user.email', 'fixture@example.invalid') | Out-Null
        Git-Test @('config', 'core.autocrlf', 'false') | Out-Null
        Git-Test @('add', '.') | Out-Null
        Git-Test @('commit', '-m', 'base') | Out-Null
        $base = Git-Test @('rev-parse', 'HEAD')
        Git-Test @('remote', 'add', 'origin', 'https://github.com/Luka-Sophner/glyphy-personal.git') | Out-Null
        Write-TestFile $copy "remote`n"
        Git-Test @('commit', '-am', 'remote') | Out-Null
        $remote = Git-Test @('rev-parse', 'HEAD')
        Git-Test @('update-ref', 'refs/remotes/origin/main', $remote) | Out-Null
        # Only this newly generated fixture is reset; no project repository is changed.
        Git-Test @('reset', '--hard', $base) | Out-Null
        if ($scenario -eq 'source-conflict') { Write-TestFile $source "local-source`n" }
        if ($scenario -eq 'dirty-copy') { Write-TestFile $copy "local-copy`n" }
        if ($scenario -eq 'diverged') {
            Write-TestFile $copy "local-commit`n"
            Git-Test @('commit', '-am', 'local') | Out-Null
        }
        $before = Git-Test @('rev-parse', 'HEAD')
        $sourceBefore = [IO.File]::ReadAllText($source)
        $copyBefore = [IO.File]::ReadAllText($copy)
        $failed = $false
        try { & $sync -ProjectRoot $root } catch { $failed = $true }
        if ($scenario -eq 'fast-forward') {
            if ($failed -or (Git-Test @('rev-parse', 'HEAD')) -ne $remote -or [IO.File]::ReadAllText($source) -ne "remote`n") { throw 'Fast-forward did not preserve the remote workflow.' }
        } else {
            if (-not $failed -or (Git-Test @('rev-parse', 'HEAD')) -ne $before -or [IO.File]::ReadAllText($source) -ne $sourceBefore -or [IO.File]::ReadAllText($copy) -ne $copyBefore) { throw "Unsafe synchronization: $scenario" }
        }
        Write-Host "PASS: $scenario"
    }
} finally {
    $resolvedFixture = [IO.Path]::GetFullPath($fixture)
    if (-not $resolvedFixture.StartsWith($verification + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup path.' }
    if (Test-Path -LiteralPath $resolvedFixture) { Remove-Item -LiteralPath $resolvedFixture -Recurse -Force }
}
