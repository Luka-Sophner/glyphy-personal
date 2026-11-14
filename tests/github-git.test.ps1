$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Write-Host 'Windows authentication policy test requires Windows.'; return }
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$verification = Join-Path $project '.verification'
$fixture = Join-Path $verification ('git-policy-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
. (Join-Path $project 'scripts/github-git.ps1')
$names = @('GIT_TERMINAL_PROMPT','GCM_INTERACTIVE','GCM_CREDENTIAL_STORE','GCM_TRACE','GCM_TRACE_SECRETS','GIT_TRACE','GIT_TRACE_CURL','GIT_TRACE_CURL_NO_DATA','GIT_CURL_VERBOSE','GIT_TRACE_PACKET','GIT_TRACE2','GIT_TRACE2_EVENT','GIT_TRACE2_PERF')
$before = @{}
foreach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    # A synthetic executable; no live service, vault or credential lookup is used.
    $script:GlyphyGitExecutable = Join-Path $fixture 'git-policy.cmd'
    $record = Join-Path $fixture 'arguments.txt'
    [IO.File]::WriteAllText($script:GlyphyGitExecutable, "@echo off`r`necho %* > `"$record`"`r`nif not `"%GCM_TRACE%`"==`"0`" exit /b 19`r`nif not `"%GCM_CREDENTIAL_STORE%`"==`"wincredman`" exit /b 20`r`necho " + ('0' * 40) + "`trefs/heads/main`r`nexit /b 0`r`n", [Text.Encoding]::ASCII)
    $refs = @(Invoke-GlyphyGit -Arguments @('ls-remote','--exit-code','origin','refs/heads/main') -Network)
    if ($refs.Count -ne 1) { throw 'Expected the main reference.' }
    $arguments = [IO.File]::ReadAllText($record)
    foreach ($expected in @('credential.helper=', 'credential.helper=manager','credential.credentialStore=wincredman','credential.https://github.com.username=Luka-Sophner')) {
        if (-not $arguments.Contains($expected)) { throw 'Missing scoped authentication policy.' }
    }
    foreach ($name in $names) { if ([Environment]::GetEnvironmentVariable($name, 'Process') -ne $before[$name]) { throw "Environment was not restored: $name" } }
    Write-Host 'PASS: scoped helper, account, Windows Vault and environment restoration'
    [IO.File]::WriteAllText($script:GlyphyGitExecutable, "@echo off`r`necho synthetic-sensitive-diagnostic 1>&2`r`nexit /b 128`r`n", [Text.Encoding]::ASCII)
    $caught = $false
    try { Invoke-GlyphyGit -Arguments @('ls-remote','origin') -Network | Out-Null }
    catch {
        $caught = $true
        if ($_.Exception.Message -match 'synthetic-sensitive-diagnostic') { throw 'Raw transport diagnostics escaped.' }
    }
    if (-not $caught) { throw 'Expected a transport failure.' }
    foreach ($name in $names) { if ([Environment]::GetEnvironmentVariable($name, 'Process') -ne $before[$name]) { throw "Failure did not restore environment: $name" } }
    Write-Host 'PASS: transport failure suppresses private diagnostics and restores environment'
} finally {
    $full = [IO.Path]::GetFullPath($fixture)
    if (-not $full.StartsWith($verification + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup path.' }
    if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Recurse -Force }
}
