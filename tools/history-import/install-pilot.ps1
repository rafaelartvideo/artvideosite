$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$stage = 'preparar arquivos'
$temp = $null
try {
    $files = @('archive-contract.mjs','archive-store.mjs','archive-gateway.mjs','preflight.mjs','archive-store.test.mjs','history-page.mjs','history-page.test.mjs','install-pilot.sh')
    foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) { throw 'Arquivo do pacote ausente' }
    }
    $temp = Join-Path ([IO.Path]::GetTempPath()) ('union-history-'+[Guid]::NewGuid().ToString('N')+'.tar.gz')
    & tar.exe -czf $temp -C $PSScriptRoot @files
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compactar' }
    $encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes($temp))
    $remote = @'
set -euo pipefail
umask 077
D=$(mktemp -d /root/union-history-pilot.XXXXXXXX)
trap 'rm -rf -- "$D"' EXIT
tr -d '\r\n' | base64 -d > "$D/source.tar.gz"
tar -xzf "$D/source.tar.gz" -C "$D" --no-same-owner --no-same-permissions
bash "$D/install-pilot.sh"
'@
    $script64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($remote -replace [string][char]13, '')))
    $command = "bash -c 'source <(printf %s $script64 | base64 -d)'"
    $stage = 'validacao e instalacao na VPS'
    Write-Host 'UNION WORLD | INSTALACAO ISOLADA DO IMPORTADOR'
    Write-Host 'Informe a senha SSH quando solicitada. Nenhuma chave do R2 sera exibida.'
    $encoded | & ssh.exe -T -p 22022 root@108.174.149.95 $command
    if ($LASTEXITCODE -ne 0) { throw 'Instalacao nao confirmada' }
    Write-Host 'ETAPA CONCLUIDA: servico piloto local validado.'
} catch {
    Write-Host ('FALHA SEGURA na etapa: ' + $stage) -ForegroundColor Red
    Write-Host 'Envie apenas o resumo seguro da falha, sem chaves ou configuracoes.'
    exit 1
} finally {
    if ($temp -and (Test-Path -LiteralPath $temp)) { Remove-Item -LiteralPath $temp -Force }
}
