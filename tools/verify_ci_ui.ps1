$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$runDir = Join-Path $tempRoot ('game-toolbox-ci-' + [guid]::NewGuid().ToString('N'))
$service = $null
$browser = $null

function Get-FreePort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return $listener.LocalEndpoint.Port } finally { $listener.Stop() }
}

function Wait-Http($url) {
    for ($i = 0; $i -lt 100; $i++) {
        if ($service -and $service.HasExited) { throw '隔离服务意外退出' }
        try { return Invoke-RestMethod -Uri $url -TimeoutSec 1 } catch { Start-Sleep -Milliseconds 200 }
    }
    throw "服务未就绪：$url"
}

# 关掉浏览器并等它的子进程都退出，否则临时配置里的文件还被占着、删不干净。
function Stop-Browser($process) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 50; $i++) {
        $alive = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($runDir) })
        if ($alive.Count -eq 0) { return }
        $alive | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Milliseconds 200
    }
}

try {
    New-Item -ItemType Directory -Path $runDir | Out-Null
    # 工具箱是静态站点（后端在浏览器里，存档在临时浏览器配置里），用 node 起静态服务。
    $node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
    if (-not $node) { throw '找不到 Node.js' }
    $port = Get-FreePort
    $service = Start-Process -FilePath $node -WorkingDirectory $workspace -WindowStyle Hidden -PassThru -ArgumentList @('tools/serve.mjs', $port)
    $null = Wait-Http "http://127.0.0.1:$port/app/registry.json"
    # 窗口大小要写明：无界面 Chrome 默认只有 758 宽，会落进手机布局（760 及以下）。
    # 优先 Chrome，没有再用 Edge。用无界面模式（--headless=new）：有窗口但被挡住或隐藏时，
    # 浏览器会暂停动画，侧栏收起这类等过渡结束的检查会一直等下去。
    $browserExe = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (-not $browserExe) { throw '找不到 Chrome 或 Edge' }
    Write-Host "[OK] 验收浏览器：$browserExe"

    foreach ($test in @('verify_redesign_ui.mjs', 'verify_team_ui.mjs', 'verify_local_state.mjs')) {
        $debug = Get-FreePort
        $profile = Join-Path $runDir ('profile-' + $test)
        $browser = Start-Process -FilePath $browserExe -WindowStyle Hidden -PassThru -ArgumentList @('--headless=new', '--disable-gpu', '--window-size=1280,900', "--remote-debugging-port=$debug", "--user-data-dir=`"$profile`"", 'about:blank')
        $null = Wait-Http "http://127.0.0.1:$debug/json/list"
        $argsForTest = @((Join-Path $PSScriptRoot $test), $port, $debug)
        if ($test -eq 'verify_team_ui.mjs') {
            $argsForTest += @((Join-Path $runDir 'screenshots'))
        }
        & node @argsForTest
        if ($LASTEXITCODE -ne 0) { throw "浏览器检查失败：$test" }
        Stop-Browser $browser
        $browser = $null
    }
} finally {
    if ($browser) { Stop-Browser $browser }
    if ($service) { Stop-Process -Id $service.Id -Force -ErrorAction SilentlyContinue }
    $resolved = [IO.Path]::GetFullPath($runDir)
    if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -match '^game-toolbox-ci-[a-f0-9]{32}$' -and (Test-Path -LiteralPath $resolved)) {
        Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
    }
}
