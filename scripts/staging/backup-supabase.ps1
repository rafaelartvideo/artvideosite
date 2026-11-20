#requires -Version 7
<#
  Usage (from repo root):
    pwsh -File scripts/staging/backup-supabase.ps1 -Mode Schema
    pwsh -File scripts/staging/backup-supabase.ps1 -Mode Full -UploadEncrypted
  Only executes pg_dump/Supabase CLI reads on production.
  Full data NEVER goes to GitHub/staging and requires encrypted R2 remote.
#>
[CmdletBinding()]
param(
  [ValidateSet("Schema","Full")] [string]$Mode="Schema",
  [string]$BackupRoot="C:\UnionBackup\crm-database",
  [switch]$UploadEncrypted
)
Set-StrictMode -Version Latest
$ErrorActionPreference="Stop"
$projectRef = "wmjmtcjpunmzvonlkjcu"
$dbUrl = [Environment]::GetEnvironmentVariable("UNION_PROD_DATABASE_URL")
if ([string]::IsNullOrWhiteSpace($dbUrl)) {
  throw "Configure UNION_PROD_DATABASE_URL localmente; nunca inclua URLs com senhas no Git."
}
if ($dbUrl -notmatch [regex]::Escape($projectRef)) {
  throw "A conexão não aponta explicitamente para o projeto CRM esperado. Backup cancelado."
}
if ($dbUrl -notmatch '^postgres(ql)?://') {
  throw "UNION_PROD_DATABASE_URL precisa ser uma conexão PostgreSQL."
}
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Instale Supabase CLI v3 e confirme com supabase --version e supabase db dump --help."
}
$remote = [Environment]::GetEnvironmentVariable("UNION_BACKUP_CRYPT_REMOTE")
if ($Mode -eq "Full" -and -not $UploadEncrypted) {
  throw "Backup de dados exige -UploadEncrypted para um remote rclone crypt independente."
}
if ($UploadEncrypted) {
  if ([string]::IsNullOrWhiteSpace($remote) -or $remote -notmatch '^[A-Za-z][A-Za-z0-9_-]*:$') {
    throw "Configure UNION_BACKUP_CRYPT_REMOTE, por exemplo union-crm-crypt:"
  }
  if ([Environment]::GetEnvironmentVariable("UNION_BACKUP_CRYPT_CONFIRMED") -ne "SIM") {
    throw "Confirme que o remote é do tipo crypt (UNION_BACKUP_CRYPT_CONFIRMED=SIM)."
  }
  if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) {
    throw "rclone não encontrado."
  }
}
$stamp=(Get-Date -Format "yyyyMMdd-HHmmss")
$run=Join-Path $BackupRoot "crm-$stamp"
New-Item -ItemType Directory -Path $run -Force | Out-Null
$successful=$false
try {
  function Export-Supabase([string]$filename,[string[]]$options) {
    $target=Join-Path $run $filename
    & supabase db dump "--remote=$dbUrl" -f $target @options
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $target) -or (Get-Item $target).Length -eq 0) {
      throw "Falha no dump $filename. Não utilize o backup incompleto."
    }
    Write-Host "Arquivo verificado: $filename"
  }
  Export-Supabase "schema.sql" @()
  Export-Supabase "roles.sql" @("--role-only")
  Export-Supabase "history-schema.sql" @("--schema","supabase_migrations")
  Export-Supabase "history-data.sql" @("--schema","supabase_migrations","--data-only","--use-copy")
  if ($Mode -eq "Full") {
    Export-Supabase "data.sql" @("--data-only","--use-copy","-x","storage.buckets_vectors","-x","storage.vector_indexes")
  }
  $sql=Get-ChildItem -LiteralPath $run -Filter "*.sql"
  $manifest=[ordered]@{
    generated_at_utc=(Get-Date).ToUniversalTime().ToString("o")
    project_ref=$projectRef
    backup_kind=$Mode
    purpose="Backup offline criptografado; NAO importar dados reais em homologacao"
    sql=@($sql | ForEach-Object {
      @{name=$_.Name;bytes=$_.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash}
    })
  }
  $manifest | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $run "manifest.json") -Encoding utf8
  $zip="$run.zip"
  Compress-Archive -Path (Join-Path $run "*") -DestinationPath $zip -CompressionLevel Optimal
  $hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash
  Write-Host "Backup ZIP criado. SHA-256: $hash"
  if ($UploadEncrypted) {
    $destination="$remote" + "union-crm/$stamp.zip"
    & rclone copyto $zip $destination --retries 2
    if ($LASTEXITCODE -ne 0) { throw "Falha no envio criptografado. Arquivos locais preservados." }
    $verifyDir=Join-Path $BackupRoot "verify-$stamp"
    New-Item -ItemType Directory -Path $verifyDir | Out-Null
    try {
      $verifyFile=Join-Path $verifyDir "readback.zip"
      & rclone copyto $destination $verifyFile --retries 2
      if ($LASTEXITCODE -ne 0) { throw "Falha na leitura de volta do backup remoto." }
      $verifyHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $verifyFile).Hash
      if ($hash -ne $verifyHash) { throw "Hash do download difere do backup. Não apagar arquivos locais." }
      Write-Host "Backup remoto validado por download e SHA-256."
    } finally { Remove-Item -LiteralPath $verifyDir -Force -Recurse -ErrorAction SilentlyContinue }
    if ($Mode -eq "Full") {
      # Only delete local plaintext after verified encrypted upload.
      Remove-Item -LiteralPath $run -Force -Recurse
      Remove-Item -LiteralPath $zip -Force
      Write-Host "Dados locais temporários removidos após validação; manter o remote protegido."
    }
  } else {
    Write-Warning "Arquivo ZIP LOCAL NÃO É CRIPTOGRAFADO. Guarde em pasta privada e nunca envie para Git."
  }
  $successful=$true
} finally {
  if (-not $successful) {
    Write-Warning "Backup incompleto/sem validação. Arquivos parciais podem conter dados sensíveis: proteger e revisar $run"
  }
}
