param(
  [string]$DevVars,
  [string]$RecoveryDirectory,
  [switch]$RotateMissingBackupKey
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $DevVars) { $DevVars = Join-Path $projectRoot 'workers\api\.dev.vars' }
if (-not $RecoveryDirectory) {
  $RecoveryDirectory = Join-Path (Split-Path $projectRoot -Parent) 'Personal_OS_Recovery'
}

$devVarsPath = (Resolve-Path -LiteralPath $DevVars).Path
$RecoveryDirectory = [System.IO.Path]::GetFullPath($RecoveryDirectory)
[System.IO.Directory]::CreateDirectory($RecoveryDirectory) | Out-Null
$content = [System.IO.File]::ReadAllText($devVarsPath, [System.Text.Encoding]::UTF8)

function Read-Secret([string]$Name) {
  $pattern = '(?m)^' + [regex]::Escape($Name) + '=(.*)$'
  $match = [regex]::Match($script:content, $pattern)
  if (-not $match.Success) { return $null }
  return $match.Groups[1].Value.Trim()
}

function Write-Secret([string]$Name, [string]$Value) {
  $pattern = '(?m)^' + [regex]::Escape($Name) + '=.*$'
  if ([regex]::IsMatch($script:content, $pattern)) {
    $script:content = [regex]::Replace($script:content, $pattern, $Name + '=' + $Value)
  } else {
    $separator = if ($script:content.EndsWith("`n")) { '' } else { [Environment]::NewLine }
    $script:content += $separator + $Name + '=' + $Value + [Environment]::NewLine
  }
  [System.IO.File]::WriteAllText($script:devVarsPath, $script:content, [System.Text.UTF8Encoding]::new($false))
}

function Read-ProtectedSecret([string]$Path) {
  if (-not [System.IO.File]::Exists($Path)) { return $null }
  $protected = [System.IO.File]::ReadAllBytes($Path)
  $clear = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protected,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  return [System.Text.Encoding]::UTF8.GetString($clear)
}

function New-RecoverySecret {
  $random = [byte[]]::new(32)
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($random) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($random)
}

$fieldKey = Read-Secret 'FIELD_ENCRYPTION_SECRET'
if (-not $fieldKey) {
  $fieldKey = New-RecoverySecret
  Write-Secret 'FIELD_ENCRYPTION_SECRET' $fieldKey
}

$backupKey = Read-Secret 'BACKUP_ENCRYPTION_KEY'
if (-not $backupKey) {
  try { $backupKey = Read-ProtectedSecret (Join-Path $RecoveryDirectory 'backup-key.dpapi') }
  catch {
    if (-not $RotateMissingBackupKey) { throw }
    $backupKey = $null
  }
  if (-not $backupKey -and $RotateMissingBackupKey) { $backupKey = New-RecoverySecret }
  if ($backupKey) { Write-Secret 'BACKUP_ENCRYPTION_KEY' $backupKey }
}

$secrets = @{
  'backup-key.dpapi' = $backupKey
  'field-key.dpapi' = $fieldKey
}

foreach ($entry in $secrets.GetEnumerator()) {
  if (-not $entry.Value) { throw "Missing secret required for $($entry.Key)" }
  $decoded = [Convert]::FromBase64String($entry.Value)
  if ($decoded.Length -ne 32) { throw "Invalid 32-byte recovery secret for $($entry.Key)" }
  $clear = [System.Text.Encoding]::UTF8.GetBytes($entry.Value)
  $protected = [System.Security.Cryptography.ProtectedData]::Protect(
    $clear,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  [System.IO.File]::WriteAllBytes((Join-Path $RecoveryDirectory $entry.Key), $protected)
}

Write-Output 'Protected recovery material refreshed without exposing plaintext secrets.'
