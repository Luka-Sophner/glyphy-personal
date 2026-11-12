$ErrorActionPreference = 'Stop'
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required (already used by Glyphy). Java is NOT required.' }
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = 'Select Glyphy-signing-backup.encrypted.json from the downloaded ZIP'
    $dialog.Filter = 'Encrypted Glyphy key|*.encrypted.json'
    if ($dialog.ShowDialog() -ne 'OK') { exit 0 }
    $secure = Read-Host 'Enter the SAME password stored in ANDROID_KEYSTORE_PASSWORD on GitHub' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $env:ANDROID_KEYSTORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        & node (Join-Path $PSScriptRoot 'signing-backup.mjs') clipboard $dialog.FileName
        if ($LASTEXITCODE -ne 0) { throw 'Cannot decrypt key. Check your password and backup file.' }
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        Remove-Item Env:\ANDROID_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
        $secure.Dispose()
    }
    Write-Host 'Open repository > Settings > Secrets and variables > Actions > New repository secret.'
    Write-Host 'Name: ANDROID_KEYSTORE_BASE64. Paste clipboard into Secret, then click Add secret.'
    Read-Host 'After saving the secret press Enter to clear clipboard'
    Set-Clipboard -Value ''
    Write-Host 'Keep the encrypted backup and password safely. Setup is complete.'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
