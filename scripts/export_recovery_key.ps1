param(
  [Parameter(Mandatory=$true)][string]$ProtectedKey,
  [Parameter(Mandatory=$true)][string]$OutputKey
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$protectedPath = (Resolve-Path -LiteralPath $ProtectedKey).Path
$protectedBytes = [System.IO.File]::ReadAllBytes($protectedPath)
$clearBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
  $protectedBytes,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
$base64Key = [System.Text.Encoding]::UTF8.GetString($clearBytes)
$decoded = [Convert]::FromBase64String($base64Key)
if ($decoded.Length -ne 32) { throw 'Protected recovery key is invalid' }

$outputPath = [System.IO.Path]::GetFullPath($OutputKey)
[System.IO.File]::WriteAllText($outputPath, $base64Key, [System.Text.UTF8Encoding]::new($false))
Write-Output "Recovery key exported to $outputPath"
Write-Output 'Delete the plaintext key immediately after restore or password-manager import.'
