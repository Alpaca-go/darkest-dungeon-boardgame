param([string]$Manifest = 'docs/data/complete-edition/c1c24-boss-crop-manifest.json')
# Windows OCR drafts are extraction aids, never accepted printed definitions by themselves.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait()
  $task.Result
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en'))
if (!$engine) { throw 'Windows English OCR is unavailable' }
$source = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
$output = @()
foreach ($card in $source.crops) {
  foreach ($side in @('front', 'back')) {
    $crop = $card.$side
    if ($crop.status -ne 'SOURCE_BOUND') { continue }
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path -LiteralPath $crop.path).Path)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $lines = @($result.Lines | ForEach-Object { $_.Text })
    $output += [ordered]@{physicalIdentity=$card.physicalIdentity; cardId=$card.cardId; side=$side; cropPath=$crop.path; cropSha256=$crop.cropSha256; status='UNREVIEWED_OCR_DRAFT'; lines=$lines; text=($lines -join "`n")}
    $bitmap.Dispose(); $stream.Dispose()
  }
  Write-Host ('OCR ' + $card.cardId)
}
$payload = [ordered]@{engine='Windows.Media.Ocr English'; evidenceRole='DRAFT_ONLY_NOT_PRINTED_AUTHORITY'; cards=$output}
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText('docs/data/complete-edition/c1c24-boss-ocr-drafts.json', ($json.Replace("`r`n", "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))
