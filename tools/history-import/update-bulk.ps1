$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$temp = $null
try {
    $files = @('archive-contract.mjs','archive-store.mjs','archive-gateway.mjs','archive-media.mjs','archive-media.test.mjs','preflight.mjs','archive-store.test.mjs','history-page.mjs','history-page.test.mjs','build-bulk-manifest.mjs','update-bulk.sh','public.jwt')
    foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) { throw "Arquivo ausente: $file" }
    }
    $temp = Join-Path ([IO.Path]::GetTempPath()) ('union-history-bulk-'+[Guid]::NewGuid().ToString('N')+'.tar.gz')
    & tar.exe -czf $temp -C $PSScriptRoot @files
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compactar' }
    $encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes($temp))
    $remote = @'
set -euo pipefail
umask 077
D=$(mktemp -d /root/union-history-bulk.XXXXXXXX)
trap 'rm -rf -- "$D"' EXIT
tr -d '\r\n' | base64 -d > "$D/source.tar.gz"
tar -xzf "$D/source.tar.gz" -C "$D" --no-same-owner --no-same-permissions
bash "$D/update-bulk.sh"
'@
    $script64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($remote -replace [string][char]13, '')))
    $command = "bash -c 'source <(printf %s $script64 | base64 -d)'"
    Write-Host 'UNION WORLD | ATUALIZACAO DO MOTOR DE IMPORTACAO'
    Write-Host 'Informe a senha SSH somente quando solicitada pelo terminal.'
    $encoded | & ssh.exe -T -p 22022 root@108.174.149.95 $command
    if ($LASTEXITCODE -ne 0) { throw 'Instalacao nao confirmada' }
    Write-Host 'ETAPA CONCLUIDA: worker atualizado. Nenhuma importacao iniciada.'
} catch {
    Write-Host ('FALHA SEGURA: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($temp -and (Test-Path -LiteralPath $temp)) { Remove-Item -LiteralPath $temp -Force }
}
