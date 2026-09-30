$ErrorActionPreference = 'Continue'
$results = @()
$names = @(
  'test:necromancer-foundation', 'test:necromancer-continuation', 'test:necromancer-closure',
  'test:necromancer-finalization', 'test:necromancer-threat-bridge', 'test:necromancer-threat-dependencies',
  'test:ruins-executable-dependencies', 'test:ruins-production-runtime', 'test:ruins-production-executor',
  'test:ruins-final-runtime-blockers', 'test:necromancer-production-threat-full-path',
  'verify:complete-edition-c1c29', 'verify:complete-edition-c1c30', 'verify:complete-edition-c1c31',
  'verify:complete-edition-c1c31r', 'verify:complete-edition-c1c32', 'verify:complete-edition-c1c32r',
  'verify:complete-edition-c1c32r2', 'verify:complete-edition-c1c32r2a', 'verify:complete-edition-c1c32r2b',
  'verify:complete-edition-c1c32r2c', 'verify:complete-edition-c1c32r2c-r'
)
foreach ($name in $names) {
  $logPath = "pw-out/c1c32r3r-$($name.Replace(':','-')).log"
  & npm.cmd run $name *> $logPath
  $result = [ordered]@{ command = "npm run $name"; kind = $(if ($name.StartsWith('verify:')) {'historical-verifier'} else {'focused-regression'}); exitCode = $LASTEXITCODE; log = $logPath }
  $results += $result
  $results | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath 'pw-out/c1c32r3r-regression-observation.json' -Encoding utf8
  Write-Output "$name : $($result.exitCode)"
}
