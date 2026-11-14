# One Git executable and one explicit authentication policy for all upload commands.
# Dot-source this file. Credentials stay inside Git Credential Manager / Windows Vault.
$script:GlyphyGitExecutable = $null
$script:GlyphyGitAccount = 'Luka-Sophner'

function Initialize-GlyphyGit {
    if ($script:GlyphyGitExecutable) { return }
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'Git/cmd/git.exe' }
    if (${env:ProgramFiles(x86)}) { $candidates += Join-Path ${env:ProgramFiles(x86)} 'Git/cmd/git.exe' }
    if ($env:LOCALAPPDATA) {
        $desktopRoot = Join-Path $env:LOCALAPPDATA 'GitHubDesktop'
        if (Test-Path -LiteralPath $desktopRoot) {
            $candidates += @(Get-ChildItem -LiteralPath $desktopRoot -Directory -Filter 'app-*' |
                Sort-Object { try { [version]$_.Name.Substring(4) } catch { [version]'0.0' } } -Descending |
                ForEach-Object { Join-Path $_.FullName 'resources/app/git/cmd/git.exe' })
        }
    }
    $command = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { $candidates += $command.Source }
    $script:GlyphyGitExecutable = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (-not $script:GlyphyGitExecutable) { throw 'Git is missing. Install Git for Windows with Git Credential Manager.' }
}

function Invoke-GlyphyGit {
    param([string]$Repository, [string[]]$Arguments, [switch]$Network, [switch]$Interactive)
    Initialize-GlyphyGit
    $options = @()
    $windows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
    if ($Network) {
        if (-not $windows) { throw 'Authenticated upload is supported on Windows with Git Credential Manager.' }
        # Clear inherited helpers for this command only: never fall back to a different account or plaintext store.
        $options = @('-c', 'credential.helper=', '-c', 'credential.helper=manager',
            '-c', 'credential.credentialStore=wincredman',
            '-c', ('credential.https://github.com.username=' + $script:GlyphyGitAccount))
    }
    if ($Repository) { $options += @('-C', $Repository) }
    if (-not $Network) {
        & $script:GlyphyGitExecutable @options @Arguments
        return
    }
    $environment = @{
        GIT_TERMINAL_PROMPT = '0'; GCM_INTERACTIVE = $(if ($Interactive) { '1' } else { '0' })
        GCM_CREDENTIAL_STORE = 'wincredman'; GCM_TRACE = '0'; GCM_TRACE_SECRETS = '0'
        GIT_TRACE = '0'; GIT_TRACE_CURL = '0'; GIT_TRACE_CURL_NO_DATA = '1'; GIT_CURL_VERBOSE = '0'
        GIT_TRACE_PACKET = '0'; GIT_TRACE2 = '0'; GIT_TRACE2_EVENT = '0'; GIT_TRACE2_PERF = '0'
    }
    $previous = @{}
    $previousPreference = $ErrorActionPreference
    try {
        foreach ($name in $environment.Keys) {
            $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $environment[$name], 'Process')
        }
        # Capture stderr as well. Never echo raw authentication output or a credential response.
        $ErrorActionPreference = 'Continue'
        $output = @(& $script:GlyphyGitExecutable @options @Arguments 2>&1)
        $code = $LASTEXITCODE
        $ErrorActionPreference = $previousPreference
        if ($code -ne 0) {
            $detail = $output -join "`n"
            if ($detail -match 'Failed to connect|Could not resolve|proxy|ECONNREFUSED|Connection timed out|unable to connect') {
                throw 'Network connection to GitHub failed. Check the network/proxy. Authentication was not verified; no project files were changed.'
            }
            if ($detail -match 'Repository not found|Authentication failed|terminal prompts disabled|could not read Username|could not read Password|user cancelled|not authorized') {
                throw "GitHub access failed for $script:GlyphyGitAccount. GitHub Desktop uses a separate sign-in. Run send-github-update.bat --login, choose this account and grant repository access, then run --check. No source files were changed."
            }
            if ($detail -match 'credential-manager.*not a git command|credential-manager.*not found') {
                throw 'Git Credential Manager is missing from the selected Git installation. Repair Git for Windows, including Git Credential Manager.'
            }
            throw "GitHub operation failed (exit $code). Raw authentication output was suppressed. No upload confirmation was bypassed."
        }
        # Only ls-remote refs are useful to callers. Fetch/push/login output stays private.
        if ($Arguments[0] -eq 'ls-remote') {
            $output | Where-Object { "$_" -match '^[a-f0-9]{40,64}\s+refs/heads/main$' } | ForEach-Object { "$_" }
        }
    } finally {
        $ErrorActionPreference = $previousPreference
        foreach ($name in $previous.Keys) {
            if ($null -eq $previous[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
            else { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
        }
    }
}

function Assert-GlyphyOrigin([string]$Repository) {
    $origin = Invoke-GlyphyGit -Repository $Repository -Arguments @('remote', 'get-url', 'origin')
    if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^https://github\.com/Luka-Sophner/glyphy-personal(?:\.git)?/?$') {
        throw 'Unexpected origin. Expected the HTTPS Luka-Sophner/glyphy-personal repository. No remote address was changed.'
    }
}

function Show-GlyphyGit {
    Initialize-GlyphyGit
    Write-Host "Git: $script:GlyphyGitExecutable"
    & $script:GlyphyGitExecutable --version
    Write-Host "GitHub account: $script:GlyphyGitAccount"
    Write-Host 'Authentication: Git Credential Manager, Windows Credential Vault. GitHub Desktop sign-in is separate.'
}
