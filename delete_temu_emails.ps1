$commands = Get-Content "delete_commands.txt"
foreach ($cmd in $commands) {
    Write-Host "Ejecutando: $cmd"
    & $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error en comando: $cmd" -ForegroundColor Red
    }
}
Write-Host "Proceso completado."