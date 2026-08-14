param(
  [Parameter(Mandatory=$true)][string]$EncryptedBackup,
  [Parameter(Mandatory=$true)][string]$KeyFile,
  [string]$PersistTo
)

$ErrorActionPreference = 'Stop'
$resolvedBackup = (Resolve-Path -LiteralPath $EncryptedBackup).Path
$resolvedKey = (Resolve-Path -LiteralPath $KeyFile).Path
$scriptPath = Join-Path $PSScriptRoot 'restore_backup.mjs'
$commandArgs = @($scriptPath, '--encrypted', $resolvedBackup, '--key-file', $resolvedKey)
if ($PersistTo) { $commandArgs += @('--persist-to', [System.IO.Path]::GetFullPath($PersistTo)) }
& node @commandArgs
if ($LASTEXITCODE -ne 0) { throw 'Local D1 restore verification failed' }
